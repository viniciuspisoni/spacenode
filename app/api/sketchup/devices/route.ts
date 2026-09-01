// GET  /api/sketchup/devices   — lista os dispositivos do usuário (cookie)
// POST /api/sketchup/devices   — { action: 'revoke', deviceId } (cookie)
//
// Revogar corta a renovação na hora (o refresh token custodiado é apagado);
// o access token em campo expira sozinho em <=1h.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sketchup_devices')
    .select('id, device_name, status, created_at, approved_at, last_seen_at, revoked_at')
    .eq('user_id', user.id)
    .in('status', ['active', 'revoked'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  return NextResponse.json({ devices: data ?? [] })
}

export async function POST(req: NextRequest) {
  // Cookie APENAS — um Bearer de dispositivo não pode revogar dispositivos.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
  if (body?.action !== 'revoke' || !UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sketchup_devices')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), refresh_token: null })
    .eq('id', deviceId)
    .eq('user_id', user.id)
    .neq('status', 'revoked')
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Falha ao revogar' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
