// POST /api/edits/references/upload
//
// Upload de uma imagem de REFERÊNCIA da edição (textura, objeto, etc.) + papel.
// FormData: { file, role, note? }. Devolve um descritor EditReferenceImage que a
// UI inclui no payload de /api/edits (a persistência em edit_reference_assets
// acontece no run, ligada à tentativa).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEditReferenceRole } from '@/lib/spaces/edit-router'
import { uploadReferenceAsset } from '@/lib/spaces/edit-route-helpers'

export const runtime = 'nodejs'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const fd   = await req.formData()
  const file = fd.get('file')
  const role = fd.get('role')
  const note = fd.get('note')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })
  }
  if (!isEditReferenceRole(role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Formato não suportado (jpg, png, webp)' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo maior que 8 MB' }, { status: 400 })
  }

  const admin  = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    const meta = await uploadReferenceAsset(admin, user.id, buffer)
    return NextResponse.json({
      reference: {
        id:              meta.url,
        url:             meta.url,
        role,
        source:          'upload',
        note:            typeof note === 'string' && note ? note.slice(0, 280) : undefined,
        width:           meta.width,
        height:          meta.height,
        file_size_bytes: meta.fileSize,
        mime_type:       meta.mime,
      },
    })
  } catch (e) {
    console.error('[edits.references.upload]', (e as Error).message)
    return NextResponse.json({ error: 'Erro ao salvar referência' }, { status: 500 })
  }
}
