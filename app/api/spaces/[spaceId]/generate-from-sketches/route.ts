// POST /api/spaces/[spaceId]/generate-from-sketches
//
// Geração em batch para o eixo Ângulo. Recebe N sketches (até 10),
// cria batch_id, gera vistas em paralelo controlado (chunks de 4),
// debita por vista. Falhas parciais não cobram nodes da vista falhada.
//
// Pipeline por sketch:
//   debit → row pendente em vistas (axis='angulo', source_sketch_url, batch_id)
//     → call FAL com dual-reference [sketch (base geométrica), Vista Mestre (estética)]
//       e prompt que trava a geometria do print do usuário
//     → update row para completed.
// Refund best-effort em qualquer falha pós-débito.
//
// IMPORTANTE (fix 2026-06-30): o print do usuário (sketch) é a AUTORIDADE
// geométrica e entra como Image #1. A Vista Mestre é só referência estética
// (materiais/luz/acabamento) e entra como Image #2. Antes a ordem era invertida
// e o motor reproduzia a imagem original do projeto ignorando o print enviado.
//
// DNA verification roda em modo 'angulo_relaxed' (Contexto comparado por
// categoria ampla) — disparado pelo cliente após receber a resposta.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { refundNodes } from '@/lib/billing/refund-nodes'
import { ENGINES, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import { isQuality, type ProjectDNA, type Space } from '@/lib/spaces/types'
import { generateImage } from '@/lib/ai/image-provider'

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
  /** Multi-DNA: vista-referência (com DNA extraído) que substitui a Vista
   *  Mestre como referência estética (Image #2) + DNA do prompt. Opcional. */
  reference_vista_id?: unknown
}

// Campos mínimos da vista-referência usados na geração.
interface ReferenceVista {
  id:        string
  space_id:  string
  status:    string
  image_url: string | null
  dna:       unknown
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

  const referenceVistaId =
    body.reference_vista_id === undefined || body.reference_vista_id === null
      ? null
      : (typeof body.reference_vista_id === 'string' ? body.reference_vista_id : undefined)
  if (referenceVistaId === undefined) {
    return NextResponse.json({ error: 'reference_vista_id inválido' }, { status: 400 })
  }

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

  // ── Referência selecionável (multi-DNA) ──────────────────────
  // Sem reference_vista_id: Vista Mestre como referência estética + DNA do
  // Space (comportamento histórico). Com ele, a vista-referência assume os dois
  // papéis. O sketch do usuário segue sendo a autoridade GEOMÉTRICA (Image #1).
  let referenceVista: ReferenceVista | null = null
  if (referenceVistaId) {
    const { data: refRow } = await supabase
      .from('vistas')
      .select('id, space_id, status, image_url, dna')
      .eq('id', referenceVistaId)
      .single()
    if (!refRow || refRow.space_id !== spaceId) {
      return NextResponse.json({ error: 'Referência não encontrada neste Space' }, { status: 404 })
    }
    if (refRow.status !== 'completed' || !refRow.image_url) {
      return NextResponse.json({ error: 'Referência não está pronta' }, { status: 409 })
    }
    if (!refRow.dna) {
      return NextResponse.json({ error: 'Referência sem DNA extraído' }, { status: 409 })
    }
    referenceVista = refRow as ReferenceVista
  }

  const aestheticRefUrl = referenceVista?.image_url ?? space.vista_mestre_url!
  const dnaSource       = referenceVista?.dna ?? space.dna
  const visualDna = getVisualDna(dnaSource)
  const briefing  = getBriefingFromDna(dnaSource)
  if (!visualDna) {
    return NextResponse.json({ error: 'Space sem DNA' }, { status: 409 })
  }

  const engine       = space.engine
  const costPerVista = getVistaGenerationCost(engine, quality)
  const totalCost    = costPerVista * sketches.length
  const falEndpoint  = ENGINES[engine].falEndpoint
  const batchId      = randomUUID()

