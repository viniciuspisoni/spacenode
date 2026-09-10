import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { findPlanByStripePriceId, type BillingCycle } from '@/lib/plans'
import { graceDeadline, prorationNodes } from '@/lib/billing/nodes'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// NODES ACUMULATIVOS (2026-09-10)
//
// Nenhum caminho deste arquivo escreve `credits` com valor ABSOLUTO. Toda
// entrada de nodes passa por `grant_plan_nodes`, que SOMA ao saldo existente e
// é idempotente por uma chave do Stripe. É a diferença que faz a regra nova
// funcionar: somar não é idempotente sozinho, e o Stripe reentrega webhooks —
// sem a chave, uma reentrega creditaria o mês duas vezes.
//
// Chave de idempotência por caminho:
//   • ativação (checkout.session.completed  ⟷  invoice.paid/subscription_create)
//     → o SUBSCRIPTION ID. Os dois eventos disparam na mesma compra, em ordem
//       imprevisível, e carregam o mesmo id: quem chegar primeiro credita.
//   • renovação (invoice.paid/subscription_cycle)  → o INVOICE ID (1 por ciclo).
//   • upgrade   (invoice.paid/subscription_update) → o INVOICE ID da fatura
//                                                    de proporcional.
//
// E o cancelamento não zera mais nada: `start_nodes_grace` preserva o saldo e
// agenda a expiração para 30 dias depois do fim da assinatura.
// ─────────────────────────────────────────────────────────────────────────────

// Stripe SDK retorna `string | Object | null` em vários campos relacionais.
// Quando o webhook não pediu expansion (default), os campos vêm como string.
function strId<T extends { id: string }>(value: string | T | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/** Timestamp UNIX (segundos) do Stripe → Date. */
function stripeDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : null
}

/** price id de uma linha da invoice, nos dois shapes (Basil e pré-Basil). */
function linePriceId(line: Stripe.InvoiceLineItem): string | undefined {
  const priceField = line?.pricing?.price_details?.price
  // Fallback pro formato pré-Basil (`lines.data[].price`) — o endpoint é
  // criado sem api_version pinada, então o shape segue o default da conta.
  const legacyPrice = (line as unknown as { price?: { id?: string } | null })?.price
  return (typeof priceField === 'string' ? priceField : priceField?.id) ?? legacyPrice?.id
}

/** subscription id fora das linhas (shape pré-Basil e o `parent` da Basil). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
  const parent = invoice.parent?.subscription_details?.subscription
  return strId(legacy) ?? strId(parent)
}

/**
 * Descobre QUAL plano a fatura cobrou.
 *
 * Não dá pra olhar só `lines.data[0]`: uma fatura de proporcional (troca de
 * plano) traz DUAS linhas — o crédito do tempo não usado do plano antigo
 * (valor negativo) e a cobrança do tempo restante no novo (positivo) — e a
 * ordem não é garantida. Pegar a primeira faria um upgrade ser lido como o
 * plano ANTIGO, gravando o plano errado no profile.
 *
 * Por isso: entre as linhas que resolvem para um plano do catálogo, vence a de
 * maior valor. Numa fatura normal (linha única) o resultado é o mesmo de antes.
 */
function resolveInvoicePlan(
  invoice: Stripe.Invoice
): { match: NonNullable<ReturnType<typeof findPlanByStripePriceId>>; lineItem: Stripe.InvoiceLineItem } | null {
  let best: { match: NonNullable<ReturnType<typeof findPlanByStripePriceId>>; lineItem: Stripe.InvoiceLineItem; amount: number } | null = null

  for (const line of invoice.lines?.data ?? []) {
    const priceId = linePriceId(line)
    if (!priceId) continue
    const match = findPlanByStripePriceId(priceId)
    if (!match) continue
    const amount = line.amount ?? 0
    if (!best || amount > best.amount) best = { match, lineItem: line, amount }
  }

  return best ? { match: best.match, lineItem: best.lineItem } : null
}

interface GrantResult {
  /** false = já tinha sido creditado antes (reentrega do Stripe). */
  applied: boolean
  granted: number
  balance: number
}

