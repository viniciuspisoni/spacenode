// POST /api/spaces/[spaceId]/upload-sketch
//
// Recebe 1 sketch (multipart/form-data com `file`) e faz upload pro
// bucket space-mestres no path:
//   {user_id}/sketches/{spaceId}/{timestamp}-{rand}.{ext}
//
// Retorna URL pública. Cliente paraleliza N uploads.
//
// TODO (futuro): lifecycle policy de 7 dias pra sketches em
// {user_id}/sketches/* que nunca foram referenciados por nenhuma vista
// (limpeza periódica via cron interno do Supabase).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES    = 10 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Confirma posse do Space
  const { data: space, error: fetchErr } = await supabase
    .from('spaces')
    .select('id, status')
    .eq('id', spaceId)
    .single()
  if (fetchErr || !space) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  if (space.status !== 'locked') {
    return NextResponse.json(
      { error: 'Space precisa estar travado pra receber sketches' },
      { status: 409 },
    )
  }

  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado (JPG, PNG ou WebP)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Sketch maior que 10 MB' }, { status: 400 })
  }

  const ext  = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 8)
  const key  = `${user.id}/sketches/${spaceId}/${Date.now()}-${rand}.${ext}`

  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[upload-sketch] storage upload failed:', uploadErr)
    return NextResponse.json({ error: 'Erro ao salvar sketch' }, { status: 500 })
  }

  const { data: { publicUrl } } = admin.storage.from('space-mestres').getPublicUrl(key)
  return NextResponse.json({ url: publicUrl })
}
