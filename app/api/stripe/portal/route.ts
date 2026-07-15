// POST /api/stripe/portal — abre o Stripe Billing Portal para o usuário logado.
//
// É o caminho self-service de "Cancele quando quiser" prometido na UI e na
// cláusula 6 dos Termos: cancelamento (no fim do período), troca de cartão e
// histórico de faturas. A configuração do portal (bpc_…) é criada fora do
// código e referenciada por STRIPE_PORTAL_CONFIG_ID; sem a env, cai na
// configuração default do Dashboard.
//
// Cancelamento efetivado dispara customer.subscription.deleted no fim do
// período → webhook faz o downgrade para free.

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  // Membros de workspace não são o pagador — o portal é do dono da assinatura.
  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Nenhuma assinatura encontrada nesta conta' },
      { status: 404 }
    )
  }

  const configuration = process.env.STRIPE_PORTAL_CONFIG_ID

  const session = await stripe.billingPortal.sessions.create({
    customer:   profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/billing`,
    ...(configuration ? { configuration } : {}),
  })

  return NextResponse.json({ url: session.url })
}
