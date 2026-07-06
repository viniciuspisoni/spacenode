// POST /api/spaces/[spaceId]/generate
//
// Gera 1+ variações para um Space travado, reusando a stack do Renderizar
// (`buildFidelityPrompt` + briefing arquitetônico). Princípios:
//   - Vista Mestre é a única referência de imagem (image_urls = [mestre]).
//   - briefing arquitetônico (extraído junto do DNA) entra no prompt
//     pra travar geometria/aberturas/câmera/entorno.
//   - DNA visual reforça materiais (via `materials` derivados).
//   - axis_value vira o campo `lighting` em inglês — buildFidelityPrompt
//     já tem wrapper que impede o modelo de adicionar fixtures novos.
//   - fidelityLevel = 'maximum' (mesmo padrão do Renderizar).
//
// Pipeline por vista: debit (consume_nodes_v2) → row pendente em vistas
// (status='processing') → call FAL → update row pra completed. Refund
// best-effort em qualquer falha pós-débito.

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { ENGINES, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { findAxisOption } from '@/lib/spaces/axes'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import { isAxis, isQuality, type Axis, type ProjectDNA, type Space } from '@/lib/spaces/types'
import {
  buildFidelityPrompt,
  type GenerateOptions,
  type ProjectType,
  type ProjectMaterials,
  type BriefingArquitetonico,
} from '@/lib/prompts'
import { spacesPreserveV2Enabled, visionPreservationCheckEnabled } from '@/lib/spaces/preserve-flags'
import {
  modeForAxis, levelForAxis, modeAllowsCloserCrop,
  type SpacesMode, type SpacesPreservationLevel,
} from '@/lib/spaces/preservation'
import { buildSpacesPreservePrompt } from '@/lib/spaces/preserve-prompt'
import { computeSourceMeta, aspectRatioLabel, type SourceMeta } from '@/lib/spaces/source-meta'
import { validateGeneration, checkArchitecturalPreservation } from '@/lib/spaces/preserve-validate'

fal.config({ credentials: process.env.FAL_KEY })

// A Vercel mata a função no maxDuration. As vistas geram em paralelo
// (Promise.allSettled), então o cap precisa cobrir a vista mais lenta — não a
// soma. 300s dá folga sobre o maior FAL_TIMEOUT_MS abaixo.
export const maxDuration = 300

// Timeout da chamada FAL por motor (espelha o /api/generate do Renderizar).
// Vega (Nano Banana Pro) e Quasar (GPT Image 2) passam de 90s com frequência,
// independente do tamanho da imagem. Pulsar (Nano Banana 2) é rápido. 90s flat
// fazia a geração falhar com "tempo limite excedido" mesmo em imagem pequena.
const FAL_TIMEOUT_MS: Record<EngineId, number> = {
  vega:   180_000,
  pulsar:  90_000,
  quasar: 180_000,
}

// ── FAL params por engine (espelha generate.ts do Renderizar) ─

function falParamsForEngine(engine: EngineId, q: Resolution): Record<string, unknown> {
  if (engine === 'quasar') {
    return {
      quality:       q === '4k' ? 'high' : 'medium',
      image_size:    'auto',
      num_images:    1,
      output_format: 'jpeg',
    }
  }
  const map: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
  return { resolution: map[q], num_images: 1, output_format: 'jpeg' }
}

// ── Heurística: projectType derivado do briefing ──────────────
//
// Bloco 1 só tem 6 cards de Iluminação que funcionam tanto pra interior
// quanto exterior — se a categoria não bater, o briefing decide.

function inferProjectType(
  category: Space['category'],
  briefing: BriefingArquitetonico | null,
): ProjectType {
  const blob = (
    (briefing?.tipo_projeto ?? '') + ' ' +
    (briefing?.entorno      ?? '')
  ).toLowerCase()
  if (/fachada|exterior|facade|terreno|rua|jardim|quintal|implanta|paisag/.test(blob)) {
    return 'exterior'
  }
  if (/interior|cozinha|sala|quarto|banheiro|home office|hall/.test(blob)) {
    return 'interior'
  }
  // Fallback por categoria: comercial/conceito tendem a ser apresentados de fora,
  // residencial mais frequentemente como interior. Briefing manda quando dá pra
  // detectar; fallback aqui é só pra Spaces antigos sem briefing.
  return category === 'residencial' ? 'interior' : 'exterior'
}

// ── Mapeamento category → segment do prompts.ts ───────────────
function mapSegment(category: Space['category']): string {
  if (category === 'residencial') return 'Residencial'
  if (category === 'comercial')   return 'Corporativo'
  return 'Residencial' // 'conceito' — mais flexível, residencial é o default mais neutro
}

// ── Materials derivados do DNA visual ─────────────────────────
//
// `buildMaterialsBlock` do prompts.ts aceita ProjectMaterials parcial.
// Com 3-5 materiais detectados pelo DNA, distribuímos nos campos mais
// genéricos (não temos como saber se é piso/parede sem mais análise).
// O efeito é um `MATERIAIS DO PROJETO` extra no prompt — reforço sobre o
// briefing.materiais_aparentes que já está lá.

function materialsFromDna(dna: ProjectDNA | null): ProjectMaterials | undefined {
  if (!dna || dna.materiais.length === 0) return undefined
  const list = dna.materiais.map(m => m.nome).join(', ')
  // Único campo "elementos" comporta lista livre — o prompt builder vai
  // injetar isso em INTERIOR ou EXTERIOR materials block, conforme o tipo.
  return { elementos: list }
}

// ── Route ─────────────────────────────────────────────────────

interface GenerateBody {
  axis?:        unknown
  axis_values?: unknown
  quality?:     unknown
}

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = (await req.json().catch(() => null)) as GenerateBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!isAxis(body.axis)) {
    return NextResponse.json({ error: 'axis inválido' }, { status: 400 })
  }
  const axis: Axis = body.axis

  if (!Array.isArray(body.axis_values) || body.axis_values.length === 0) {
    return NextResponse.json({ error: 'axis_values é obrigatório' }, { status: 400 })
  }
  const axisValues = body.axis_values.filter((v): v is string => typeof v === 'string')
  if (axisValues.length === 0) {
    return NextResponse.json({ error: 'axis_values inválido' }, { status: 400 })
  }
  for (const v of axisValues) {
    if (!findAxisOption(axis, v)) {
      return NextResponse.json({ error: `Opção inválida: ${axis}/${v}` }, { status: 400 })
    }
  }

  // Detalhe (recorte) depende estruturalmente do prompt builder do Preserve V2
  // (mode='detalhe' + crop preservado). Sem a flag, cair no prompt legado
  // (maquete 3D → foto) desvirtua o recorte e não grava os metadados. Espelha o
  // gate da UI (EixosPanel) como defesa no servidor.
  if (axis === 'detalhe' && !spacesPreserveV2Enabled()) {
    return NextResponse.json(
      { error: 'O módulo Detalhe requer o Preserve V2 habilitado.' },
      { status: 409 },
    )
  }

  if (!isQuality(body.quality) || !isResolution(body.quality)) {
    return NextResponse.json({ error: 'quality inválida' }, { status: 400 })
  }
  const quality = body.quality

  // Carrega Space (RLS valida posse)
  const { data: spaceRow, error: spaceErr } = await supabase
    .from('spaces')
    .select('*')
    .eq('id', spaceId)
    .single()
  if (spaceErr || !spaceRow) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }
  const space = spaceRow as Space
  if (space.status !== 'locked') {
    return NextResponse.json({ error: 'Space ainda não está travado' }, { status: 409 })
  }
  if (!space.vista_mestre_url) {
    return NextResponse.json({ error: 'Space sem Vista Mestre' }, { status: 409 })
  }
  if (!supportsQuality(space.engine, quality)) {
    return NextResponse.json(
      { error: `Motor ${space.engine} não suporta ${quality.toUpperCase()}` },
      { status: 400 },
    )
  }

  const visualDna = getVisualDna(space.dna)
  const briefing  = getBriefingFromDna(space.dna)
  if (!visualDna) {
    return NextResponse.json({ error: 'Space sem DNA' }, { status: 409 })
  }

  const engine       = space.engine
  const costPerVista = getVistaGenerationCost(engine, quality)
  const totalCost    = costPerVista * axisValues.length
  const falEndpoint  = ENGINES[engine].falEndpoint
  const projectType  = inferProjectType(space.category, briefing)
  const segment      = mapSegment(space.category)
  const materials    = materialsFromDna(visualDna)

  // ── Pré-checagem de saldo (via view) ─────────────────────────
  const { data: bal } = await admin
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', user.id)
    .single()
  const available = bal?.total_balance ?? 0
  if (available < totalCost) {
    return NextResponse.json(
      {
        error:     'insufficient_balance',
        available,
        required:  totalCost,
        per_vista: costPerVista,
        message:   `Saldo insuficiente. Necessários ${totalCost} nodes (${axisValues.length} × ${costPerVista}).`,
      },
      { status: 402 },
    )
  }

  // ── Preserve V2 (flag-gated) ─────────────────────────────────
  // A imagem upada é a autoridade do projeto: computamos a provenance da fonte
  // UMA vez (não por vista) e a injetamos em cada geração. Best-effort — nunca
  // derruba a geração. Com a flag off, nada disso roda e o caminho é idêntico
  // ao anterior.
  const preserveV2 = spacesPreserveV2Enabled()
  const sourceMeta: SourceMeta | null = preserveV2
    ? await computeSourceMeta(space.vista_mestre_url!)
    : null

  // ── Geração paralela (uma transação independente por vista) ──
  const tasks = axisValues.map(axisValue =>
    generateOne({
      admin, userId: user.id, space, projectType, segment, materials, briefing,
      engine, quality, axis, axisValue, costPerVista, falEndpoint,
      preserveV2, sourceMeta, dna: visualDna,
    })
  )

  const results = await Promise.allSettled(tasks)
  const vistas:  unknown[] = []
  const errors:  string[]  = []

  for (const r of results) {
    if (r.status === 'fulfilled') vistas.push(r.value)
    else errors.push(r.reason?.message ?? String(r.reason))
  }

  const { data: balAfter } = await admin
    .from('user_node_balance')
    .select('plan_balance, lumen_balance, total_balance')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    vistas,
    errors:        errors.length ? errors : undefined,
    balance_after: balAfter ?? null,
  })
}

