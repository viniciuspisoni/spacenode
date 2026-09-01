// POST /api/uploads/confirm
//
// Passo 3 do upload direto genérico (ver ../sign): confirma que o objeto subiu
// pro path esperado dentro dos limites da área e devolve a URL pública. Em
// áreas com probe, baixa o objeto e mede via sharp — o decode também funciona
// como sniff de assinatura real (conteúdo não-imagem é removido e rejeitado).
//
// Body JSON: { area, key, params? }
// Resposta:  { url, key, size, mime, width?, height? }

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import {
  getDirectUploadArea,
  verifyDirectUpload,
  downloadDirectUpload,
} from '@/lib/storage/direct-upload'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const areaId = typeof body?.area === 'string' ? body.area : ''
  const key    = typeof body?.key  === 'string' ? body.key  : ''
  const params = sanitizeParams(body?.params)

  const area = getDirectUploadArea(areaId)
  if (!area) return NextResponse.json({ error: 'Área de upload inválida' }, { status: 400 })

  const admin = createAdminClient()

  if (!area.probe) {
    const v = await verifyDirectUpload(admin, area, user.id, params, key)
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })
    return NextResponse.json({ url: v.url, key, size: v.size, mime: v.mime })
  }

  // Área com probe: baixa e mede (width/height + validação do conteúdo real).
  const d = await downloadDirectUpload(admin, area, user.id, params, key)
  if (!d.ok) return NextResponse.json({ error: d.message }, { status: d.status })

  try {
    const meta = await sharp(d.buffer).metadata()
    return NextResponse.json({
      url:    d.url,
      key,
      size:   d.size,
      mime:   d.mime,
      width:  meta.width  ?? null,
      height: meta.height ?? null,
    })
  } catch {
    await admin.storage.from(area.bucket).remove([key])
    return NextResponse.json({ error: 'Arquivo não é uma imagem válida' }, { status: 400 })
  }
}

function sanitizeParams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
