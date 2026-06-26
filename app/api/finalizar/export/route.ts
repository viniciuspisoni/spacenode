// POST /api/finalizar/export
//
// Registra uma exportação: persiste o PNG/JPG achatado no Storage e grava uma
// linha em finalize_exports. O download em si já aconteceu no cliente — esta
// rota é best-effort (histórico). NÃO consome Nodes.
//
// FormData: { file: File, project_id?: string, format?: 'png'|'jpg', width?, height? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Arquivo maior que 15 MB' }, { status: 400 })

  const projectId = fd.get('project_id')
  const format = fd.get('format') === 'jpg' ? 'jpg' : 'png'
  const width = Number(fd.get('width')) || null
  const height = Number(fd.get('height')) || null

  const ext = format === 'jpg' ? 'jpg' : 'png'
  const rand = Math.random().toString(36).slice(2, 8)
  const key = `${user.id}/finalizar/export/${Date.now()}-${rand}.${ext}`

  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadErr } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) {
    console.error('[finalizar.export] upload failed:', uploadErr)
    return NextResponse.json({ error: 'Erro ao salvar exportação' }, { status: 500 })
  }
  const { data: { publicUrl } } = admin.storage.from('space-mestres').getPublicUrl(key)

  // Registro best-effort (RLS via cliente user-scoped).
  const { error: insErr } = await supabase.from('finalize_exports').insert({
    user_id: user.id,
    project_id: typeof projectId === 'string' && projectId ? projectId : null,
    png_url: publicUrl,
    format,
    width,
    height,
    file_size_bytes: file.size,
  })
  if (insErr) console.warn('[finalizar.export] registro falhou (segue):', insErr.message)

  return NextResponse.json({ url: publicUrl })
}
