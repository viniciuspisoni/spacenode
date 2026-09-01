// POST /api/spaces/[spaceId]/upload-vista-mestre/confirm
//
// Passo 3 do upload direto da Vista Mestre (ver ../sign): recebe a `key`
// emitida pela sign, verifica que o objeto realmente subiu pro bucket com os
// limites respeitados e grava spaces.vista_mestre_url (formato de URL pública,
// convenção do repo — read-sites assinam na emissão quando o bucket for
// privado; ver lib/storage/signed.ts).
//
// Não consome nodes. Nodes são debitados na extração de DNA.

import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  VISTA_MESTRE_BUCKET,
  VISTA_MESTRE_MAX_BYTES,
  VISTA_MESTRE_ALLOWED_MIME,
  VISTA_MESTRE_FILE_RE,
  requireEditableSpace,
} from '@/lib/spaces/vista-mestre-upload'

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  // Cookie (browser) ou Bearer (plugin SketchUp) — client RLS do usuário.
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const guard = await requireEditableSpace(supabase, spaceId)
  if (guard.error) return guard.error

  const body = await req.json().catch(() => null)
  const key  = typeof body?.key === 'string' ? body.key : ''

  const prefix   = `${user.id}/${spaceId}/`
  const fileName = key.slice(prefix.length)
  if (!key.startsWith(prefix) || !VISTA_MESTRE_FILE_RE.test(fileName)) {
    return NextResponse.json({ error: 'Chave de upload inválida' }, { status: 400 })
  }

  // Confirma que o objeto existe no bucket antes de gravar a referência.
  const admin = createAdminClient()
  const { data: entries, error: listErr } = await admin.storage
    .from(VISTA_MESTRE_BUCKET)
    .list(`${user.id}/${spaceId}`, { search: fileName, limit: 100 })

  const obj = entries?.find(e => e.name === fileName)
  if (listErr || !obj) {
    return NextResponse.json(
      { error: 'Upload não encontrado — envie a imagem novamente' },
      { status: 400 },
    )
  }

  // Redundante com file_size_limit/allowed_mime_types do bucket; barato e
  // explícito caso a config do bucket mude.
  const meta = obj.metadata as { size?: number; mimetype?: string } | null
  const size = meta?.size ?? 0
  const mime = meta?.mimetype ?? ''
  if (size > VISTA_MESTRE_MAX_BYTES || !VISTA_MESTRE_ALLOWED_MIME.includes(mime)) {
    await admin.storage.from(VISTA_MESTRE_BUCKET).remove([key])
    return NextResponse.json(
      { error: 'Arquivo inválido (JPG, PNG ou WebP até 15 MB)' },
      { status: 400 },
    )
  }

  const { data: { publicUrl } } = admin.storage.from(VISTA_MESTRE_BUCKET).getPublicUrl(key)

  const { error: updErr } = await supabase
    .from('spaces')
    .update({ vista_mestre_url: publicUrl, status: 'draft' })
    .eq('id', spaceId)

  if (updErr) {
    console.error('[upload-vista-mestre/confirm] update spaces falhou:', updErr)
    return NextResponse.json({ error: 'Erro ao salvar referência' }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}
