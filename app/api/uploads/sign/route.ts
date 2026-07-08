// POST /api/uploads/sign
//
// Passo 1 do upload direto genérico (ver lib/storage/direct-upload.ts): valida
// a área/params/arquivo declarado (+ authorize da área, ex.: posse do Space) e
// emite uma signed upload URL. O browser faz o PUT direto no bucket — o binário
// nunca passa pela Vercel, então o teto de 4,5 MB de corpo não se aplica.
//
// Body JSON: { area, contentType, sizeBytes, params? }
// Resposta:  { bucket, key, token }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDirectUploadArea, buildDirectUploadKey } from '@/lib/storage/direct-upload'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const areaId      = typeof body?.area        === 'string' ? body.area        : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const sizeBytes   = typeof body?.sizeBytes   === 'number' ? body.sizeBytes   : NaN
  const params      = sanitizeParams(body?.params)

  const area = getDirectUploadArea(areaId)
  if (!area) return NextResponse.json({ error: 'Área de upload inválida' }, { status: 400 })

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (sizeBytes > area.maxBytes) {
    const mb = Math.floor(area.maxBytes / 1024 / 1024)
    return NextResponse.json({ error: `Arquivo maior que ${mb} MB` }, { status: 400 })
  }

  if (area.authorize) {
    const denied = await area.authorize(supabase, user.id, params)
    if (denied) return NextResponse.json({ error: denied.message }, { status: denied.status })
  }

  const key = buildDirectUploadKey(area, user.id, params, contentType)
  if (!key) {
    return NextResponse.json({ error: 'Formato não suportado pra esta área de upload' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(area.bucket).createSignedUploadUrl(key)
  if (error || !data?.token) {
    console.error('[uploads/sign] createSignedUploadUrl falhou:', error?.message)
    return NextResponse.json({ error: 'Erro ao preparar upload' }, { status: 500 })
  }

  return NextResponse.json({ bucket: area.bucket, key, token: data.token })
}

function sanitizeParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