/**
 * Credita nodes SOMANDO ao saldo (nunca sobrescrevendo).
 *
 * `sourceId` é a chave de idempotência — a RPC reserva a linha no node_ledger
 * antes de somar, então a segunda entrega do mesmo evento sai sem creditar e
 * devolve `applied: false`.
 *
 * Retorna null quando o banco falhou: o caller responde 500 e o Stripe
 * retenta, o que agora é seguro justamente por causa da chave.
 */
async function grantNodes(
  supabase: SupabaseClient,
  args: {
    userId:   string
    amount:   number
    planId?:  string | null
    kind:     'grant_plan' | 'grant_renewal'
    sourceId: string
  }
): Promise<GrantResult | null> {
  const { data, error } = await supabase.rpc('grant_plan_nodes', {
    user_id_input:   args.userId,
    amount:          args.amount,
    plan_name:       args.planId ?? null,
    kind_input:      args.kind,
    source_id_input: args.sourceId,
    source_input:    'stripe',
  })
  if (error) {
    console.error('[stripe webhook] grant_plan_nodes falhou:', error)
    return null
  }
  const result = (data ?? {}) as { applied?: boolean; granted?: number; balance?: number }
  return {
    applied: result.applied !== false,
    granted: result.granted ?? 0,
    balance: result.balance ?? 0,
  }
}

interface ActivationInput {
  userId:         string
  planId:         string
  nodes:          number
  customerId:     string | null
  subscriptionId: string | null
  billingCycle:   BillingCycle | string | null
  valueCents:     number | null
  /** De onde veio o sinal — só para o log e o funil. */
  source:         'checkout' | 'invoice'
  /** Chave de idempotência de último recurso quando não há subscription id. */
  fallbackKey:    string
  eventMetadata?: Record<string, unknown>
}

/**
 * Ativa o plano pago de um usuário.
 *
 * Existe porque a ativação chega por DOIS caminhos, que na mesma compra podem
 * disparar os dois, em qualquer ordem:
 *
 *  • `checkout.session.completed` — no cartão a session já vem paga.
 *  • `invoice.paid` (billing_reason=subscription_create) — no Pix Automático
 *    é o único sinal confiável, porque a session completa ANTES de o dinheiro
 *    entrar. Vale como rede de segurança para o cartão também.
 *
 * Quem decide se o crédito acontece é a RPC, pelo subscription id — e não mais
 * uma comparação de estado do profile (que só funcionava porque o valor era
 * absoluto). O `applied` que ela devolve também governa o evento de funil:
 * `subscription_started` não tem índice único, então contar a mesma venda duas
 * vezes seria fácil.
 *
 * Retorna `false` só quando o banco falhou — o caller devolve 500 e o Stripe
 * retenta a entrega.
 */
async function activatePlan(
  supabase: SupabaseClient,
  input: ActivationInput
): Promise<boolean> {
  // Ids do Stripe primeiro: se a corrida entre os dois eventos fizer o grant
  // sair por idempotência, o profile ainda precisa apontar pra assinatura.
  const ids: Record<string, unknown> = {}
  if (input.customerId)     ids.stripe_customer_id     = input.customerId
  if (input.subscriptionId) ids.stripe_subscription_id = input.subscriptionId
  if (Object.keys(ids).length > 0) {
    const { error } = await supabase.from('profiles').update(ids).eq('id', input.userId)
    if (error) {
      console.error('[stripe webhook] gravação dos ids do Stripe falhou:', error)
      return false
    }
  }

  const grant = await grantNodes(supabase, {
    userId:   input.userId,
    amount:   input.nodes,
    planId:   input.planId,
    kind:     'grant_plan',
    sourceId: input.subscriptionId ?? input.fallbackKey,
  })
  if (!grant) return false

  if (!grant.applied) {
    console.log(
      `[stripe webhook] assinatura ${input.subscriptionId} já creditada p/ user ` +
      `${input.userId} (sinal via ${input.source}) — nada a fazer`
    )
    return true
  }

  console.log(
    `[stripe webhook] plano ${input.planId} ativado p/ user ${input.userId} ` +
    `(+${input.nodes} nodes → saldo ${grant.balance}, via ${input.source})`
  )

  // Funil first-party (best-effort — recordAcquisitionEvent nunca lança).
  // `value_cents` é o valor efetivamente cobrado (já com o desconto de
  // lançamento, quando houve); `launch_offer` separa as duas coortes na
  // hora de medir retenção do 2º mês, que é o número que importa aqui.
  await recordAcquisitionEvent(supabase, {
    user_id:     input.userId,
    event_type:  'subscription_started',
    plan_id:     input.planId,
    value_cents: input.valueCents,
    metadata: {
      billing_cycle: input.billingCycle ?? null,
      activated_via: input.source,
      ...(input.eventMetadata ?? {}),
    },
  })
  return true
}

