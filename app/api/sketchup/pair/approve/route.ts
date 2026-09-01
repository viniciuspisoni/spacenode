// POST /api/sketchup/pair/approve  (cookie — usuário logado no navegador)
//
// Aprova um código de pareamento pendente e MINTA uma sessão Supabase nova
// pro dispositivo (generateLink+verifyOtp — sem e-mail). O refresh token
// fica em custódia na linha do device; o plugin nunca o vê.
//
// Body: { code }  →  { ok: true, deviceName }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { normalizePairCode, sha256Hex, mintDeviceSession } from '@/lib/sketchup/devices'

export async function POST(req: NextRequest) {
  // Cookie APENAS: a aprovação tem que vir do navegador logado do usuário,
  // nunca de um Bearer (um token vazado não pode aprovar novos dispositivos).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `skp-pair-approve:${user.id}`, 10, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const code = normalizePairCode(typeof body?.code === 'string' ? body.code : '')
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
  }

  const { data: device } = await admin
    .from('sketchup_devices')
    .select('id, status, expires_at, device_name')
    .eq('code_hash', sha256Hex(code))
    .maybeSingle()

  if (!device || device.status !== 'pending') {
    return NextResponse.json({ error: 'Código não encontrado ou já usado.' }, { status: 404 })
  }
  if (new Date(device.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Código expirado. Gere um novo no SketchUp.' }, { status: 410 })
  }

  // Client anon DESCARTÁVEL: o verifyOtp gravaria a sessão no client usado.
  const anonDisposable = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const minted = await mintDeviceSession(admin, anonDisposable, user.email)
  if (!minted) {
    return NextResponse.json({ error: 'Erro ao preparar a sessão do dispositivo.' }, { status: 500 })
  }

  // Claim atômico do pending: se dois approves correrem, só um vence.
  const { data: updated, error } = await admin
    .from('sketchup_devices')
    .update({
      user_id: user.id,
      status: 'approved',
      refresh_token: minted.refreshToken,
      approved_at: new Date().toISOString(),
    })
    .eq('id', device.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error || !updated) {
    return NextResponse.json({ error: 'Código não encontrado ou já usado.' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, deviceName: device.device_name })
}