  // Pré-checagem de saldo
  // Saldo é da bolsa: pré-check usa o PAGADOR (dono do workspace), o mesmo
  // que consume_workspace_nodes debita — senão membro é barrado à toa.
  const payerId = (await getPayerId(admin, user.id)) ?? user.id
  const { data: bal } = await admin
    .from('user_node_balance')
    .select('total_balance')
    .eq('user_id', payerId)
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
        aestheticRefUrl, referenceVistaId,
      })
    )
    const settled = await Promise.allSettled(tasks)
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') vistas.push(r.value)
      else {
        const sk = chunk[idx]
        // Não vaza mensagem crua pro cliente — loga o detalhe, devolve genérico (AL-9).
        console.error('[spaces.angulo] sketch falhou:', sk.label, r.reason instanceof Error ? r.reason.message : r.reason)
        errors.push({
          sketch_url: sk.url,
          label:      sk.label,
          error:      'Falha ao gerar. Tente novamente.',
        })
      }
    })
  }

  const { data: balAfter } = await admin
    .from('user_node_balance')
    .select('plan_balance, lumen_balance, total_balance')
    .eq('user_id', payerId)
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
  // Multi-DNA: referência estética (Vista Mestre ou vista-referência) + id da
  // referência pra gravar a provenance na row.
  aestheticRefUrl:  string
  referenceVistaId: string | null
}) {
  const {
    admin, userId, space, dna, briefing, engine, quality,
    sketch, costPerVista, falEndpoint, batchId,
    aestheticRefUrl, referenceVistaId,
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

    // 2) row pendente
    const axisLabel = sketch.label ?? 'Ângulo'
    const insertRow: Record<string, unknown> = {
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
    }
    // Provenance multi-DNA — só preenche quando o usuário selecionou uma
    // referência (caminho legado segue sem tocar na coluna).
    if (referenceVistaId) {
      insertRow.reference_vista_id = referenceVistaId
    }
    const { data: row, error: insErr } = await admin
      .from('vistas')
      .insert(insertRow)
      .select('id')
      .single()
    if (insErr || !row) throw new Error('insert_failed: ' + (insErr?.message ?? '?'))
    vistaId = row.id as string

    // 3) Prompt dual-reference
    const prompt = buildAnguloPrompt(dna, briefing, sketch.label, quality)

    // image_urls (ORDEM IMPORTA): [#1 print do usuário = base geométrica,
    // #2 referência do projeto (Vista Mestre ou vista-referência) = referência
    // estética]. A primeira imagem é a âncora de geometria/composição pros
    // motores de edição da FAL — por isso o print tem que vir PRIMEIRO.
    // Inverter isso fazia o motor copiar a estrutura da referência (imagem
    // original do projeto) e ignorar o print enviado.
    const falInput = {
      prompt,
      image_urls: [sketch.url, aestheticRefUrl],
      ...falParamsForEngine(engine, quality),
    }

    console.log('[spaces.angulo] engine                       :', engine, '→', falEndpoint)
    console.log('[spaces.angulo] base geométrica (image #1)    :', sketch.url, 'label=', sketch.label)
    console.log('[spaces.angulo] ref estética   (image #2)     :', aestheticRefUrl, referenceVistaId ? `(vista ${referenceVistaId})` : '(vista mestre)')
    console.log('[spaces.angulo] batch_id                      :', batchId)

    // Camada única de provider (lib/ai/image-provider): GCP/Vertex primário
    // quando ligado por env, fallback FAL transparente.
    const gen = await generateImage({
      falEndpoint,
      falInput,
      timeoutMs: FAL_TIMEOUT_MS,
      context:   'spaces.angulo',
      deliver:   { kind: 'url', userId, area: 'vistas' },
    })
    const outputUrl = gen.images[0]?.url
    if (!outputUrl) throw new Error('provider_no_output')

    // 4) Persistir
    const { error: updErr } = await admin
      .from('vistas')
      .update({
        image_url:      outputUrl,
        prompt,
        fal_request_id: gen.requestId,
        provider:       gen.provider,
        model:          gen.providerModel,
        status:         'completed',
        completed_at:   new Date().toISOString(),
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
      reference_vista_id: referenceVistaId,
    }
  } catch (err) {
    if (debited) {
      await refundNodes(admin, userId, costPerVista, { module: 'spaces/generate-from-sketches', jobTable: 'vistas' })
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
      `\nPROJECT AESTHETIC DNA (from the project — apply as finish/materials ONLY, never as geometry):\n` +
      `- Style of project: ${briefing.tipo_projeto}\n` +
      `- Visible materials: ${briefing.materiais_aparentes}\n` +
      `- Surroundings/context: ${briefing.entorno}\n`
    )
    : ''

  return [
    `Turn the user's uploaded view (Image #1) into a photorealistic architectural render. Image #1 is the ABSOLUTE GEOMETRIC AUTHORITY of this generation.`,
    ``,
    `TWO REFERENCE IMAGES PROVIDED:`,
    `Image #1 — THE USER'S VIEW (geometric authority). Preserve EXACTLY its geometry, framing, perspective, camera angle, composition, volumes, proportions and every opening (windows, doors, voids, recesses). Do NOT move, add, remove, redraw, simplify or reinterpret any structural element. Do NOT change the point of view. The result must align element-by-element with Image #1.`,
    `Image #2 — THE PROJECT'S REFERENCE IMAGE (aesthetic reference ONLY). Use it solely as the source of materials, textures, color palette, finish, mood and lighting style. Do NOT borrow geometry, camera angle, composition, framing or layout from Image #2.`,
    ``,
    `APPLY ONLY: realism, materials, lighting, finish and texture — on top of the exact geometry of Image #1.`,
    ``,
    `STYLE: ${styleLine}`,
    `MATERIALS: ${materialsLine}`,
    `PALETTE: ${paletteLine}`,
    `MOOD / CONTEXT: ${moodLine}`,
    `LIGHTING: photorealistic and coherent with the project's atmosphere shown in Image #2 — natural light, plausible shadows, no flat or illustrative look.${labelLine}`,
    facts,
    `The output must look like a real photograph of the SAME structure shown in Image #1, finished with the materials and atmosphere of the project (Image #2). It is the user's view made real — not a re-composition of Image #2.`,
    ``,
    `NEGATIVE: do not reproduce Image #2's viewpoint, layout or composition; do not deform, straighten or simplify the geometry of Image #1; no stylization, no illustration, no cartoon, no invented or relocated architecture.`,
    ``,
    `Output: photorealistic architectural rendering, ${quality.toUpperCase()} quality. Preserve every architectural element and opening shown in Image #1 exactly.`,
  ].join('\n')
}
