// POST /api/spaces/[spaceId]/generate-from-sketches
//
// COMPAT: adaptador fino sobre o pipeline único do Spaces (fluxo Referência →
// Ação → Gerar). A UI nova envia tudo pra /api/spaces/[id]/generate com
// { action: 'nova_vista', reference: { kind: 'print', prints } } — esta rota
// permanece pra clientes antigos e mapeia o body legado pro MESMO executor
// (lib/spaces/generation.ts), garantindo que não existam dois pipelines
// divergentes.
//
// Semântica preservada do fix 2026-06-30: o print do usuário é a AUTORIDADE
// GEOMÉTRICA (Image #1); a referência do projeto entra apenas como identidade
// visual (Image #2). Nunca invertido.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { ENGINES, isResolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import { isQuality, type Space } from '@/lib/spaces/types'
import type { ReferenceSet } from '@/lib/spaces/references'
import { generateVista, FAL_TIMEOUT_MS } from '@/lib/spaces/generation'
import { computeSourceMeta } from '@/lib/spaces/source-meta'

export const maxDuration = 300

const MAX_SKETCHES   = 10
const PARALLEL_CHUNK = 4

interface IncomingSketch {
  url:   string
  label: string | null
}

interface GenerateBody {
  sketches?: unknown
  quality?:  unknown
  /** Multi-DNA legado: vista-referência que substitui a Vista Mestre como
   *  identidade visual (Image #2) + DNA do prompt. Opcional. */
  reference_vista_id?: unknown
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

  // Identidade: Vista Mestre por padrão; vista-referência (multi-DNA) quando
  // enviada — a imagem DELA vira a Image #2 e o DNA dela alimenta o prompt.
  let identityUrl = space.vista_mestre_url!
  let identitySource: ReferenceSet['identity']['source'] = 'vista_mestre'
  let dnaSource: unknown = space.dna
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
    identityUrl    = refRow.image_url
    identitySource = 'reference_vista'
    dnaSource      = refRow.dna
  }

  const visualDna = getVisualDna(dnaSource) ?? getVisualDna(space.dna)
  const briefing  = getBriefingFromDna(dnaSource) ?? getBriefingFromDna(space.dna)
  if (!visualDna) {
    return NextResponse.json({ error: 'Space sem DNA' }, { status: 409 })
  }

  const engine       = space.engine
  const costPerVista = getVistaGenerationCost(engine, quality)
  const totalCost    = costPerVista * sketches.length
  const falEndpoint  = ENGINES[engine].falEndpoint
  const batchId      = randomUUID()

  // Pré-checagem de saldo no PAGADOR (dono da bolsa)
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

  // Geração em chunks paralelos via executor único. Chunk só inicia se o pior
  // caso dele couber no orçamento de tempo (itens pulados não são cobrados) —
  // espelha a guarda da rota principal.
  const startedAt     = Date.now()
  const ROUTE_BUDGET  = (maxDuration - 15) * 1000
  const WORST_ITEM_MS = FAL_TIMEOUT_MS[engine] + 60_000

  const vistas: unknown[] = []
  const errors: { sketch_url: string; label: string | null; error: string }[] = []

  for (let i = 0; i < sketches.length; i += PARALLEL_CHUNK) {
    const chunk = sketches.slice(i, i + PARALLEL_CHUNK)
    if (Date.now() - startedAt + WORST_ITEM_MS > ROUTE_BUDGET) {
      console.warn('[spaces.sketches] chunk pulado por orçamento de tempo:', chunk.length, 'sketch(es) não iniciados (sem cobrança)')
      chunk.forEach(sk => errors.push({
        sketch_url: sk.url,
        label:      sk.label,
        error:      'Não iniciada por limite de tempo do lote — nada foi cobrado. Gere novamente.',
      }))
      continue
    }
    const settled = await Promise.allSettled(chunk.map(async sk => {
      const refs: ReferenceSet = {
        geometry: { kind: 'print', url: sk.url, label: sk.label },
        identity: { imageUrl: identityUrl, source: identitySource, vistaId: referenceVistaId },
      }
      const meta = await computeSourceMeta(sk.url)
      return generateVista({
        admin, userId: user.id, space,
        action: 'nova_vista', refs,
        axisValue:       null,
        axisLabel:       sk.label ?? 'Nova vista',
        userIntent:      '',
        userInstruction: null,
        engine, quality, costPerVista, falEndpoint,
        sourceMeta: meta, dna: visualDna, briefing,
        batchId, logContext: 'spaces.sketches',
        // Retries do gate de fidelidade só rodam se couberem no orçamento da
        // função (a reserva por chunk cobre 1 tentativa; o resto é oportunista).
        deadlineAt: startedAt + ROUTE_BUDGET,
      })
    }))
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') vistas.push(r.value)
      else {
        const sk = chunk[idx]
        // Não vaza mensagem crua pro cliente — loga o detalhe, devolve genérico (AL-9).
        console.error('[spaces.sketches] sketch falhou:', sk.label, r.reason instanceof Error ? r.reason.message : r.reason)
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
