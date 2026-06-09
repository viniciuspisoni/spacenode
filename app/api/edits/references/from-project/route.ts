// POST /api/edits/references/from-project
//
// Registra uma imagem do PRÓPRIO PROJETO (outro render, vista mestre, outra
// vista) como referência da edição — sem novo upload. Valida posse e devolve um
// descritor EditReferenceImage (source: 'project') que a UI inclui no run.
//
// Body: { image_id, source_type: 'render' | 'vista', role, note? }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEditReferenceRole } from '@/lib/spaces/edit-router'

export const runtime = 'nodejs'

interface Body {
  image_id?:    unknown
  source_type?: unknown
  role?:        unknown
  note?:        unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as Body | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const imageId    = typeof body.image_id === 'string' ? body.image_id : null
  const sourceType = body.source_type === 'vista' ? 'vista' : body.source_type === 'render' ? 'render' : null
  const note       = typeof body.note === 'string' ? body.note.slice(0, 280) : undefined

  if (!imageId || !sourceType) {
    return NextResponse.json({ error: 'image_id e source_type obrigatórios' }, { status: 400 })
  }
  if (!isEditReferenceRole(body.role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 })
  }

  const admin  = createAdminClient()
  const table  = sourceType === 'vista' ? 'vistas' : 'renders'
  const urlCol = sourceType === 'vista' ? 'image_url' : 'output_url'

  const { data, error } = await admin
    .from(table)
    .select(`${urlCol}, user_id`)
    .eq('id', imageId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) {
    return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 })
  }
  const url = (data as Record<string, unknown>)[urlCol]
  if (typeof url !== 'string' || !url) {
    return NextResponse.json({ error: 'Imagem ainda sem URL' }, { status: 409 })
  }

  return NextResponse.json({
    reference: {
      id:              imageId,
      url,
      role:            body.role,
      source:          'project',
      source_image_id: imageId,
      note,
    },
  })
}
