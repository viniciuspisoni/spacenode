import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SpaceCategory, ProjectDNA } from '@/lib/spaces/types'

fal.config({ credentials: process.env.FAL_KEY })

// ── GET /api/spaces — lista todos os Spaces do usuário ────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[GET /api/spaces]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ spaces: data ?? [] })
}

// ── POST /api/spaces — cria novo Space + Vista Mestre ─────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: {
    name?: string
    category?: SpaceCategory
    anchor_image_base64?: string
    project_dna?: ProjectDNA
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { name, category, anchor_image_base64, project_dna } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }
  if (!category || !['residencial', 'comercial', 'conceito'].includes(category)) {
    return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
  }
  if (!anchor_image_base64) {
    return NextResponse.json({ error: 'Imagem Anchor é obrigatória' }, { status: 400 })
  }

  const dna: ProjectDNA = {
    style:     project_dna?.style     ?? '',
    materials: project_dna?.materials ?? '',
    palette:   project_dna?.palette   ?? [],
    context:   project_dna?.context   ?? '',
    lighting:  project_dna?.lighting  ?? '',
  }

  // 1. Upload da Anchor para fal.storage
  let anchorUrl: string
  try {
    const base64Data = anchor_image_base64.includes(',')
      ? anchor_image_base64.split(',')[1]
      : anchor_image_base64
    const buffer = Buffer.from(base64Data, 'base64')
    const imageFile = new File([buffer], 'anchor.jpg', { type: 'image/jpeg' })
    anchorUrl = await fal.storage.upload(imageFile)
  } catch (err) {
    console.error('[POST /api/spaces] upload erro:', err)
    return NextResponse.json({ error: 'Falha no upload da imagem' }, { status: 500 })
  }

  const admin = createAdminClient()

  // 2. Inserir Space (anchor_render_id null por enquanto)
  const { data: spaceRow, error: spaceErr } = await admin
    .from('spaces')
    .insert({
      user_id:         user.id,
      name:            name.trim(),
      category,
      anchor_render_id: null,
      project_dna:     dna,
    })
    .select()
    .single()

  if (spaceErr || !spaceRow) {
    console.error('[POST /api/spaces] insert space:', spaceErr)
    return NextResponse.json({ error: 'Erro ao criar Space' }, { status: 500 })
  }

  // 3. Criar Vista Mestre no renders
  const { data: renderRow, error: renderErr } = await admin
    .from('renders')
    .insert({
      user_id:         user.id,
      input_url:       anchorUrl,
      output_url:      anchorUrl,
      prompt:          '',
      ambient:         'Anchor',
      style:           'mestre',
      lighting:        '',
      status:          'completed',
      cost_credits:    0,
      completed_at:    new Date().toISOString(),
      space_id:        spaceRow.id,
      parent_render_id: null,
      vista_type:      'mestre',
      generation_mode: 'coerente',
      dna_overrides:   {},
      vista_label:     'Vista Mestre',
    })
    .select()
    .single()

  if (renderErr || !renderRow) {
    console.error('[POST /api/spaces] insert render:', renderErr)
    // Rollback: delete the space
    await admin.from('spaces').delete().eq('id', spaceRow.id)
    return NextResponse.json({ error: 'Erro ao criar Vista Mestre' }, { status: 500 })
  }

  // 4. Atualizar anchor_render_id no Space
  const { data: updatedSpace, error: updateErr } = await admin
    .from('spaces')
    .update({ anchor_render_id: renderRow.id })
    .eq('id', spaceRow.id)
    .select()
    .single()

  if (updateErr || !updatedSpace) {
    console.error('[POST /api/spaces] update anchor_render_id:', updateErr)
    return NextResponse.json({ error: 'Erro ao vincular Anchor' }, { status: 500 })
  }

  return NextResponse.json(
    { space: updatedSpace, anchor_vista: renderRow },
    { status: 201 }
  )
}
