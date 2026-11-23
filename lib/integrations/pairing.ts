// Pareamento por código dos plugins (SketchUp, Archicad, Revit) — a lógica
// das rotas /api/sketchup/pair/* e /api/integrations/pair/*.
//
// Dois modos, uma implementação:
//   * 'sketchup' — as rotas /api/sketchup/* que o plugin SketchUp em campo
//     usa. NUNCA lê nem grava a coluna `platform`: continua funcionando mesmo
//     se o deploy chegar antes da migration 20261122120000.
//   * 'integrations' — as rotas genéricas. O plugin declara a plataforma no
//     /pair/start; a página /integrations/pair confere que o código digitado
//     é da plataforma que ela anuncia.
//
// Desenho de segurança (igual para os dois modos): o plugin guarda só
// { deviceId, deviceSecret }; o refresh token da sessão mintada fica em
// custódia no banco e é rotacionado a cada renovação; revogação server-side
// nega a renovação e o access token em campo morre sozinho em <=1h.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import {
  generatePairCode,
  generateDeviceSecret,
  normalizePairCode,
  sha256Hex,
  mintDeviceSession,
  refreshDeviceSession,
  PAIR_CODE_TTL_SECONDS,
  PAIR_POLL_INTERVAL_SECONDS,
} from '@/lib/sketchup/devices'
import { PLATFORM_LABELS, parsePlatform, type IntegrationPlatform } from '@/lib/integrations/platforms'

export type PairingMode = 'sketchup' | 'integrations'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chaves de rate limit separadas por modo: um Archicad e um SketchUp
// pareando da mesma rede não dividem o mesmo balde. As do modo 'sketchup'
// são as que já existiam.
const RATE_PREFIX: Record<PairingMode, string> = { sketchup: 'skp', integrations: 'int' }

function logTag(mode: PairingMode, step: string) {
  return `[${mode}/pair/${step}]`
}

// ── /pair/start (sem auth — é o INÍCIO do pareamento) ───────────────────────
//
// Body:    { platform (só integrations), deviceName? }
// Retorna: { deviceId, deviceSecret, userCode, verificationUrl,
//            expiresIn, pollInterval }
export async function handlePairStart(req: NextRequest, mode: PairingMode) {
  const admin = createAdminClient()

  const rl = await rateLimit(admin, `${RATE_PREFIX[mode]}-pair-start:${clientIp(req)}`, 10, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)

  let platform: IntegrationPlatform = 'sketchup'
  if (mode === 'integrations') {
    const parsed = parsePlatform(body?.platform)
    if (!parsed) return NextResponse.json({ error: 'Plataforma inválida.' }, { status: 400 })
    platform = parsed
  }
  const fallbackName = PLATFORM_LABELS[platform]
  const deviceName = (typeof body?.deviceName === 'string' ? body.deviceName : fallbackName)
    .trim()
    .slice(0, 60) || fallbackName

  const userCode = generatePairCode()
  const deviceSecret = generateDeviceSecret()
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_SECONDS * 1000)

  const { data, error } = await admin
    .from('sketchup_devices')
    .insert({
      device_name: deviceName,
      status: 'pending',
      code_hash: sha256Hex(userCode),
      secret_hash: sha256Hex(deviceSecret),
      expires_at: expiresAt.toISOString(),
      ...(mode === 'integrations' ? { platform } : {}),
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    console.error(logTag(mode, 'start'), 'insert falhou:', error?.message)
    return NextResponse.json({ error: 'Erro ao iniciar o pareamento.' }, { status: 500 })
  }

  // URL SEM o código: o usuário digita o código (mostrado no painel do
  // plugin) manualmente. Carregar o código aqui permitiria um link
  // pré-preenchido de takeover em 1 clique (RFC 8628 §5.4). O `app` só
  // escolhe o rótulo da página — não é segredo nem autoriza nada.
  const origin = req.nextUrl.origin
  const verificationUrl = mode === 'integrations'
    ? `${origin}/integrations/pair?app=${platform}`
    : `${origin}/sketchup/pair`

  return NextResponse.json({
    deviceId: data.id,
    deviceSecret,
    userCode,
    verificationUrl,
    expiresIn: PAIR_CODE_TTL_SECONDS,
    pollInterval: PAIR_POLL_INTERVAL_SECONDS,
  })
}

