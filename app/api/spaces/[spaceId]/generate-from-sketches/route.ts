// POST /api/spaces/[spaceId]/generate-from-sketches
//
// Geração em batch para o eixo Ângulo. Recebe N sketches (até 10),
// cria batch_id, gera vistas em paralelo controlado (chunks de 4),
// debita por vista. Falhas parciais não cobram nodes da vista falhada.
//
// Pipeline por sketch:
//   debit → row pendente em vistas (axis='angulo', source_sketch_url, batch_id)
//     → call FAL com dual-reference [Vista Mestre, sketch] e prompt enriquecido
//     → update row para completed.
// Refund best-effort em qualquer falha pós-débito.
//
// DNA verification roda em modo 'angulo_relaxed' (Contexto comparado por
// categoria ampla) — disparado pelo cliente após receber a resposta.

import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENGINES, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import { isQuality, type ProjectDNA, type Space } from '@/lib/spaces/types'

fal.config({ credentials: process.env.FAL_KEY })

const FAL_TIMEOUT_MS = 120_000
const MAX_SKETCHES   = 10
const PARALLEL_CHUNK = 4

interface IncomingSketch {
  url:   string
  label: string | null
}

interface GenerateBody {
  sketches?: unknown
  quality?:  unknown
}

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

  if (!Array.isArray(body.sketches) || body.sketches.length === 0) {
    return NextResponse.json({ error: 'sketches obrigatório' }, { status: 400 })
  }
  if (body.sketches.length > MAX_SKETCHES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_SKETCHES} sketches por batch` },
      { status: 400 },
    )
  }
  const sketches: IncomingSketch[] = []
  for (const s of body.sketches) {
    if (!s || typeof s !== 'object') {
      return NextResponse.json({ error: 'sketch inválido' }, { status: 400 })
    }
    const url = (s as Record<string, unknown>).url
    const lbl = (s as Record<string, unknown>).label
    if (typeof url !== 'string' || !url) {
      return NextResponse.json({ error: 'sketch sem url' }, { status: 400 })
    }
    sketches.push({
      url,
      label: typeof lbl === 'string' && lbl.trim() ? lbl.trim() : null,
    })
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
  const totalCost    = costPerVista * sketches.length
  const falEndpoint  = ENGINES[engine].falEndpoint
  const batchId      = randomUUID()

  // Pré-checagem de saldo
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
        message:   `Saldo insuficiente. Necessários ${totalCost} nodes (${sketches.length} × ${costPerVista}).`,
      },
      { status: 402 },
    )
  }

  // Geração em chunks paralelos (max PARALLEL_CHUNK simultâneos pra não
  // estourar rate limit do FAL).
  const vistas: unknown[] = []
  const errors: { sketch_url: string; label: string | null; error: string }[] = []

  for (let i = 0; i < sketches.length; i += PARALLEL_CHUNK) {
    const chunk = sketches.slice(i, i + PARALLEL_CHUNK)
    const tasks = chunk.map(sk =>
      generateOne({
        admin, userId: user.id, space, dna: visualDna, briefing,
        engine, quality, sketch: sk, costPerVista, falEndpoint, batchId,
      })
    )
    const settled = await Promise.allSettled(tasks)
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') vistas.push(r.value)
      else {
        const sk = chunk[idx]
        errors.push({
          sketch_url: sk.url,
          label:      sk.label,
          error:      (r.reason instanceof Error ? r.reason.message : String(r.reason)),
        })
      }
    })
  }

  const { data: balAfter } = await admin
    .from('user_node_balance')
    .select('plan_balance, lumen_balance, total_balance')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    batch_id: batchId,
    vistas,
    errors:        errors.length ? errors : undefined,
    balance_after: balAfter ?? null,
  })
}

// ── Helper: gera 1 vista a partir de 1 sketch ─────────────────

async function generateOne(args: {
  admin:        ReturnType<typeof createAdminClient>
  userId:       string
  space:        Space
  dna:          ProjectDNA
  briefing:     ReturnType<typeof getBriefingFromDna>
  engine:       EngineId
  quality:      Resolution
  sketch:       IncomingSketch
  costPerVista: number
  falEndpoint:  string
  batchId:      string
}) {
  const {
    admin, userId, space, dna, briefing, engine, quality,
    sketch, costPerVista, falEndpoint, batchId,
  } = args

  let debited = false
  let vistaId: string | null = null

  try {
    // 1) débito
    const { error: debitErr } = await admin.rpc('consume_nodes_v2', {
      user_id_input: userId,
      amount:        costPerVista,
    })
    if (debitErr) {
      if (debitErr.code === 'P0001') throw new Error('insufficient_balance')
      throw new Error('debit_failed: ' + debitErr.message)
    }
    debited = true

    // 2) row pendente
    const axisLabel = sketch.label ?? 'Ângulo'
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert({
        space_id:          space.id,
        user_id:           userId,
        status:            'processing',
        engine,
        quality,
        axis:              'angulo',
        axis_value:        null, // sem slug — é guiado por sketch, não por valor
        axis_label:        axisLabel,
        nodes_cost:        costPerVista,
        source_sketch_url: sketch.url,
        batch_id:          batchId,
      })
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    vistaId = row.id as string

    // 3) Prompt dual-reference
    const prompt = buildAnguloPrompt(dna, briefing, sketch.label, quality)

    // image_urls: [#1 Vista Mestre = style ref, #2 sketch = geometry source]
    const falInput = {
      prompt,
      image_urls: [space.vista_mestre_url!, sketch.url],
      ...falParamsForEngine(engine, quality),
    }

    console.log('[spaces.angulo] engine    :', engine, '→', falEndpoint)
    console.log('[spaces.angulo] sketch    :', sketch.url, 'label=', sketch.label)
    console.log('[spaces.angulo] batch_id  :', batchId)

    const result = await Promise.race([
      fal.subscribe(falEndpoint, { input: falInput }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('FAL_TIMEOUT'), { isFalTimeout: true })), FAL_TIMEOUT_MS),
      ),
    ])
    const images = (result.data as { images: { url: string }[] }).images
    const outputUrl = images?.[0]?.url
    if (!outputUrl) throw new Error('fal_no_output')

    // 4) Persistir
    const { error: updErr } = await admin
      .from('vistas')
      .update({
        image_url:    outputUrl,
        prompt,
        status:       'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', vistaId)
    if (updErr) {
      console.error('[spaces.angulo] DB update FALHOU (imagem ok, persistência não):', updErr)
    }

    return {
      id:         vistaId,
      space_id:   space.id,
      image_url:  outputUrl,
      engine,
      quality,
      axis:       'angulo',
      axis_label: axisLabel,
      nodes_cost: costPerVista,
      status:     'completed',
      source_sketch_url: sketch.url,
      batch_id:   batchId,
    }
  } catch (err) {
    if (debited) {
      try {
        await admin.rpc('refund_nodes', { user_id_input: userId, amount: costPerVista })
      } catch (refundErr) {
        console.error('[spaces.angulo] FALHA NO REFUND:', refundErr)
      }
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

// ── Prompt builder pro eixo Ângulo ────────────────────────────

function buildAnguloPrompt(
  dna:      ProjectDNA,
  briefing: ReturnType<typeof getBriefingFromDna>,
  label:    string | null,
  quality:  Resolution,
): string {
  const materialsLine = dna.materiais.map(m => `${m.nome} (${m.hex})`).join(', ')
  const paletteLine   = dna.paleta.join(', ')
  const moodLine      = dna.contexto.join(', ')
  const styleLine     = dna.estilo.nome
  const labelLine     = label ? `\nVIEWPOINT INTENT: ${label}` : ''

  // Se temos briefing arquitetônico do projeto, injetamos como "PROJECT FACTS"
  // — mesmo padrão usado em buildFidelityPrompt no Renderizar. Isso ajuda a
  // manter coerência conceitual com o resto do projeto.
  const facts = briefing
    ? (
      `\nPROJECT FACTS (from reference Vista Mestre — must match in output):\n` +
      `- Style of project: ${briefing.tipo_projeto}\n` +
      `- Visible materials: ${briefing.materiais_aparentes}\n` +
      `- Surroundings/context: ${briefing.entorno}\n`
    )
    : ''

  return [
    `Render this architectural sketch as a photorealistic image matching the reference style and materials.`,
    ``,
    `TWO REFERENCE IMAGES PROVIDED:`,
    `Image #1 is the Vista Mestre — use it as the source of materials, textures, color palette, mood and lighting. Match these EXACTLY.`,
    `Image #2 is the sketch — use it ONLY for architecture, layout, geometry, opening positions, camera angle and perspective. Do not invent or remove any architectural element shown in the sketch.`,
    ``,
    `STYLE: ${styleLine}`,
    `MATERIALS: ${materialsLine}`,
    `PALETTE: ${paletteLine}`,
    `MOOD / CONTEXT: ${moodLine}`,
    `LIGHTING: match the lighting conditions of Image #1 (Vista Mestre) — same time of day, same shadow direction, same atmosphere.${labelLine}`,
    facts,
    `The output should look as if it were photographed at the same time, same conditions and same materials as the Vista Mestre — only from a different viewpoint defined by the sketch.`,
    ``,
    `Output: photorealistic architectural rendering, ${quality.toUpperCase()} quality, no stylization, no illustration, no cartoon. Preserve every architectural element shown in the sketch exactly.`,
  ].join('\n')
}
