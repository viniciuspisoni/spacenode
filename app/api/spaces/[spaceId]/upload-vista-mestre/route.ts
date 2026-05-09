// POST /api/spaces/[spaceId]/upload-vista-mestre
//
// Recebe multipart/form-data com `file`. Faz upload pro bucket
// `space-mestres` no path `{user_id}/{spaceId}/mestre-{timestamp}.{ext}`
// e atualiza spaces.vista_mestre_url.
//
// Não consome nodes. Nodes são debitados na extração de DNA.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BYTES   = 15 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Confirma posse do Space e que ainda permite alteração de Vista Mestre.
  const { data: space, error: fetchErr } = await supabase
    .from('spaces')
    .select('id, status')
    .eq('id', spaceId)
    .single()

  if (fetchErr || !space) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  if (space.status === 'locked' || space.status === 'archived') {
    return NextResponse.json(
      { error: 'Space travado — Vista Mestre não pode ser substituída' },
      { status: 409 },
    )
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado (JPG, PNG ou WebP)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Imagem maior que 15 MB' }, { status: 400 })
  }

  const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const key = `${user.id}/${spaceId}/mestre-${Date.now()}.${ext}`

  // Service-role faz upload bypassando RLS — a rota já validou o caller.
  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('space-mestres')
    .upload(key, buffer, { contentType: file.type, upsert: true })

  if (uploadErr) {
    console.error('[upload-vista-mestre] storage upload failed:', uploadErr)
    return NextResponse.json({ error: 'Erro ao salvar imagem' }, { status: 500 })
  }

  const { data: { publicUrl } } = admin.storage.from('space-mestres').getPublicUrl(key)

  const { error: updErr } = await supabase
    .from('spaces')
    .update({ vista_mestre_url: publicUrl, status: 'draft' })
    .eq('id', spaceId)

  if (updErr) {
    console.error('[upload-vista-mestre] update spaces failed:', updErr)
    return NextResponse.json({ error: 'Erro ao salvar referência' }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}