/**
 * Resolve o dono da assinatura a partir dos ids que o evento trouxe.
 * O subscription id é a chave preferida; o customer id cobre o caso de o
 * profile ainda não ter a assinatura gravada.
 */
async function findProfileByStripeIds(
  supabase: SupabaseClient,
  subscriptionId: string | null,
  customerId: string | null
): Promise<{ id: string; plan: string | null } | null> {
  for (const [column, value] of [
    ['stripe_subscription_id', subscriptionId],
    ['stripe_customer_id',     customerId],
  ] as const) {
    if (!value) continue
    const { data } = await supabase
      .from('profiles')
      .select('id, plan')
      .eq(column, value)
      .maybeSingle()
    if (data?.id) return { id: data.id as string, plan: (data.plan as string | null) ?? null }
  }
  return null
}

export async function POST(req: NextRequest) {
  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[stripe webhook] signature error:', err)
    return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Checkout pago: ativa plano OU adiciona Nodes extras ──────────────────
  //
  // Dois eventos caem aqui porque o Pix é assíncrono:
  //  • checkout.session.completed — no cartão já chega paga; no Pix chega com
  //    payment_status 'unpaid', com o QR ainda pendente.
  //  • checkout.session.async_payment_succeeded — o dinheiro do Pix entrou.
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session     = event.data.object as Stripe.Checkout.Session
    const userId      = session.metadata?.user_id
    const productType = session.metadata?.product_type
    const customerId  = strId(session.customer)

    if (!userId || !productType) {
      console.error('[stripe webhook] checkout sem metadata válido:', session.id)
      return NextResponse.json({ received: true })
    }

    // GUARDA DO PIX — a mais importante deste arquivo.
    //
    // Com cartão a session completa já paga, e creditar aqui sempre foi
    // seguro. Com Pix ela completa ANTES de o dinheiro entrar: creditar neste
    // ponto entregaria nodes de graça, e o cliente ficaria com eles se o QR
    // expirasse sem pagamento. Só dinheiro confirmado libera produto.
    // ('no_payment_required' é o caso de desconto de 100%.)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      // O customer já existe do lado do Stripe; persistir cedo evita criar um
      // duplicado se o cliente tentar de novo. O subscription_id NÃO é gravado
      // aqui de propósito: ele alimenta a guarda anti-assinatura-dupla do
      // checkout, e uma assinatura Pix ainda pendente trancaria o usuário fora
      // de refazer a compra no cartão.
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
          .is('stripe_customer_id', null)
      }
      console.log(
        `[stripe webhook] session ${session.id} ainda não paga ` +
        `(${session.payment_status}) — aguardando confirmação do Pix`
      )
      return NextResponse.json({ received: true })
    }

    if (productType === 'plan') {
      const planId         = session.metadata?.plan_id
      const nodesToAdd     = parseInt(session.metadata?.nodes_to_add ?? '0', 10)
      const subscriptionId = strId(session.subscription)

      if (!planId || nodesToAdd <= 0) {
        console.error('[stripe webhook] plan metadata inválido:', session.id)
        return NextResponse.json({ received: true })
      }

      const ok = await activatePlan(supabase, {
        userId,
        planId,
        nodes:          nodesToAdd,
        customerId,
        subscriptionId,
        billingCycle:   session.metadata?.billing_cycle ?? null,
        valueCents:     session.amount_total ?? null,
        source:         'checkout',
        fallbackKey:    session.id,
        eventMetadata: {
          stripe_session_id: session.id,
          launch_offer:      session.metadata?.launch_offer === 'applied',
        },
      })
      // 500 → Stripe retenta a entrega; a RPC de grant é idempotente pelo
      // subscription id, então a retentativa não credita de novo
      if (!ok) return NextResponse.json({ error: 'db' }, { status: 500 })
    } else if (productType === 'extra' || productType === 'lumen') {
      // 'lumen' é o metadata legado de Nodes extras — sessions criadas antes
      // do deploy da unificação (2026-08-31) ainda chegam com ele.
      const packSize = parseInt(session.metadata?.pack_size ?? '0', 10)
      if (![500, 1500, 4000].includes(packSize)) {
        console.error('[stripe webhook] pack_size inválido:', packSize)
        return NextResponse.json({ received: true })
      }

      const { error: rpcErr } = await supabase.rpc('add_lumen_pack', {
        user_id_input:           userId,
        pack_size_input:         packSize,
        stripe_session_id_input: session.id,
      })
      if (rpcErr) {
        console.error('[stripe webhook] add_lumen_pack falhou:', rpcErr)
        // 500 → Stripe retenta; a RPC é idempotente por stripe_session_id
        return NextResponse.json({ error: 'db' }, { status: 500 })
      }
      console.log(`[stripe webhook] pack extra ${packSize} adicionado p/ user ${userId}`)

      // Persiste customer_id se for primeira compra do user
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId)
          .is('stripe_customer_id', null)
      }
    }
  }

  // ── checkout.session.async_payment_failed: Pix expirou ou falhou ─────────
  // Nada a estornar: a guarda acima garante que nada foi creditado. Fica só o
  // registro — se isso virar volume, é sinal de QR expirando cedo demais
  // (PIX_EXPIRES_AFTER_SECONDS) ou de fricção no fluxo do banco.
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session
    console.warn(
      `[stripe webhook] Pix não concluído — session ${session.id}, ` +
      `user ${session.metadata?.user_id ?? '?'}, ` +
      `produto ${session.metadata?.product_type ?? '?'}`
    )
  }

  // ── invoice.paid ─────────────────────────────────────────────────────────
  //  • subscription_create — primeira fatura, ativa o plano. É por aqui que a
  //    assinatura no Pix Automático entra, já que a session completa antes do
  //    pagamento.
  //  • subscription_cycle — renovação, SOMA os nodes do mês ao saldo.
  //  • subscription_update — troca de plano no meio do ciclo: a fatura de
  //    proporcional. Credita a mesma fração de mês que foi cobrada.
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const reason  = invoice.billing_reason

    if (
      reason === 'subscription_create' ||
      reason === 'subscription_cycle'  ||
      reason === 'subscription_update'
    ) {
      const resolved = resolveInvoicePlan(invoice)
      if (!resolved) {
        console.warn(
          '[stripe webhook] invoice.paid sem plano resolvível nas linhas:',
          invoice.id
        )
        return NextResponse.json({ received: true })
      }
      const { match, lineItem } = resolved
      const subscriptionId = strId(lineItem.subscription) ?? invoiceSubscriptionId(invoice)
      const customerId     = strId(invoice.customer)

      // ── Primeira fatura: ativação ──────────────────────────────────────
      if (reason === 'subscription_create') {
        // O user_id é espelhado em subscription_data.metadata lá no checkout
        // justamente para não depender da ordem de chegada dos webhooks: este
        // evento pode chegar antes de o checkout.session.completed ter gravado
        // o customer_id no profile.
        let userId: string | null = null
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            userId = sub.metadata?.user_id ?? null
          } catch (err) {
            console.error('[stripe webhook] falha ao ler metadata da assinatura:', err)
          }
        }
        if (!userId && customerId) {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle()
          userId = (data?.id as string | undefined) ?? null
        }
        if (!userId) {
          console.error('[stripe webhook] subscription_create sem user resolvível:', invoice.id)
          return NextResponse.json({ received: true })
        }

        const ok = await activatePlan(supabase, {
          userId,
          planId:        match.plan.id,
          nodes:         match.plan.nodes,
          customerId,
          subscriptionId,
          billingCycle:  match.billing,
          valueCents:    invoice.amount_paid ?? null,
          source:        'invoice',
          fallbackKey:   invoice.id ?? `invoice:${event.id}`,
          eventMetadata: { stripe_invoice_id: invoice.id },
        })
        if (!ok) return NextResponse.json({ error: 'db' }, { status: 500 })
        return NextResponse.json({ received: true })
      }

      // ── Renovação e troca de plano ─────────────────────────────────────
      //
      // O dono é resolvido ANTES de creditar: a soma acontece por user id, não
      // por um filtro de UPDATE. Sem linha, não há a quem creditar — e o log
      // grita, porque isso é dinheiro entrando sem produto saindo.
      const owner = await findProfileByStripeIds(supabase, subscriptionId, customerId)
      if (!owner) {
        console.error(
          '[stripe webhook] invoice.paid sem profile correspondente ' +
          `(invoice ${invoice.id}, sub ${subscriptionId ?? '?'}, cus ${customerId ?? '?'})`
        )
        return NextResponse.json({ received: true })
      }

      // Chave de idempotência da soma: uma fatura credita uma vez só, por mais
      // vezes que o Stripe reentregue o evento.
      const invoiceKey = invoice.id ?? `invoice:${event.id}`

      if (reason === 'subscription_update') {
        // Fatura de proporcional (upgrade no meio do ciclo). Downgrade não cai
        // aqui com valor: vira crédito na conta do Stripe, amount_paid = 0.
        // O saldo acumulado NUNCA é tocado — a troca vale daqui pra frente.
        const nodes = prorationNodes(
          invoice.amount_paid,
          match.plan.monthlyPrice * 100,
          match.plan.nodes
        )
        if (nodes <= 0) {
          // Downgrade ou fatura sem cobrança: só acerta o plano do profile,
          // que é o que governa a vitrine e o "plano atual" na tela.
          const { error } = await supabase
            .from('profiles')
            .update({ plan: match.plan.id })
            .eq('id', owner.id)
          if (error) {
            console.error('[stripe webhook] troca de plano falhou:', error)
            return NextResponse.json({ error: 'db' }, { status: 500 })
          }
          console.log(
            `[stripe webhook] plano trocado p/ ${match.plan.id} (user ${owner.id}) ` +
            '— sem proporcional a creditar, saldo acumulado preservado'
          )
          return NextResponse.json({ received: true })
        }

        const grant = await grantNodes(supabase, {
          userId:   owner.id,
          amount:   nodes,
          planId:   match.plan.id,
          kind:     'grant_renewal',
          sourceId: invoiceKey,
        })
        if (!grant) return NextResponse.json({ error: 'db' }, { status: 500 })
        console.log(
          `[stripe webhook] upgrade p/ ${match.plan.id} (user ${owner.id}) — ` +
          `${grant.applied ? `+${grant.granted} nodes proporcionais → saldo ${grant.balance}` : 'já creditado'}`
        )
        return NextResponse.json({ received: true })
      }

      // Renovação: SOMA os nodes do mês ao que sobrou do ciclo anterior.
      const grant = await grantNodes(supabase, {
        userId:   owner.id,
        amount:   match.plan.nodes,
        planId:   match.plan.id,
        kind:     'grant_renewal',
        sourceId: invoiceKey,
      })
      if (!grant) return NextResponse.json({ error: 'db' }, { status: 500 })

      if (!grant.applied) {
        console.log(`[stripe webhook] renovação ${invoiceKey} já creditada — nada a fazer`)
        return NextResponse.json({ received: true })
      }
      console.log(
        `[stripe webhook] renovação aplicada (${match.plan.id}: +${match.plan.nodes} nodes ` +
        `→ saldo ${grant.balance})`
      )

      // Funil first-party (best-effort) — nunca afeta o billing. Sai só quando
      // a soma foi de fato aplicada, pra não contar a mesma renovação 2×.
      await recordAcquisitionEvent(supabase, {
        user_id: owner.id,
        event_type: 'subscription_renewed',
        plan_id: match.plan.id,
        value_cents: invoice.amount_paid ?? null,
        metadata: { stripe_invoice_id: invoice.id },
      })
    }
  }

  // ── customer.subscription.updated: upgrade/downgrade e reativação ────────
  //
  // O saldo NÃO é tocado aqui — trocar de plano não zera nem recarrega nada.
  // O que muda é `profiles.plan`, que governa a vitrine, o "plano atual" e a
  // cota de referência do anel de consumo. Os nodes da troca, quando há
  // cobrança, entram pela fatura de proporcional (invoice.paid acima).
  //
  // Também é o caminho de volta de quem reativa antes do fim do período: o
  // status volta a 'active' e a janela de cortesia (nodes_expire_at) some,
  // devolvendo o saldo acumulado sem prazo.
  if (event.type === 'customer.subscription.updated') {
    const sub        = event.data.object as Stripe.Subscription
    const customerId = strId(sub.customer)
    const item       = sub.items?.data?.[0]
    const priceId    = strId(item?.price)
    const match      = priceId ? findPlanByStripePriceId(priceId) : undefined

    const active = sub.status === 'active' || sub.status === 'trialing'
    if (active && match) {
      const owner = await findProfileByStripeIds(supabase, sub.id, customerId)
      if (owner) {
        const updates: Record<string, unknown> = {
          plan:                   match.plan.id,
          stripe_subscription_id: sub.id,
          // Assinatura viva de novo: o saldo volta a não ter prazo.
          nodes_expire_at:        null,
        }
        const { error } = await supabase.from('profiles').update(updates).eq('id', owner.id)
        if (error) {
          console.error('[stripe webhook] subscription.updated falhou:', error)
          return NextResponse.json({ error: 'db' }, { status: 500 })
        }
        if (owner.plan !== match.plan.id) {
          console.log(
            `[stripe webhook] plano sincronizado ${owner.plan ?? '?'} → ${match.plan.id} ` +
            `(user ${owner.id}) — saldo acumulado intacto`
          )
        }
      } else {
        console.warn('[stripe webhook] subscription.updated sem profile:', sub.id)
      }
    }
  }

  // ── mandate.updated: cliente mexeu na autorização do Pix Automático ──────
  //
  // O mandato vive no app do banco e pode ser revogado lá, fora do SPACENODE.
  // Revogado, as próximas faturas falham até a assinatura ser cancelada — e aí
  // o customer.subscription.deleted abaixo faz o downgrade. Não há o que
  // corrigir por código: o cliente precisa autorizar de novo. O log existe
  // para o suporte responder "por que parei de receber nodes" sem adivinhar.
  if (event.type === 'mandate.updated') {
    const mandate = event.data.object as Stripe.Mandate
    if (mandate.status !== 'active') {
      console.warn(
        `[stripe webhook] mandato Pix ${mandate.id} agora está "${mandate.status}" — ` +
        'as próximas cobranças da assinatura vão falhar até o cliente reautorizar'
      )
    }
  }

  // ── customer.subscription.deleted: downgrade pra free, saldo preservado ──
  //
  // O plano volta a 'free' na hora (os benefícios do plano acabam com a
  // assinatura, como sempre), mas os nodes JÁ ADQUIRIDOS não são confiscados:
  // ficam gastáveis por mais 30 dias. `start_nodes_grace` grava o prazo em
  // profiles.nodes_expire_at; a expiração em si é do cron (e da checagem
  // preguiçosa no consumo, se o cron falhar).
  //
  // A contagem parte do FIM da assinatura, não de "agora": numa assinatura
  // encerrada por inadimplência o período já acabou dias antes, e contar de
  // agora daria mais cortesia do que a regra promete.
  if (event.type === 'customer.subscription.deleted') {
    const sub            = event.data.object as Stripe.Subscription
    const subscriptionId = sub.id
    const customerId     = strId(sub.customer)

    // Resolve o dono ANTES do update (que anula stripe_subscription_id).
    const canceling = await findProfileByStripeIds(supabase, subscriptionId, customerId)
    if (!canceling) {
      console.error('[stripe webhook] subscription.deleted sem profile:', sub.id)
      return NextResponse.json({ received: true })
    }

    const endedAt   = stripeDate(sub.ended_at) ?? stripeDate(sub.canceled_at)
    const graceEnds = graceDeadline(endedAt)

    const { error } = await supabase.rpc('start_nodes_grace', {
      user_id_input: canceling.id,
      grace_until:   graceEnds.toISOString(),
    })
    if (error) {
      console.error('[stripe webhook] cancelamento falhou:', error)
      return NextResponse.json({ error: 'db' }, { status: 500 })
    }
    console.log(
      `[stripe webhook] plano cancelado (sub ${subscriptionId}) — saldo mantido ` +
      `até ${graceEnds.toISOString()}`
    )

    await recordAcquisitionEvent(supabase, {
      user_id: canceling.id,
      event_type: 'subscription_canceled',
      plan_id: canceling.plan,
      metadata: {
        stripe_subscription_id: subscriptionId,
        nodes_expire_at:        graceEnds.toISOString(),
      },
    })
  }

  return NextResponse.json({ received: true })
}
