// POST /api/finalizar/upload
//
// Upload de asset da ferramenta Finalizar (imagem source, máscara PNG ou thumb).
// FormData: { file: File, kind: 'source' | 'mask' | 'thumb' }
//
// Salva no bucket público space-mestres em:
//   {user_id}/finalizar/{kind}/{timestamp}-{rand}.{ext}
//
// NÃO consome Nodes — é só armazenamento. Escrita via service-role após validar
// o usuário (mesmo padrão de /api/edits/upload-asset).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_BYTES = 15 * 1024 * 1024 // limite do bucket space-mestres
const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_MASK = ['image/png']
const KINDS = ['source', 'mask', 'thumb'] as const

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const fd = await req.formData()
  const file = fd.get('file')
  const kind = fd.get('kind')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (typeof kind !== 'string' || !KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: 'kind inválido' }, { status: 400 })
  }
  const allowed = kind === 'mask' ? ALLOWED_MASK : ALLOWED_IMAGE
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo maior que 15 MB' }, { status: 400 })
  }

  const ext = (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 8)
  const key = `${user.id}/finalizar/${kind}/${Date.now()}-${rand}.${ext}`

  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[finalizar.upload] storage upload failed:', uploadErr)
    return NextResponse.json({ error: 'Erro ao salvar arquivo' }, { status: 500 })
  }

  const { data: { publicUrl } } = admin.storage.from('space-mestres').getPublicUrl(key)
  return NextResponse.json({ url: publicUrl })
}
