import { redirect } from 'next/navigation'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { isPaidPlanId, type BillingCycle, type PaidPlanId } from '@/lib/plans'
import { BillingClient, type LumenPackRow, type CheckoutNotice, type ResumeIntent } from './BillingClient'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    session_id?: string
    canceled?: string
    // Retomada pós-login da intenção de plano (CTA "Começar com <plano>" →
    // /login → auth → aqui). Ver lib/analytics/auth-intent.ts.
    plan?: string
    billing?: string
    offer?: string
    resume?: string
  }>
}

/**
 * Traduz o desfecho do checkout que acabou de acontecer.
 *
 * Existe por causa do Pix: no cartão o cliente volta com o saldo já creditado,
 * mas no Pix a Checkout Session completa ANTES de o dinheiro entrar. Sem este
 * aviso, ele voltaria para uma página de saldo inalterado e concluiria que a
 * compra falhou — quando na verdade só falta o banco confirmar.
 */
async function readCheckoutNotice(
  sessionId: string | undefined,
  userId: string
): Promise<CheckoutNotice | null> {
  if (!sessionId) return null
  try {
    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // O id vem da URL, então é do usuário. Sem esta checagem, um id chutado
    // (ou colado de outra conta) renderizaria um aviso sobre compra alheia.
    if (session.metadata?.user_id !== userId) return null

    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      return { kind: 'ok', message: 'Pagamento confirmado — seus nodes já estão no saldo acima.' }
    }
    const viaPix = session.payment_method_types?.includes('pix')
    return {
      kind: 'pending',
      message: viaPix
        ? 'Pagamento via Pix em processamento. Assim que o banco confirmar, ' +
          'os nodes entram no saldo automaticamente — normalmente em alguns ' +
          'minutos, sem precisar refazer nada.'
        : 'Pagamento em processamento. O saldo é atualizado assim que a ' +
          'confirmação chegar.',
    }
  } catch (err) {
    // Aviso é enfeite: id inválido ou Stripe fora do ar não pode derrubar a
    // página de cobrança, que é justamente onde o cliente vai conferir o saldo.
    console.warn('[billing] falha ao ler a session do checkout:', err)
    return null
  }
}

export default async function BillingPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Plano/saldo/packs são da bolsa (dono do workspace) — é dela que as
  // gerações de toda a equipe debitam.
  const admin   = createAdminClient()
  const balance = await getPayerBalance(admin, user.id)

  const { data: lumenRows } = await admin
    .from('lumen_packs')
    .select('id, pack_size, nodes_initial, nodes_remaining, purchased_at, expires_at, status')
    .eq('user_id', balance.payerId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  // Elegibilidade à oferta de lançamento (só para anunciar — quem decide de
  // fato é o checkout, consultando o Stripe). Num usuário free, ter
  // `stripe_customer_id` significa que já assinou e cancelou: Lumens, a outra
  // via de compra, exigem Pro ou superior. Membro de workspace fica de fora
  // porque quem paga é o dono da bolsa.
  const { data: own } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()
  const offerEligible = !balance.pooled && balance.planId === 'free' && !own?.stripe_customer_id

  const params = await searchParams
  const notice = await readCheckoutNotice(params.session_id, user.id)

  // Retomada do plano escolhido antes do login. Só faz sentido para quem pode
  // assinar: membro de workspace e quem já tem plano ativo ficam de fora — o
  // checkout recusaria (409) e o auto-start viraria um erro na cara do usuário.
  let resumeIntent: ResumeIntent | null = null
  if (
    params.resume === '1' &&
    isPaidPlanId(params.plan) &&
    !balance.pooled &&
    balance.planId === 'free'
  ) {
    const billingCycle: BillingCycle = params.billing === 'annual' ? 'annual' : 'monthly'
    resumeIntent = { plan: params.plan as PaidPlanId, billing: billingCycle }
  }

  return (
    <BillingClient
      notice={notice}
      plan={balance.planId}
      balance={{
        plan:  balance.planBalance,
        lumen: balance.lumenBalance,
        total: balance.totalBalance,
      }}
      lumens={(lumenRows ?? []) as LumenPackRow[]}
      pooled={balance.pooled}
      offerEligible={offerEligible}
      resumeIntent={resumeIntent}
    />
  )
}
