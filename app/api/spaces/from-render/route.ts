// POST /api/spaces/from-render
//
// Cria um Space novo usando uma render existente como Vista Mestre.
// O Space nasce com status 'draft' + vista_mestre_url já populada da render +
// source_render_id + source_metadata (snapshot das configs do Renderizar).
//
// Não extrai DNA aqui — cliente chama /api/spaces/[id]/extract-dna depois,
// que detecta source_metadata e roda o prompt enriquecido.
//
// Cobrança: criar Space é grátis. Os 8 nodes da extração de DNA continuam
// sendo cobrados na extract-dna como em qualquer outro fluxo.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEngineId, type EngineId } from '@/lib/engines'
import { isSpaceCategory } from '@/lib/spaces/types'
import { signRow } from '@/lib/storage/signed'

interface FromRenderBody {
  render_id?:       unknown
  name?:            unknown
  category?:        unknown
  engine_override?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as FromRenderBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const renderId = typeof body.render_id === 'string' ? body.render_id : null
  if (!renderId) {
    return NextResponse.json({ error: 'render_id é obrigatório' }, { status: 400 })
  }

  const name = (typeof body.name === 'string' ? body.name : '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Nome do projeto muito longo (máx. 80)' }, { status: 400 })
  }

  if (!isSpaceCategory(body.category)) {
    return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
  }

  const engineOverride =
    body.engine_override === undefined || body.engine_override === null
      ? null
      : (isEngineId(body.engine_override) ? body.engine_override : undefined)
  if (engineOverride === undefined) {
    return NextResponse.json({ error: 'engine_override inválido' }, { status: 400 })
  }

  // Carrega a render — RLS valida posse pelo user.
  const { data: render, error: renderErr } = await supabase
    .from('renders')
    .select('id, output_url, engine, resolution, ambient, style, lighting, prompt, config_snapshot, created_at')
    .eq('id', renderId)
    .single()

  if (renderErr || !render) {
    return NextResponse.json(
      { error: 'Esta render não está mais disponível' },
      { status: 404 },
    )
  }
  if (!render.output_url) {
    return NextResponse.json(
      { error: 'Render sem imagem final — não pode virar Vista Mestre' },
      { status: 409 },
    )
  }

  const inheritedEngine = (render.engine as EngineId | null) ?? 'vega'
  const finalEngine: EngineId = engineOverride ?? inheritedEngine

  const sourceMetadata = {
    engine:                inheritedEngine,
    qualidade:             render.resolution ?? null,
    render_aprovada_em:    render.created_at,
    config_snapshot:       render.config_snapshot ?? null,
    // Campos derivados pra UI legível ("origem: Renderizar"):
    rendered_via_engine:   inheritedEngine,
    rendered_via_lighting: render.lighting ?? null,
    rendered_via_ambient:  render.ambient ?? null,
    rendered_via_style:    render.style ?? null,
  }

  const { data: space, error: spaceErr } = await supabase
    .from('spaces')
    .insert({
      user_id:          user.id,
      name,
      category:         body.category,
      engine:           finalEngine,
      status:           'draft',
      vista_mestre_url: render.output_url,
      source_render_id: render.id,
      source_metadata:  sourceMetadata,
    })
    .select('id, name, category, engine, status, vista_mestre_url, source_render_id')
    .single()

  if (spaceErr || !space) {
    console.error('[spaces.from-render] insert failed:', spaceErr)
    return NextResponse.json({ error: 'Erro ao criar Space' }, { status: 500 })
  }

  // vista_mestre_url aqui é a output_url da render (FAL hoje → no-op; pronto p/ B3).
  const signedSpace = await signRow(createAdminClient(), space, ['vista_mestre_url'])
  return NextResponse.json({ space: signedSpace }, { status: 201 })
}
