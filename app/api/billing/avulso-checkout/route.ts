// POST /api/billing/avulso-checkout
//
// STUB durante Bloco 1 — venda de Lumens via Stripe começa em agosto.
// A UI completa fica preparada; este endpoint apenas indica indisponibilidade.
// Quando ativar, substituir por chamada real à Stripe Checkout (price ID lookup
// via STRIPE_PRICE_ID_LUMEN_{SIZE}).

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:   'available_in_august',
      message: 'A compra avulsa de Lumens estará disponível em agosto.',
    },
    { status: 503 },
  )
}
