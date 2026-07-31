// lib/referral/service.ts
//
// Serviços do Programa de Indicações. Server-only: toda função recebe o admin
// client (service role) — as tabelas têm RLS ligada e nenhuma policy, então
// este é o único caminho de acesso. A autorização do usuário acontece ANTES,
// na rota/página que chama.
//
// Toda transição de estado é uma RPC atômica (ver a migration
// 20260731000000_referral_program.sql). Nada de leitura-modificação-escrita em
// duas viagens: os webhooks do Stripe chegam repetidos e fora de ordem.
//
// DEGRADAÇÃO: enquanto a migration não estiver aplicada, as RPCs não existem
// (42883) e as tabelas também não (42P01). Nesse estado o programa fica
// INERTE — nenhuma recompensa é concedida e nenhuma rota quebra. É fail-closed
// para benefício e fail-open para disponibilidade, ao contrário do rate limit.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_PERCENT_OFF_PER_INVOICE,
  REFERRAL_BIND_WINDOW_DAYS,
  REFERRER_PERCENT_OFF,
  REWARD_HOLD_DAYS,
} from './config'
import type { RewardRow } from './rewards'

/** Códigos de erro que significam "a migration ainda não foi aplicada". */
const NOT_DEPLOYED = new Set(['42883', '42P01'])

function isNotDeployed(error: { code?: string } | null): boolean {
  return !!error?.code && NOT_DEPLOYED.has(error.code)
}

/** Loga o que não é esperado e engole o que é (migration pendente). */
function warn(scope: string, error: { code?: string; message?: string } | null): void {
  if (!error || isNotDeployed(error)) return
  console.warn(`[referral] ${scope} falhou:`, error.message ?? error)
}

type Json = Record<string, unknown>

async function callRpc(
  admin: SupabaseClient,
  fn: string,
  args: Json,
): Promise<Json | null> {
  const { data, error } = await admin.rpc(fn, args)
  if (error) {
    warn(fn, error)
    return null
  }
  return (data ?? null) as Json | null
}

// ── Código individual ───────────────────────────────────────────────────────

/** Cria (ou devolve) o código de indicação da conta. Null = programa inerte. */
export async function ensureReferralCode(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('ensure_referral_code', { p_user: userId })
  if (error) {
    warn('ensure_referral_code', error)
    return null
  }
  return typeof data === 'string' ? data : null
}

// ── Vínculo ─────────────────────────────────────────────────────────────────

export type BindReason =
  | 'code_missing'
  | 'code_not_found'
  | 'self_referral'
  | 'already_referred'
  | 'profile_not_found'
  | 'account_too_old'
  | 'already_customer'
  | 'duplicate_identity'
  | 'program_closed'
  | 'unavailable'

export interface BindResult {
  ok: boolean
  reason?: BindReason
  referralId?: string
  referrerUserId?: string
}

/**
 * Vincula um código a uma conta. As regras duras (autoindicação, conta já
 * indicada, conta antiga, conta que já foi cliente, email duplicado do próprio
 * indicador) são checadas DENTRO da transação, no banco.
 */
export async function bindReferral(
  admin: SupabaseClient,
  code: string,
  userId: string,
): Promise<BindResult> {
  const data = await callRpc(admin, 'bind_referral', {
    p_code:    code,
    p_user:    userId,
    p_max_age: `${REFERRAL_BIND_WINDOW_DAYS} days`,
  })
  if (!data) return { ok: false, reason: 'unavailable' }
  return {
    ok:             data.ok === true,
    reason:         data.reason as BindReason | undefined,
    referralId:     data.referral_id as string | undefined,
    referrerUserId: data.referrer_user_id as string | undefined,
  }
}

/** Indicação vinculada e ainda não usada — o que habilita os 10% no checkout. */
export async function getPendingReferral(
  admin: SupabaseClient,
  userId: string,
): Promise<{ id: string; code: string; referrerUserId: string } | null> {
  const { data, error } = await admin
    .from('referrals')
    .select('id, code, referrer_user_id')
    .eq('referred_user_id', userId)
    .eq('status', 'signed_up')
    .maybeSingle()
  if (error) {
    warn('getPendingReferral', error)
    return null
  }
  if (!data) return null
  return {
    id:             data.id as string,
    code:           data.code as string,
    referrerUserId: data.referrer_user_id as string,
  }
}

/** Registra, para auditoria, o percentual concedido ao indicado no checkout. */
export async function markReferredDiscount(
  admin: SupabaseClient,
  userId: string,
  percentOff: number,
  sessionId: string,
): Promise<void> {
  await callRpc(admin, 'mark_referred_discount', {
    p_user:    userId,
    p_percent: percentOff,
    p_session: sessionId,
  })
}

