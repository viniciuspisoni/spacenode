// POST /api/finalizar/export
//
// Registra uma exportação: o PNG/JPG achatado já subiu DIRETO pro Storage
// (uploadDirect, área finalizar-export — sem passar pela Vercel); esta rota
// valida a key, resolve a URL pública e grava uma linha em finalize_exports.
// O download em si já aconteceu no cliente — isto é best-effort (histórico).
// NÃO consome Nodes.
//
// Body JSON: { key: string, project_id?: string, format?: 'png'|'jpg'|'webp', width?, height? }
//
// NOTA webp: o CHECK de finalize_exports.format só aceita 'png'/'jpg' até a
// migration 20260710 ser aplicada — o insert de webp falha e é registrado como
// warn (best-effort); o arquivo em si sobe normalmente e a versão fica no
// document do projeto.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIRECT_UPLOAD_AREAS, verifyDirectUpload } from '@/lib/storage/direct-upload'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const key = typeof body?.key === 'string' ? body.key : ''
  const projectId = typeof body?.project_id === 'string' && body.project_id ? body.project_id : null
  const format = body?.format === 'jpg' || body?.format === 'webp' ? body.format : 'png'
  const width = Number(body?.width) || null
  const height = Number(body?.height) || null

  const admin = createAdminClient()
  const v = await verifyDirectUpload(admin, DIRECT_UPLOAD_AREAS['finalizar-export'], user.id, {}, key)
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status })

  // Registro best-effort (RLS via cliente user-scoped).
  const { error: insErr } = await supabase.from('finalize_exports').insert({
    user_id: user.id,
    project_id: projectId,
    png_url: v.url,
    format,
    width,
    height,
    file_size_bytes: v.size,
  })
  if (insErr) console.warn('[finalizar.export] registro falhou (segue):', insErr.message)

  return NextResponse.json({ url: v.url })
}
