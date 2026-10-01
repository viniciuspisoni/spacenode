import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contactCaptureEnabled } from '@/lib/customer-contact/server'
import { parseContactInput } from '@/lib/customer-contact/validation'

export async function PUT(request: NextRequest) {
  if (!contactCaptureEnabled()) return NextResponse.json({ error: 'Indisponível.' }, { status: 503 })
  // This endpoint is for the same-origin account form, never channel webhooks.
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Formato inválido.' }, { status: 415 })
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Entre novamente para salvar.' }, { status: 401 })
  let input
  try {
    const text = await request.text()
    if (text.length > 1024) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 413 })
    input = parseContactInput(JSON.parse(text))
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }
  if (!input) return NextResponse.json({ error: 'Confira o WhatsApp com DDD e suas preferências.' }, { status: 400 })

  // The authenticated session owns the row. Never accept user_id or exemption from the request.
  // A database trigger timestamps and audits preference changes in this same transaction.
  const { error } = await createAdminClient().from('customer_contacts').upsert({
    user_id: user.id, ...input, signup_exempt: false, source: 'account_form',
  }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: 'Não foi possível salvar. Tente novamente.' }, { status: 503 })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