/** Um compartilhamento do link/código — alimenta "convites enviados". */
export async function recordInvite(
  admin: SupabaseClient,
  userId: string,
  channel: string,
): Promise<boolean> {
  const { error } = await admin
    .from('referral_invites')
    .insert({ referrer_user_id: userId, channel })
  if (error) {
    warn('recordInvite', error)
    return false
  }
  return true
}

// ── Confirmação e revogação ─────────────────────────────────────────────────

export interface ConfirmResult {
  ok: boolean
  already?: boolean
  referralId?: string
  rewardId?: string
  referrerUserId?: string
  availableAt?: string
  reason?: string
}

/**
 * Primeira mensalidade do indicado foi paga → indicação confirmada e recompensa
 * de 20% criada em `pending`, liberada só depois da janela de reembolso.
 */
export async function confirmReferral(
  admin: SupabaseClient,
  input: { referredUserId: string; invoiceId: string; paymentIntentId: string | null },
): Promise<ConfirmResult> {
  const data = await callRpc(admin, 'confirm_referral', {
    p_user:           input.referredUserId,
    p_invoice:        input.invoiceId,
    p_payment_intent: input.paymentIntentId,
    p_percent:        REFERRER_PERCENT_OFF,
    p_hold:           `${REWARD_HOLD_DAYS} days`,
  })
  if (!data) return { ok: false, reason: 'unavailable' }
  return {
    ok:             data.ok === true,
    already:        data.already === true,
    referralId:     data.referral_id as string | undefined,
    rewardId:       data.reward_id as string | undefined,
    referrerUserId: data.referrer_user_id as string | undefined,
    availableAt:    data.available_at as string | undefined,
    reason:         data.reason as string | undefined,
  }
}

/**
 * Reembolso, contestação, falha de pagamento ou cancelamento antes do fim da
 * janela: a indicação e a recompensa caem. Idempotente.
 *
 * `onlyWithinHold` é do cancelamento: fora da janela de reembolso, cancelar
 * não desfaz nada — o indicado já usou o mês que pagou.
 */
export async function revokeReferralReward(
  admin: SupabaseClient,
  input: {
    reason: string
    invoiceId?: string | null
    paymentIntentId?: string | null
    referredUserId?: string | null
    onlyWithinHold?: boolean
  },
): Promise<{ found: boolean; note?: string; skipped?: string }> {
  const data = await callRpc(admin, 'revoke_referral_reward', {
    p_reason:           input.reason,
    p_invoice:          input.invoiceId ?? null,
    p_payment_intent:   input.paymentIntentId ?? null,
    p_referred_user:    input.referredUserId ?? null,
    p_only_within_hold: input.onlyWithinHold === true,
  })
  if (!data) return { found: false }
  return {
    found:   data.found === true,
    note:    (data.note as string | null) ?? undefined,
    skipped: (data.skipped as string | null) ?? undefined,
  }
}

/**
 * O indicado desfez o cancelamento ainda dentro da janela: a recompensa volta
 * para `pending` e segue o curso normal. Só reverte revogação por
 * cancelamento — reembolso e contestação continuam definitivos.
 */
export async function restoreReferralReward(
  admin: SupabaseClient,
  referredUserId: string,
): Promise<{ restored: boolean }> {
  const data = await callRpc(admin, 'restore_referral_reward', {
    p_referred_user: referredUserId,
  })
  return { restored: data?.restored === true }
}

/** Antiabuso detectado na confirmação (ex.: cartão já usado por outra conta). */
export async function rejectReferral(
  admin: SupabaseClient,
  referredUserId: string,
  reason: string,
  flag: string,
): Promise<void> {
  await callRpc(admin, 'reject_referral', {
    p_user:   referredUserId,
    p_reason: reason,
    p_flag:   flag,
  })
}

/**
 * Um meio de pagamento pertence a uma conta só. Devolve false quando o
 * fingerprint já está preso a OUTRO usuário — sinal de conta duplicada.
 * Fingerprint ausente (Pix, por exemplo) nunca bloqueia.
 */
export async function claimPaymentFingerprint(
  admin: SupabaseClient,
  fingerprint: string | null,
  userId: string,
): Promise<{ ok: boolean; ownerUserId?: string }> {
  if (!fingerprint) return { ok: true }
  const data = await callRpc(admin, 'claim_payment_fingerprint', {
    p_fingerprint: fingerprint,
    p_user:        userId,
  })
  // Sem resposta (migration pendente) não é prova de abuso — não bloqueia.
  if (!data) return { ok: true }
  return { ok: data.ok === true, ownerUserId: data.owner_user_id as string | undefined }
}

