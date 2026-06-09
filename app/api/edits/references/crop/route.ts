// POST /api/edits/references/crop
//
// Reference focus (V1.1): recorta a ÁREA RELEVANTE de uma imagem de referência
// do projeto (ex.: só a planta da vista mestre) e devolve um descritor de
// referência apontando para o crop. Assim o provider recebe só o elemento, não
// a vista inteira — melhora muito a aderência da consistência entre vistas.
//
// Body: { source_url, left, top, width, height (normalizados 0–1), role, note? }

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEditReferenceRole } from '@/lib/spaces/edit-router'
import { uploadReferenceAsset } from '@/lib/spaces/edit-route-helpers'
import { fetchImageBuffer } from '@/lib/spaces/edit-crop'

export const runtime = 'nodejs'

interface Body {
  source_url?: unknown
  left?:       unknown
  top?:        unknown
  width?:      unknown
  height?:     unknown
  role?:       unknown
  note?:       unknown
}

function num01(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const sourceUrl = typeof body.source_url === 'string' ? body.source_url : null
  const left = num01(body.left), top = num01(body.top)
  const width = num01(body.width), height = num01(body.height)

  if (!sourceUrl) return NextResponse.json({ error: 'source_url obrigatório' }, { status: 400 })
  if (!isEditReferenceRole(body.role)) return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  if (left == null || top == null || width == null || height == null || width <= 0.01 || height <= 0.01) {
    return NextResponse.json({ error: 'crop inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  try {
    const buf  = await fetchImageBuffer(sourceUrl)
    const meta = await sharp(buf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    if (!W || !H) return NextResponse.json({ error: 'Imagem inválida' }, { status: 409 })

    const cl = Math.max(0, Math.min(W - 1, Math.round(left * W)))
    const ct = Math.max(0, Math.min(H - 1, Math.round(top * H)))
    const cw = Math.max(1, Math.min(W - cl, Math.round(width * W)))
    const ch = Math.max(1, Math.min(H - ct, Math.round(height * H)))

    const cropBuf = await sharp(buf).extract({ left: cl, top: ct, width: cw, height: ch }).jpeg({ quality: 95 }).toBuffer()
    const uploaded = await uploadReferenceAsset(admin, user.id, cropBuf)

    return NextResponse.json({
      reference: {
        id:     uploaded.url,
        url:    uploaded.url,
        role:   body.role,
        source: 'project',
        note:   typeof body.note === 'string' ? body.note.slice(0, 280) : undefined,
      },
    })
  } catch (e) {
    console.error('[edits.references.crop]', (e as Error).message)
    return NextResponse.json({ error: 'Erro ao recortar referência' }, { status: 500 })
  }
}