// ── Helper: geração + persistência de uma única vista ─────────

async function generateOne(args: {
  admin:        ReturnType<typeof createAdminClient>
  userId:       string
  space:        Space
  projectType:  ProjectType
  segment:      string
  materials:    ProjectMaterials | undefined
  briefing:     BriefingArquitetonico | null
  engine:       EngineId
  quality:      Resolution
  axis:         Axis
  axisValue:    string
  costPerVista: number
  falEndpoint:  string
  preserveV2:   boolean
  sourceMeta:   SourceMeta | null
  dna:          ProjectDNA | null
}) {
  const {
    admin, userId, space, projectType, segment, materials, briefing,
    engine, quality, axis, axisValue, costPerVista, falEndpoint,
    preserveV2, sourceMeta, dna,
  } = args

  let debited = false
  let vistaId: string | null = null

  try {
    // 1) débito
    const { error: debitErr } = await admin.rpc('consume_workspace_nodes', {
      user_id_input: userId,
      amount:        costPerVista,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') throw new Error('insufficient_balance')
      throw new Error('debit_failed: ' + debitErr.message)
    }
    debited = true

    // Intenção da ação (Preserve V2): modo + nível. Computado cedo pra registrar
    // na row pendente também (audita até vistas que falharem).
    const opt   = findAxisOption(axis, axisValue)!
    const mode:  SpacesMode | null              = preserveV2 ? modeForAxis(axis)  : null
    const level: SpacesPreservationLevel | null = preserveV2 ? levelForAxis(axis) : null

    // 2) row pendente
    const insertRow: Record<string, unknown> = {
      space_id:    space.id,
      user_id:     userId,
      status:      'processing',
      engine,
      quality,
      axis,
      axis_value:  axisValue,
      axis_label:  opt.label,
      nodes_cost:  costPerVista,
    }
    if (preserveV2) {
      insertRow.spaces_mode         = mode
      insertRow.preservation_level  = level
      insertRow.provider            = 'fal'
      insertRow.model               = falEndpoint
      insertRow.source_image_url    = sourceMeta?.url ?? space.vista_mestre_url
      insertRow.source_width        = sourceMeta?.width ?? null
      insertRow.source_height       = sourceMeta?.height ?? null
      insertRow.source_aspect_ratio = sourceMeta?.aspectRatio ?? null
      insertRow.source_hash         = sourceMeta?.hash ?? null
    }
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert(insertRow)
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    vistaId = row.id as string

    // 3) Prompt
    //
    // Preserve V2: builder PRÓPRIO do Spaces — a imagem upada é a autoridade, o
    // prompt manda PRESERVAR e mudar só o atributo pedido (ver
    // lib/spaces/preserve-prompt.ts). NÃO usa a moldura "isto é uma maquete 3D,
    // re-renderize em foto" nem MATERIAL OVERRIDES do caminho do Renderizar.
    //
    // Legado (flag off): mantém exatamente a stack do Renderizar de antes.
    let finalPrompt: string
    if (preserveV2 && mode && level) {
      finalPrompt = buildSpacesPreservePrompt({
        level, mode, userIntent: opt.promptModifier, briefing, dna,
      })
    } else {
      const options: GenerateOptions = {
        projectType,
        segment,
        environment:    '',
        lighting:       opt.promptModifier,
        background:     'Preservar Original',
        sceneElements:  [],
        geometryLock:   85,
        materials,
        fidelityMode:   'strict',
        fidelityLevel:  'maximum',
        briefing:       briefing ?? undefined,
        hasAnchor:      false,
        refinementText: undefined,
      }
      finalPrompt = buildFidelityPrompt(options, 'maximum', briefing ?? undefined)
    }

    // 4) FAL call — sempre image-to-image/edit: a Vista Mestre vai como
    // image_urls (referência). Nunca text-to-image puro.
    const falInput = {
      prompt:     finalPrompt,
      image_urls: [space.vista_mestre_url!],
      ...falParamsForEngine(engine, quality),
    }

    console.log('[spaces.generate] engine    :', engine, '→', falEndpoint)
    console.log('[spaces.generate] quality   :', quality, '→', costPerVista, 'nodes')
    console.log('[spaces.generate] axis      :', axis, '/', axisValue)
    console.log('[spaces.generate] preserveV2:', preserveV2, preserveV2 ? `(${mode}/${level})` : '')
    console.log('[spaces.generate] prompt    :', finalPrompt)

    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS[engine]),
      ),
    ])
    const images = (result.data as { images: { url: string; width?: number; height?: number }[] }).images
    const outputUrl = images?.[0]?.url
    if (!outputUrl) throw new Error('fal_no_output')
    const genW = images?.[0]?.width  ?? null
    const genH = images?.[0]?.height ?? null
    // Rastreabilidade: liga esta vista à entrada no painel da fal.ai. Ver vistas.fal_request_id.
    const falRequestId = (result as { requestId?: string }).requestId ?? null

    // 5) Persistir completed (+ metadados/validação de preservação no V2)
    const updateRow: Record<string, unknown> = {
      image_url:      outputUrl,
      prompt:         finalPrompt,
      fal_request_id: falRequestId,
      status:         'completed',
      completed_at:   new Date().toISOString(),
    }

    let preservationWarning = false
    let check: Awaited<ReturnType<typeof checkArchitecturalPreservation>> = null
    if (preserveV2) {
      // Detalhe (crop) fecha o enquadramento de propósito — aspect/câmera mudam
      // legitimamente, então as validações não tratam isso como violação.
      const cropExpected = mode ? modeAllowsCloserCrop(mode) : false
      const genAspect = genW && genH ? genW / genH : null
      const validation = validateGeneration({
        sourceUrl:          sourceMeta?.url ?? space.vista_mestre_url!,
        generatedUrl:       outputUrl,
        sourceAspect:       sourceMeta?.aspectRatio ?? null,
        generatedAspect:    genAspect,
        allowFramingChange: cropExpected,
      })
      if (validation.issues.length) {
        console.warn('[spaces.generate] validação preserve:', validation.issues.join(', '))
      }
      preservationWarning = !validation.ok

      // Checagem opcional por visão (source × generated), killável. Best-effort.
      if (level && visionPreservationCheckEnabled()) {
        check = await checkArchitecturalPreservation(
          sourceMeta?.url ?? space.vista_mestre_url!, outputUrl, level,
          { cropExpected },
        )
        if (check?.warning) preservationWarning = true
      }

      updateRow.generated_width      = genW
      updateRow.generated_height     = genH
      updateRow.aspect_ratio         = aspectRatioLabel(genAspect) ?? aspectRatioLabel(sourceMeta?.aspectRatio ?? null)
      updateRow.preservation_warning = preservationWarning
      updateRow.preservation_check   = check
    }

    const { error: updErr } = await admin
      .from('vistas')
      .update(updateRow)
      .eq('id', vistaId)
    if (updErr) {
      console.error('[spaces.generate] DB update FALHOU (imagem ok, persistência não):', updErr)
    }

    return {
      id:         vistaId,
      space_id:   space.id,
      image_url:  outputUrl,
      engine,
      quality,
      axis,
      axis_value: axisValue,
      axis_label: opt.label,
      nodes_cost: costPerVista,
      status:     'completed',
      ...(preserveV2 ? {
        spaces_mode:          mode,
        preservation_level:   level,
        source_image_url:     sourceMeta?.url ?? space.vista_mestre_url,
        source_aspect_ratio:  sourceMeta?.aspectRatio ?? null,
        aspect_ratio:         updateRow.aspect_ratio as string | null,
        preservation_warning: preservationWarning,
        preservation_check:   check,
      } : {}),
    }

  } catch (err) {
    if (debited) {
      await refundNodes(admin, userId, costPerVista, { module: 'spaces/generate', jobTable: 'vistas' })
    }
    if (vistaId) {
      await admin
        .from('vistas')
        .update({ status: 'failed', error_message: (err as Error).message })
        .eq('id', vistaId)
    }
    throw err
  }
}
