import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { replenishAnnualNodes } from '@/lib/billing/annual'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const result = await replenishAnnualNodes(new Stripe(process.env.STRIPE_SECRET_KEY!), createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[cron/annual-nodes] falha na recarga mensal:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
