// POST /api/spaces/[spaceId]/upload-vista-mestre/sign
//
// Passo 1 do upload direto da Vista Mestre: valida posse/estado do Space e o
// arquivo declarado, e emite uma signed upload URL do Storage. O browser então
// faz o PUT direto no bucket (uploadToSignedUrl) sem trafegar pela Vercel — o
// arquivo nunca passa por uma Function, então o teto de 4,5 MB não se aplica.
// Passo 2 é o PUT no browser; passo 3 é ../confirm, que grava a referência.
//
// Não consome nodes. Nodes são debitados na extração de DNA.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  VISTA_MESTRE_BUCKET,
  VISTA_MESTRE_MAX_BYTES,
  VISTA_MESTRE_ALLOWED_MIME,
  requireEditableSpace,
} from '@/lib/spaces/vista-mestre-upload'

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const guard = await requireEditableSpace(supabase, spaceId)
  if (guard.error) return guard.error

  const body = await req.json().catch(() => null)
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const sizeBytes   = typeof body?.sizeBytes   === 'number' ? body.sizeBytes   : NaN

  if (!VISTA_MESTRE_ALLOWED_MIME.includes(contentType)) {
    return NextResponse.json({ error: 'Formato não suportado (JPG, PNG ou WebP)' }, { status: 400 })
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (sizeBytes > VISTA_MESTRE_MAX_BYTES) {
    return NextResponse.json({ error: 'Imagem maior que 15 MB' }, { status: 400 })
  }

  const ext = (contentType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const key = `${user.id}/${spaceId}/mestre-${Date.now()}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(VISTA_MESTRE_BUCKET)
    .createSignedUploadUrl(key)

  if (error || !data?.token) {
    console.error('[upload-vista-mestre/sign] createSignedUploadUrl falhou:', error?.message)
    return NextResponse.json({ error: 'Erro ao preparar upload' }, { status: 500 })
  }

  return NextResponse.json({ bucket: VISTA_MESTRE_BUCKET, key, token: data.token })
}
