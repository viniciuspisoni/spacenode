// Fluxo ponta a ponta do Programa de Indicações no ciclo de cobrança.
//
// Exercita lib/referral/webhook.ts com um Stripe e um Supabase falsos: o que
// está sob teste é a ORQUESTRAÇÃO — quais guardas barram, o que é chamado, em
// que ordem e com quais argumentos. As transições de estado em si já são
// testadas contra Postgres de verdade em supabase/tests/referral_lifecycle.sql.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import StripeSDK from 'stripe'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  handleChargeRefunded,
  handleDisputeCreated,
  handleReferredFirstPayment,
  handleReferrerInvoiceCreated,
  handleReferrerInvoicePaid,
  handleReferrerInvoiceUnpaid,
} from '@/lib/referral/webhook'

// O programa entra em vigor em 01/09/2026 — sem congelar o relógio, todo
// handler sairia pela primeira guarda.
const DURING_PROGRAM = new Date('2026-09-15T12:00:00Z')

const REFERRED = 'user-indicado'
const REFERRER = 'user-indicador'

// ── Dublês ──────────────────────────────────────────────────────────────────

interface RpcCall { fn: string; args: Record<string, unknown> }

function makeAdmin(opts: {
  rpc?:  Record<string, unknown>
  rows?: Record<string, unknown>
  eventAlreadySeen?: boolean
} = {}) {
  const rpcCalls: RpcCall[] = []
  const inserts:  { table: string; values: unknown }[] = []

  const admin = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      return { data: opts.rpc?.[fn] ?? null, error: null }
    },
    from(table: string) {
      const builder = {
        select: () => builder,
        eq:     () => builder,
        in:     () => builder,
        order:  () => builder,
        maybeSingle: async () => ({ data: opts.rows?.[table] ?? null, error: null }),
        single:      async () => ({ data: opts.rows?.[table] ?? null, error: null }),
        insert: async (values: unknown) => {
          inserts.push({ table, values })
          // 23505 = já processado (reentrega do mesmo evento).
          return { error: opts.eventAlreadySeen ? { code: '23505' } : null }
        },
      }
      return builder
    },
  }

  const rpcNames = () => rpcCalls.map(c => c.fn)
  const rpcArgs  = (fn: string) => rpcCalls.find(c => c.fn === fn)?.args
  return { admin: admin as unknown as SupabaseClient, rpcCalls, inserts, rpcNames, rpcArgs }
}

function makeStripe(opts: {
  couponExists?:   boolean
  updateError?:    unknown
  fingerprint?:    string | null
  subMetaUserId?:  string | null
} = {}) {
  const calls: string[] = []
  const updates: { id: string; params: unknown }[] = []
  const created: unknown[] = []

  const stripe = {
    subscriptions: {
      retrieve: async () => {
        calls.push('subscriptions.retrieve')
        return { metadata: { user_id: opts.subMetaUserId ?? REFERRER } }
      },
    },
    coupons: {
      retrieve: async (id: string) => {
        calls.push('coupons.retrieve')
        if (opts.couponExists === false) {
          // StripeError de verdade: ensureReferralCoupon só reconhece
          // "não existe" pelo tipo do erro, não por duck typing.
          throw new StripeSDK.errors.StripeInvalidRequestError({
            type:    'invalid_request_error',
            code:    'resource_missing',
            message: 'No such coupon',
          })
        }
        return { id, deleted: false }
      },
      create: async (params: unknown) => {
        calls.push('coupons.create')
        created.push(params)
        return params
      },
    },
    invoices: {
      update: async (id: string, params: unknown) => {
        calls.push('invoices.update')
        if (opts.updateError) throw opts.updateError
        updates.push({ id, params })
        return { id }
      },
    },
    invoicePayments: {
      list: async () => {
        calls.push('invoicePayments.list')
        return { data: [{ payment: { payment_intent: 'pi_1' } }] }
      },
    },
    charges: {
      list: async () => {
        calls.push('charges.list')
        return {
          data: [{ payment_method_details: { card: { fingerprint: opts.fingerprint ?? 'fp_1' } } }],
        }
      },
    },
  }
  return { stripe: stripe as unknown as Stripe, calls, updates, created }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function invoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id:             'in_ciclo',
    status:         'draft',
    billing_reason: 'subscription_cycle',
    customer:       'cus_1',
    discounts:      [],
    amount_paid:    19900,
    lines: { data: [{
      subscription: 'sub_1',
      pricing: { price_details: { price: 'price_pro_monthly' } },
    }] },
    ...overrides,
  } as unknown as Stripe.Invoice
}

