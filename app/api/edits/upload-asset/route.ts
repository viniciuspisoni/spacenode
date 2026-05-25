// POST /api/edits/upload-asset
//
// Upload genérico de asset (imagem source ou máscara PNG) pra Retocar.
// FormData:
//   file: File
//   kind: 'source' | 'mask'
//
// Salva em bucket space-mestres no path:
//   {user_id}/retocar/{kind}/{timestamp}-{rand}.{ext}
//
// TODO (futuro): lifecycle policy de 7 dias pra máscaras nunca referenciadas.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_SOURCE = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_MIME_MASK   = ['image/png']  // máscara é sempre PNG (preto = preserve, branco = edit)

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
  if (kind !== 'source' && kind !== 'mask') {
    return NextResponse.json({ error: 'kind inválido' }, { status: 400 })
  }
  const allowed = kind === 'mask' ? ALLOWED_MIME_MASK : ALLOWED_MIME_SOURCE
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo maior que 10 MB' }, { status: 400 })
  }

  const ext  = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 8)
  const key  = `${user.id}/retocar/${kind}/${Date.now()}-${rand}.${ext}`

  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[edits.upload-asset] storage upload failed:', uploadErr)
    return NextResponse.json({ error: 'Erro ao salvar arquivo' }, { status: 500 })
  }

  const { data: { publicUrl } } = admin.storage.from('space-mestres').getPublicUrl(key)
  return NextResponse.json({ url: publicUrl })
}