// ── /pair/claim (auth = device_secret) ───────────────────────────────────────
//
// Polling do plugin depois do /pair/start. Enquanto o usuário não aprova:
// { status: 'pending' }. Aprovado: renova a sessão em custódia AGORA (o
// refresh rotaciona e o token novo fica guardado) e devolve só o access
// token — o device vira 'active' e o código é descartado.
export async function handlePairClaim(req: NextRequest, mode: PairingMode) {
  const admin = createAdminClient()
  const rl = await rateLimit(admin, `${RATE_PREFIX[mode]}-pair-claim:${clientIp(req)}`, 120, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
  const deviceSecret = typeof body?.deviceSecret === 'string' ? body.deviceSecret : ''
  if (!UUID_RE.test(deviceId) || !deviceSecret) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const { data: device } = await admin
    .from('sketchup_devices')
    .select('id, status, expires_at, refresh_token, user_id')
    .eq('id', deviceId)
    .eq('secret_hash', sha256Hex(deviceSecret))
    .maybeSingle()

  if (!device) return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 })

  if (device.status === 'pending') {
    if (new Date(device.expires_at).getTime() < Date.now()) {
      await admin.from('sketchup_devices').delete().eq('id', device.id).eq('status', 'pending')
      return NextResponse.json({ status: 'expired' }, { status: 410 })
    }
    return NextResponse.json({ status: 'pending' })
  }

  if (device.status !== 'approved' || !device.refresh_token) {
    return NextResponse.json({ error: 'Pareamento inválido. Conecte novamente.' }, { status: 409 })
  }

  // Transição atômica approved→active: só UM claim concorrente vence e faz
  // o refresh. Sem isso, dois polls sobrepostos consomem o MESMO refresh
  // token e a reuse-detection do GoTrue revoga a família (mata o device no
  // primeiro uso). O perdedor recebe pending e reagenda.
  const { data: claimed } = await admin
    .from('sketchup_devices')
    .update({ status: 'active' })
    .eq('id', device.id)
    .eq('status', 'approved')
    .select('refresh_token')
    .maybeSingle()

  if (!claimed?.refresh_token) {
    return NextResponse.json({ status: 'pending' })
  }

  const refreshed = await refreshDeviceSession(claimed.refresh_token)
  if (!refreshed) {
    await admin.from('sketchup_devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), refresh_token: null })
      .eq('id', device.id)
    return NextResponse.json({ error: 'Sessão do dispositivo inválida. Conecte novamente.' }, { status: 409 })
  }

  const { data: email } = await admin
    .from('profiles')
    .select('email')
    .eq('id', device.user_id)
    .maybeSingle()

  await admin.from('sketchup_devices')
    .update({
      status: 'active',
      code_hash: null,
      refresh_token: refreshed.refreshToken,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', device.id)

  return NextResponse.json({
    status: 'ready',
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    userEmail: email?.email ?? null,
  })
}

// ── /pair/refresh (auth = device_secret) ─────────────────────────────────────
//
// Renovação do access token do dispositivo. O refresh token nunca sai do
// servidor; revogação server-side nega a renovação.
export async function handlePairRefresh(req: NextRequest, mode: PairingMode) {
  const admin = createAdminClient()
  const rl = await rateLimit(admin, `${RATE_PREFIX[mode]}-pair-refresh:${clientIp(req)}`, 60, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : ''
  const deviceSecret = typeof body?.deviceSecret === 'string' ? body.deviceSecret : ''
  if (!UUID_RE.test(deviceId) || !deviceSecret) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const { data: device } = await admin
    .from('sketchup_devices')
    .select('id, status, refresh_token, revoked_at')
    .eq('id', deviceId)
    .eq('secret_hash', sha256Hex(deviceSecret))
    .maybeSingle()

  if (!device || device.status !== 'active' || device.revoked_at || !device.refresh_token) {
    return NextResponse.json({ error: 'Dispositivo desconectado. Conecte novamente.' }, { status: 401 })
  }

  const usedToken = device.refresh_token
  const refreshed = await refreshDeviceSession(usedToken)
  if (!refreshed) {
    // Refresh negado upstream (sessão morta/família revogada) — encerra o
    // device, mas só se a linha ainda tem O TOKEN que tentamos (senão outro
    // refresh concorrente já rotacionou e a falha é de um token obsoleto).
    await admin.from('sketchup_devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), refresh_token: null })
      .eq('id', device.id)
      .eq('refresh_token', usedToken)
    return NextResponse.json({ error: 'Sessão expirada. Conecte novamente.' }, { status: 401 })
  }

  // Write-back guardado: só grava o token rotacionado se a linha ainda
  // contém o token de onde partimos (nunca sobrescreve rotação concorrente).
  await admin.from('sketchup_devices')
    .update({ refresh_token: refreshed.refreshToken, last_seen_at: new Date().toISOString() })
    .eq('id', device.id)
    .eq('refresh_token', usedToken)

  return NextResponse.json({
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  })
}

// ── /pair/approve (cookie — usuário logado no navegador) ─────────────────────
//
// Aprova um código pendente e MINTA uma sessão Supabase nova pro dispositivo
// (generateLink+verifyOtp — sem e-mail). O refresh token fica em custódia na
// linha do device; o plugin nunca o vê.
//
// Body: { code, platform? (só integrations) }  →  { ok, deviceName, platform? }
export async function handlePairApprove(req: NextRequest, mode: PairingMode) {
  // Cookie APENAS: a aprovação tem que vir do navegador logado do usuário,
  // nunca de um Bearer (um token vazado não pode aprovar novos dispositivos).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, `${RATE_PREFIX[mode]}-pair-approve:${user.id}`, 10, 600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const code = normalizePairCode(typeof body?.code === 'string' ? body.code : '')
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
  }
  // A página anuncia uma plataforma ("Conectar o Archicad"); um código de
  // outro plugin não pode ser aprovado debaixo desse rótulo.
  const expectedPlatform = mode === 'integrations' ? parsePlatform(body?.platform) : null

  const { data: device } = await admin
    .from('sketchup_devices')
    .select(mode === 'integrations'
      ? 'id, status, expires_at, device_name, platform'
      : 'id, status, expires_at, device_name')
    .eq('code_hash', sha256Hex(code))
    .maybeSingle<{ id: string; status: string; expires_at: string; device_name: string; platform?: string }>()

  const devicePlatform = parsePlatform(device?.platform) ?? 'sketchup'
  if (
    !device ||
    device.status !== 'pending' ||
    (expectedPlatform && expectedPlatform !== devicePlatform)
  ) {
    return NextResponse.json({ error: 'Código não encontrado ou já usado.' }, { status: 404 })
  }
  if (new Date(device.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: `Código expirado. Gere um novo no ${PLATFORM_LABELS[devicePlatform]}.` },
      { status: 410 },
    )
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

  return NextResponse.json({
    ok: true,
    deviceName: device.device_name,
    ...(mode === 'integrations' ? { platform: devicePlatform } : {}),
  })
}

// ── /devices (cookie) ────────────────────────────────────────────────────────
//
// GET lista os dispositivos do usuário; POST { action: 'revoke', deviceId }.
// Revogar corta a renovação na hora (o refresh token custodiado é apagado);
// o access token em campo expira sozinho em <=1h. Cookie APENAS — um Bearer
// de dispositivo não pode listar nem revogar dispositivos.
export async function handleDevicesList(mode: PairingMode) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sketchup_devices')
    .select(mode === 'integrations'
      ? 'id, device_name, platform, status, created_at, approved_at, last_seen_at, revoked_at'
      : 'id, device_name, status, created_at, approved_at, last_seen_at, revoked_at')
    .eq('user_id', user.id)
    .in('status', ['active', 'revoked'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Falha ao carregar' }, { status: 500 })
  return NextResponse.json({ devices: data ?? [] })
}

export async function handleDevicesRevoke(req: NextRequest) {
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