const event = { id: 'evt_1', type: 'invoice.paid' } as Stripe.Event

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(DURING_PROGRAM)
  process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly'
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL  = 'price_pro_annual'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete process.env.STRIPE_PRICE_ID_PRO_MONTHLY
  delete process.env.STRIPE_PRICE_ID_PRO_ANNUAL
})

// ════════════════════════════════════════════════════════════════════════════
// 1. Indicado paga a primeira mensalidade
// ════════════════════════════════════════════════════════════════════════════

describe('confirmação do indicado', () => {
  const pendingReferral = { id: 'ref-1', code: 'A2B3C4D5', referrer_user_id: REFERRER }

  const okAdmin = () => makeAdmin({
    rows: { referrals: pendingReferral },
    rpc: {
      claim_payment_fingerprint: { ok: true, owner: 'self' },
      confirm_referral: {
        ok: true, already: false, referral_id: 'ref-1',
        reward_id: 'rw-1', referrer_user_id: REFERRER,
        available_at: '2026-09-22T12:00:00Z',
      },
    },
  })

  it('confirma a indicação e agenda a recompensa', async () => {
    const { admin, rpcNames, rpcArgs } = okAdmin()
    const { stripe } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice({
      id: 'in_primeira', billing_reason: 'subscription_create',
    }), REFERRED)

    expect(rpcNames()).toContain('confirm_referral')
    expect(rpcArgs('confirm_referral')).toMatchObject({
      p_user:    REFERRED,
      p_invoice: 'in_primeira',
      p_percent: 20,
      p_hold:    '7 days',
    })
  })

  it('guarda o payment intent para conseguir revogar num reembolso', async () => {
    const { admin, rpcArgs } = okAdmin()
    const { stripe } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice({
      billing_reason: 'subscription_create',
    }), REFERRED)

    expect(rpcArgs('confirm_referral')?.p_payment_intent).toBe('pi_1')
  })

  it('não confirma fatura sem dinheiro entrando', async () => {
    const { admin, rpcNames } = okAdmin()
    const { stripe } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice({ amount_paid: 0 }), REFERRED)

    expect(rpcNames()).not.toContain('confirm_referral')
  })

  it('sai cedo quando a conta não tem indicação — sem tocar o Stripe', async () => {
    const { admin, rpcCalls } = makeAdmin({ rows: {} })
    const { stripe, calls } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice(), REFERRED)

    expect(rpcCalls).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('reentrega do mesmo evento não confirma de novo', async () => {
    const { admin, rpcNames } = makeAdmin({
      rows: { referrals: pendingReferral },
      eventAlreadySeen: true,
    })
    const { stripe } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice(), REFERRED)

    expect(rpcNames()).not.toContain('confirm_referral')
  })

  it('recusa quando o cartão já pertence a outra conta', async () => {
    const { admin, rpcNames, rpcArgs } = makeAdmin({
      rows: { referrals: pendingReferral },
      rpc: {
        claim_payment_fingerprint: { ok: false, owner: 'other', owner_user_id: 'outra-conta' },
      },
    })
    const { stripe } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice(), REFERRED)

    expect(rpcNames()).toContain('reject_referral')
    expect(rpcNames()).not.toContain('confirm_referral')
    expect(rpcArgs('reject_referral')).toMatchObject({
      p_user:   REFERRED,
      p_reason: 'duplicate_payment_method',
    })
  })

  it('fica inerte antes de o programa entrar em vigor', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
    const { admin, rpcCalls } = okAdmin()
    const { stripe, calls } = makeStripe()

    await handleReferredFirstPayment(stripe, admin, event, invoice(), REFERRED)

    expect(rpcCalls).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('nunca propaga erro — a assinatura já está ativa', async () => {
    const admin = {
      from() { throw new Error('banco fora do ar') },
      rpc()  { throw new Error('banco fora do ar') },
    } as unknown as SupabaseClient
    const { stripe } = makeStripe()

    await expect(
      handleReferredFirstPayment(stripe, admin, event, invoice(), REFERRED),
    ).resolves.toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 2. Mensalidade do indicador em rascunho
// ════════════════════════════════════════════════════════════════════════════

describe('aplicação na mensalidade do indicador', () => {
  const claimed = (percent: number) => ({
    claim_referral_rewards: {
      ok: true, already: false, percent_off: percent, reward_ids: ['rw-1', 'rw-2'],
    },
  })

  it('aplica o desconto acumulado na fatura em rascunho', async () => {
    const { admin, rpcNames, rpcArgs } = makeAdmin({ rpc: claimed(40) })
    const { stripe, updates } = makeStripe()

    const outcome = await handleReferrerInvoiceCreated(stripe, admin, invoice())

    expect(outcome).toBe('applied')
    expect(updates).toEqual([
      { id: 'in_ciclo', params: { discounts: [{ coupon: 'spn-referral-40' }] } },
    ])
    expect(rpcNames()).toContain('set_application_coupon')
    expect(rpcArgs('claim_referral_rewards')).toMatchObject({
      p_user: REFERRER, p_invoice: 'in_ciclo', p_max_percent: 100,
    })
  })

  it('cria o cupom quando ele ainda não existe neste modo do Stripe', async () => {
    const { admin } = makeAdmin({ rpc: claimed(100) })
    const { stripe, created, updates } = makeStripe({ couponExists: false })

    const outcome = await handleReferrerInvoiceCreated(stripe, admin, invoice())

    expect(outcome).toBe('applied')
    expect(created).toEqual([expect.objectContaining({
      id: 'spn-referral-100', percent_off: 100, duration: 'once',
    })])
    expect(updates).toEqual([
      { id: 'in_ciclo', params: { discounts: [{ coupon: 'spn-referral-100' }] } },
    ])
  })

  it('não sobrescreve desconto que já existe na fatura', async () => {
    const { admin, rpcCalls } = makeAdmin({ rpc: claimed(40) })
    const { stripe, updates } = makeStripe()

    const outcome = await handleReferrerInvoiceCreated(
      stripe, admin, invoice({ discounts: ['di_existente'] }),
    )

    expect(outcome).toBe('skipped')
    expect(updates).toHaveLength(0)
    expect(rpcCalls).toHaveLength(0)   // nem chega a reservar recompensa
  })

  it('ignora fatura que já saiu do rascunho', async () => {
    const { admin, rpcCalls } = makeAdmin({ rpc: claimed(40) })
    const { stripe } = makeStripe()

    expect(await handleReferrerInvoiceCreated(stripe, admin, invoice({ status: 'open' })))
      .toBe('skipped')
    expect(rpcCalls).toHaveLength(0)
  })

  it('ignora o que não é renovação de mensalidade', async () => {
    const { admin } = makeAdmin({ rpc: claimed(40) })
    const { stripe } = makeStripe()

    for (const reason of ['subscription_create', 'subscription_update', 'manual']) {
      expect(await handleReferrerInvoiceCreated(stripe, admin, invoice({ billing_reason: reason })))
        .toBe('skipped')
    }
  })

  it('não entra em ciclo anual — o benefício é de mensalidade', async () => {
    const { admin, rpcCalls } = makeAdmin({ rpc: claimed(40) })
    const { stripe } = makeStripe()

    const anual = invoice({
      lines: { data: [{
        subscription: 'sub_1',
        pricing: { price_details: { price: 'price_pro_annual' } },
      }] },
    })

    expect(await handleReferrerInvoiceCreated(stripe, admin, anual)).toBe('skipped')
    expect(rpcCalls).toHaveLength(0)
  })

  it('sem recompensa disponível, não mexe na fatura', async () => {
    const { admin } = makeAdmin({
      rpc: { claim_referral_rewards: { ok: true, percent_off: 0, reward_ids: [] } },
    })
    const { stripe, updates } = makeStripe()

    expect(await handleReferrerInvoiceCreated(stripe, admin, invoice())).toBe('skipped')
    expect(updates).toHaveLength(0)
  })

  it('falha do Stripe devolve a reserva e pede retentativa', async () => {
    const { admin, rpcNames, rpcArgs } = makeAdmin({ rpc: claimed(60) })
    const { stripe } = makeStripe({ updateError: new Error('rede') })

    const outcome = await handleReferrerInvoiceCreated(stripe, admin, invoice())

    expect(outcome).toBe('retry')
    expect(rpcNames()).toContain('settle_reward_application')
    expect(rpcArgs('settle_reward_application')).toMatchObject({
      p_invoice: 'in_ciclo', p_outcome: 'released',
    })
  })

  it('fatura já finalizada: devolve o benefício à fila e não insiste', async () => {
    const notEditable = Object.assign(new Error('not editable'), { code: 'invoice_not_editable' })
    const { admin, rpcArgs } = makeAdmin({ rpc: claimed(20) })
    const { stripe } = makeStripe({ updateError: notEditable })

    expect(await handleReferrerInvoiceCreated(stripe, admin, invoice())).toBe('skipped')
    expect(rpcArgs('settle_reward_application')).toMatchObject({ p_outcome: 'released' })
  })

  it('fica inerte antes de o programa entrar em vigor', async () => {
    vi.setSystemTime(new Date('2026-08-31T12:00:00Z'))
    const { admin, rpcCalls } = makeAdmin({ rpc: claimed(40) })
    const { stripe, calls } = makeStripe()

    expect(await handleReferrerInvoiceCreated(stripe, admin, invoice())).toBe('skipped')
    expect(rpcCalls).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 3. Liquidação e revogação
// ════════════════════════════════════════════════════════════════════════════

describe('liquidação da fatura', () => {
  it('mensalidade paga marca o benefício como utilizado', async () => {
    const { admin, rpcArgs } = makeAdmin()
    await handleReferrerInvoicePaid(admin, invoice({ id: 'in_paga' }))
    expect(rpcArgs('settle_reward_application')).toEqual({
      p_invoice: 'in_paga', p_outcome: 'consumed',
    })
  })

  it('mensalidade que não vingou devolve o benefício à fila', async () => {
    const { admin, rpcArgs } = makeAdmin()
    await handleReferrerInvoiceUnpaid(admin, invoice({ id: 'in_falhou' }))
    expect(rpcArgs('settle_reward_application')).toEqual({
      p_invoice: 'in_falhou', p_outcome: 'released',
    })
  })
})

describe('revogação por dinheiro devolvido', () => {
  it('reembolso revoga a indicação pelo payment intent', async () => {
    const { admin, rpcArgs } = makeAdmin({
      rpc: { revoke_referral_reward: { ok: true, found: true } },
    })
    await handleChargeRefunded(admin, { payment_intent: 'pi_9' } as unknown as Stripe.Charge)

    expect(rpcArgs('revoke_referral_reward')).toMatchObject({
      p_reason: 'refunded', p_payment_intent: 'pi_9',
    })
  })

  it('contestação revoga a indicação pelo payment intent', async () => {
    const { admin, rpcArgs } = makeAdmin({
      rpc: { revoke_referral_reward: { ok: true, found: true } },
    })
    await handleDisputeCreated(admin, { payment_intent: 'pi_9' } as unknown as Stripe.Dispute)

    expect(rpcArgs('revoke_referral_reward')).toMatchObject({
      p_reason: 'disputed', p_payment_intent: 'pi_9',
    })
  })

  it('cobrança sem payment intent não revoga nada', async () => {
    const { admin, rpcCalls } = makeAdmin()
    await handleChargeRefunded(admin, { payment_intent: null } as unknown as Stripe.Charge)
    expect(rpcCalls).toHaveLength(0)
  })
})