// ── Aplicação na fatura do indicador ────────────────────────────────────────

export interface ClaimResult {
  percentOff: number
  already: boolean
  rewardIds: string[]
  stripeCouponId?: string | null
}

/** Reserva recompensas disponíveis para uma fatura, até 100% da mensalidade. */
export async function claimRewardsForInvoice(
  admin: SupabaseClient,
  userId: string,
  invoiceId: string,
): Promise<ClaimResult> {
  const data = await callRpc(admin, 'claim_referral_rewards', {
    p_user:        userId,
    p_invoice:     invoiceId,
    p_max_percent: MAX_PERCENT_OFF_PER_INVOICE,
  })
  if (!data) return { percentOff: 0, already: false, rewardIds: [] }
  return {
    percentOff:     Number(data.percent_off ?? 0),
    already:        data.already === true,
    rewardIds:      Array.isArray(data.reward_ids) ? (data.reward_ids as string[]) : [],
    stripeCouponId: (data.stripe_coupon_id as string | null) ?? null,
  }
}

export async function setApplicationCoupon(
  admin: SupabaseClient,
  invoiceId: string,
  couponId: string,
): Promise<void> {
  await callRpc(admin, 'set_application_coupon', { p_invoice: invoiceId, p_coupon: couponId })
}

/**
 * Liquida a reserva de uma fatura:
 *  • `consumed` — a mensalidade foi paga com o desconto (estado final).
 *  • `released` — a fatura não vingou; o benefício VOLTA para a fila e entra
 *    na mensalidade seguinte (nada se perde).
 */
export async function settleApplication(
  admin: SupabaseClient,
  invoiceId: string,
  outcome: 'consumed' | 'released',
): Promise<void> {
  await callRpc(admin, 'settle_reward_application', {
    p_invoice: invoiceId,
    p_outcome: outcome,
  })
}

/** Rede de segurança do cron: pending → available quando a janela fecha. */
export async function matureRewards(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc('mature_referral_rewards', { p_user: null })
  if (error) {
    warn('mature_referral_rewards', error)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

// ── Idempotência de webhook ─────────────────────────────────────────────────

/**
 * Reserva um evento do Stripe para os efeitos colaterais de indicação.
 * `true` = primeira vez (pode processar); `false` = reentrega (ignorar).
 *
 * Só governa o programa de indicações — a ativação de plano continua com a
 * própria idempotência por valores absolutos, intocada.
 */
export async function claimStripeEvent(
  admin: SupabaseClient,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await admin
    .from('stripe_webhook_events')
    .insert({ id: eventId, type: eventType })
  if (!error) return true
  if (error.code === '23505') return false        // já processado
  if (isNotDeployed(error)) return false          // programa inerte
  warn('claimStripeEvent', error)
  return false                                    // na dúvida, não concede
}

// ── Painel ──────────────────────────────────────────────────────────────────

export interface ReferralOverview {
  code: string | null
  invitesSent: number
  /** Contas criadas pelo convite (inclui as que já assinaram). */
  signups: number
  /** Indicações com primeira mensalidade paga e não revogada. */
  confirmed: number
  rewards: RewardRow[]
}

export async function getReferralOverview(
  admin: SupabaseClient,
  userId: string,
): Promise<ReferralOverview> {
  const code = await ensureReferralCode(admin, userId)

  const [invitesRes, signupsRes, confirmedRes, rewardsRes] = await Promise.all([
    admin.from('referral_invites')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId),
    admin.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId)
      .in('status', ['signed_up', 'confirmed', 'revoked']),
    admin.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', userId)
      .eq('status', 'confirmed'),
    admin.from('referral_rewards')
      .select('id, percent_off, status, available_at, applied_invoice_id, applied_at, consumed_at, created_at')
      .eq('referrer_user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  warn('overview.invites',   invitesRes.error)
  warn('overview.signups',   signupsRes.error)
  warn('overview.confirmed', confirmedRes.error)
  warn('overview.rewards',   rewardsRes.error)

  return {
    code,
    invitesSent: invitesRes.count ?? 0,
    signups:     signupsRes.count ?? 0,
    confirmed:   confirmedRes.count ?? 0,
    rewards:     (rewardsRes.data ?? []) as RewardRow[],
  }
}
