// POST /api/spaces/[spaceId]/generate
//
// Rota ÚNICA de geração do Spaces (fluxo Referência → Ação → Gerar).
//
// Body novo:
//   {
//     action:    'nova_vista' | 'luz' | 'material' | 'detalhe',
//     reference: { kind: 'vista_mestre' }
//              | { kind: 'vista',  vista_id: string }
//              | { kind: 'print',  prints: [{ url, label? }] },   // 1..10
//     values?:      string[],   // luz/detalhe: slugs dos cards
//     directions?:  string[],   // nova_vista (mestre/histórico): slugs
//     custom_direction?: string,// nova_vista: direção personalizada (texto)
//     instruction?: string,     // material: pedido do usuário (texto)
//     quality:   'hd' | '2k' | '4k',
//   }
//
// Compat: o body legado ({ axis, axis_values, quality, reference_vista_id? })
// segue aceito e é adaptado pro formato novo — nada de cliente antigo quebra.
//
// Separação explícita das entradas (ver lib/spaces/references.ts):
//   - referência GEOMÉTRICA  = a imagem escolhida (prioridade máxima, Image #1)
//   - referência de IDENTIDADE = Vista Mestre/DNA (materiais/paleta/linguagem)
//   - instrução do USUÁRIO   = ação + cards/direções/texto livre
//
// Cada item selecionado gera uma vista independente (débito/refund próprios)
// via lib/spaces/generation.ts. Regras por referência:
//   - novo print  → o print é a autoridade geométrica; a Vista Mestre entra SÓ
//                   como identidade (Image #2). Nunca como geometria.
//   - histórico   → a vista escolhida é geometria+identidade; DNA dela (se
//                   extraído) substitui o do Space.
//   - vista mestre→ comportamento clássico (single-image).
//   - prints > 1  → apenas ação Nova Vista (cada print vira uma vista).

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerId } from '@/lib/workspaces/context'
import { ENGINES, isResolution } from '@/lib/engines'
import { getVistaGenerationCost, supportsQuality } from '@/lib/spaces/economy'
import { findAxisOption, ANGULO_CUSTOM_VALUE, MATERIAL_VALUE } from '@/lib/spaces/axes'
import { getVisualDna, getBriefingFromDna } from '@/lib/spaces/dna'
import {
  isGenerationAction, isQuality,
  type GenerationAction, type Space,
} from '@/lib/spaces/types'
import type { ReferenceSet } from '@/lib/spaces/references'
import { generateVista, FAL_TIMEOUT_MS } from '@/lib/spaces/generation'
import { computeSourceMeta } from '@/lib/spaces/source-meta'

// Os chunks rodam em SEQUÊNCIA (rate limit do provider), então o teto precisa
// ser gerido: antes de iniciar um chunk, a rota confere se o pior caso dele
// ainda cabe no orçamento. Chunk que não cabe NÃO inicia (e não debita) — nada
// de função morta no meio com débito órfão em row 'processing'.
export const maxDuration = 300

const MAX_PRINTS          = 10
const MAX_ITEMS           = 10
const MAX_INSTRUCTION_LEN = 300
const PARALLEL_CHUNK      = 4

// ── Body ──────────────────────────────────────────────────────

interface IncomingPrint { url: string; label: string | null }

interface ParsedReference {
  kind:     'vista_mestre' | 'vista' | 'print'
  vistaId?: string
  prints?:  IncomingPrint[]
}

// Campos mínimos da vista do histórico usada como referência geométrica.
interface ReferenceVistaRow {
  id:        string
  space_id:  string
  status:    string
  image_url: string | null
  dna:       unknown
}

// Item normalizado: 1 item = 1 vista gerada.
interface GenerationItem {
  axisValue:       string | null
  axisLabel:       string
  userIntent:      string
  userInstruction: string | null
  /** Print que serve de referência geométrica deste item (kind='print'). */
  print?:          IncomingPrint
}

interface RawBody {
  action?:             unknown
  reference?:          unknown
  values?:             unknown
  directions?:         unknown
  custom_direction?:   unknown
  instruction?:        unknown
  quality?:            unknown
  // Body legado (EixosPanel antigo / integrações)
  axis?:               unknown
  axis_values?:        unknown
  reference_vista_id?: unknown
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// Adapta o body legado ({axis, axis_values, reference_vista_id}) pro formato
// novo. axis 'iluminacao'→luz e 'detalhe'→detalhe; outros eixos nunca foram
// aceitos por esta rota no formato antigo.
function adaptLegacyBody(body: RawBody): RawBody | null {
  if (body.action !== undefined || body.axis === undefined) return body
  const action =
    body.axis === 'iluminacao' ? 'luz'
    : body.axis === 'detalhe'  ? 'detalhe'
    : null
  if (!action) return null
  // reference_vista_id de tipo inválido era 400 no formato antigo — não pode
  // virar Vista Mestre silenciosamente.
  if (body.reference_vista_id !== undefined && body.reference_vista_id !== null
      && typeof body.reference_vista_id !== 'string') {
    return null
  }
  return {
    action,
    values:  body.axis_values,
    quality: body.quality,
    reference:
      typeof body.reference_vista_id === 'string' && body.reference_vista_id
        ? { kind: 'vista', vista_id: body.reference_vista_id }
        : { kind: 'vista_mestre' },
  }
}

function parseReference(raw: unknown): ParsedReference | string {
  if (!raw || typeof raw !== 'object') return 'reference é obrigatório'
  const ref = raw as Record<string, unknown>

  if (ref.kind === 'vista_mestre') return { kind: 'vista_mestre' }

  if (ref.kind === 'vista') {
    if (typeof ref.vista_id !== 'string' || !ref.vista_id) return 'reference.vista_id é obrigatório'
    return { kind: 'vista', vistaId: ref.vista_id }
  }

  if (ref.kind === 'print') {
    if (!Array.isArray(ref.prints) || ref.prints.length === 0) return 'reference.prints é obrigatório'
    if (ref.prints.length > MAX_PRINTS) return `Máximo ${MAX_PRINTS} prints por geração`
    const prints: IncomingPrint[] = []
    for (const p of ref.prints) {
      if (!p || typeof p !== 'object') return 'print inválido'
      const url = (p as Record<string, unknown>).url
      const lbl = (p as Record<string, unknown>).label
      if (typeof url !== 'string' || !url) return 'print sem url'
      prints.push({ url, label: typeof lbl === 'string' && lbl.trim() ? lbl.trim().slice(0, 48) : null })
    }
    return { kind: 'print', prints }
  }

  return 'reference.kind inválido'
}

// Normaliza a seleção da etapa 2 em itens (1 item = 1 vista).
function parseItems(
  action:    GenerationAction,
  reference: ParsedReference,
  body:      RawBody,
): GenerationItem[] | string {
  // Nova Vista com prints: cada print é um item (o print É a nova vista).
  if (action === 'nova_vista' && reference.kind === 'print') {
    return reference.prints!.map(p => ({
      axisValue:       null,
      axisLabel:       p.label ?? 'Nova vista',
      userIntent:      '',
      userInstruction: null,
      print:           p,
    }))
  }

  if (action === 'nova_vista') {
    const items: GenerationItem[] = []
    const directions = Array.isArray(body.directions)
      ? body.directions.filter((v): v is string => typeof v === 'string')
      : []
    for (const slug of directions) {
      const opt = findAxisOption('angulo', slug)
      if (!opt) return `Direção inválida: ${slug}`
      items.push({
        axisValue:       opt.value,
        axisLabel:       opt.label,
        userIntent:      opt.promptModifier,
        userInstruction: null,
      })
    }
    const custom = typeof body.custom_direction === 'string' ? body.custom_direction.trim() : ''
    if (custom) {
      if (custom.length > MAX_INSTRUCTION_LEN) return 'Direção personalizada longa demais'
      items.push({
        axisValue:       ANGULO_CUSTOM_VALUE,
        axisLabel:       custom.slice(0, 48),
        userIntent:      '',
        userInstruction: custom,
      })
    }
    if (items.length === 0) return 'Selecione ao menos uma direção (ou descreva a sua)'
    return items
  }

  if (action === 'material') {
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
    if (instruction.length < 3)                   return 'Descreva qual material ajustar'
    if (instruction.length > MAX_INSTRUCTION_LEN) return 'Instrução longa demais'
    return [{
      axisValue:       MATERIAL_VALUE,
      axisLabel:       instruction.slice(0, 48),
      userIntent:      '',
      userInstruction: instruction,
    }]
  }

  // luz / detalhe: cards
  const axis = action === 'luz' ? 'iluminacao' as const : 'detalhe' as const
  if (!Array.isArray(body.values) || body.values.length === 0) {
    return 'Selecione ao menos uma opção'
  }
  const values = body.values.filter((v): v is string => typeof v === 'string')
  if (values.length === 0) return 'Seleção inválida'
  const items: GenerationItem[] = []
  for (const v of values) {
    const opt = findAxisOption(axis, v)
    if (!opt) return `Opção inválida: ${axis}/${v}`
    items.push({
      axisValue:       opt.value,
      axisLabel:       opt.label,
      userIntent:      opt.promptModifier,
      userInstruction: null,
    })
  }
  return items
}

// ── Route ─────────────────────────────────────────────────────

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const rawBody = (await req.json().catch(() => null)) as RawBody | null
  if (!rawBody) return bad('Body inválido')

  const body = adaptLegacyBody(rawBody)
  if (!body) return bad('axis inválido')

  if (!isGenerationAction(body.action)) return bad('action inválida')
  const action = body.action

  const refParsed = parseReference(body.reference)
  if (typeof refParsed === 'string') return bad(refParsed)
  // Alias já estreitado — TS não propaga o narrowing de união pra dentro das
  // closures abaixo (refsForItem).
  const reference: ParsedReference = refParsed

  // Prints múltiplos só fazem sentido na Nova Vista (cada print = uma vista).
  // Nas demais ações a referência precisa ser UMA imagem.
  if (reference.kind === 'print' && action !== 'nova_vista' && reference.prints!.length > 1) {
    return bad('Com mais de um print, a ação disponível é Nova Vista')
  }

  if (!isQuality(body.quality) || !isResolution(body.quality)) return bad('quality inválida')
  const quality = body.quality

  const items = parseItems(action, reference, body)
  if (typeof items === 'string') return bad(items)
  if (items.length > MAX_ITEMS) return bad(`Máximo ${MAX_ITEMS} vistas por geração`)

  // ── Space (RLS valida posse) ─────────────────────────────────
  const { data: spaceRow, error: spaceErr } = await supabase
    .from('spaces')
    .select('*')
    .eq('id', spaceId)
    .single()
  if (spaceErr || !spaceRow) return bad('Space não encontrado', 404)
  const space = spaceRow as Space
  if (space.status !== 'locked')  return bad('Space ainda não está travado', 409)
  if (!space.vista_mestre_url)    return bad('Space sem Vista Mestre', 409)
  if (!supportsQuality(space.engine, quality)) {
    return bad(`Motor ${space.engine} não suporta ${quality.toUpperCase()}`)
  }

  // ── Referência do histórico (kind='vista') ───────────────────
  // Qualquer vista concluída do Space serve como referência GEOMÉTRICA — o DNA
  // próprio (multi-DNA, quando extraído) passa a valer também como identidade.
  let referenceVista: ReferenceVistaRow | null = null
  if (reference.kind === 'vista') {
    const { data: refRow } = await supabase
      .from('vistas')
      .select('id, space_id, status, image_url, dna')
      .eq('id', reference.vistaId!)
      .single()
    if (!refRow || refRow.space_id !== spaceId) return bad('Referência não encontrada neste Space', 404)
    if (refRow.status !== 'completed' || !refRow.image_url) return bad('Referência não está pronta', 409)
    referenceVista = refRow as ReferenceVistaRow
  }

  // ── Identidade (DNA/briefing) ────────────────────────────────
  // Vista do histórico com DNA próprio extraído → identidade DELA; senão, a do
  // Space. O DNA visual é obrigatório (Space travado sempre tem).
  const dnaSource = (referenceVista?.dna ?? null) || space.dna
  const visualDna = getVisualDna(dnaSource) ?? getVisualDna(space.dna)
  const briefing  = getBriefingFromDna(dnaSource) ?? getBriefingFromDna(space.dna)
  if (!visualDna) return bad('Space sem DNA', 409)

  const engine       = space.engine
  const costPerVista = getVistaGenerationCost(engine, quality)
  const totalCost    = costPerVista * items.length
  const falEndpoint  = ENGINES[engine].falEndpoint

  // ── Saldo (pré-check no PAGADOR — dono da bolsa) ─────────────
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
        message:   `Saldo insuficiente. Necessários ${totalCost} nodes (${items.length} × ${costPerVista}).`,
      },
      { status: 402 },
    )
  }

  // ── Conjunto de referências por item ─────────────────────────
  // kind='print': cada item tem o próprio print como geometria; Vista Mestre é
  // a identidade (Image #2). Nos demais, geometria fixa (mestre ou vista) e
  // identidade embutida na própria imagem — nunca uma segunda imagem que possa
  // competir com a geometria.
  function refsForItem(item: GenerationItem): ReferenceSet {
    if (reference.kind === 'print') {
      // Nova Vista: cada item carrega o próprio print. Luz/Materiais/Detalhe
      // sobre 1 print: os itens são cards — o print único é a geometria de todos.
      const p = item.print ?? reference.prints![0]
      return {
        geometry: { kind: 'print', url: p.url, label: p.label },
        identity: { imageUrl: space.vista_mestre_url!, source: 'vista_mestre' },
      }
    }
    if (reference.kind === 'vista') {
      return {
        geometry: { kind: 'vista', url: referenceVista!.image_url!, vistaId: referenceVista!.id },
        identity: {
          imageUrl: null,
          source: referenceVista!.dna ? 'reference_vista' : 'same_as_geometry',
        },
      }
    }
    return {
      geometry: { kind: 'vista_mestre', url: space.vista_mestre_url! },
      identity: { imageUrl: null, source: 'same_as_geometry' },
    }
  }

  // Provenance da geometria: única quando todos os itens partem da MESMA
  // imagem (mestre, histórico ou 1 print); por item quando cada print é a
  // própria autoridade (Nova Vista em lote). computeSourceMeta nunca lança.
  const singleGeometry = reference.kind !== 'print' || reference.prints!.length === 1
  const sharedMeta = singleGeometry
    ? await computeSourceMeta(refsForItem(items[0]).geometry.url)
    : null

  const batchId = items.length > 1 ? randomUUID() : null

  console.log('[spaces.generate] fluxo           :', action, '· referência', reference.kind, '·', items.length, 'item(ns)')

  // ── Geração (chunks paralelos — rate limit do provider) ──────
  // Orçamento de tempo: pior caso de um chunk = timeout do provider + checagem
  // de visão/overhead. Um chunk só inicia se couber inteiro antes do
  // maxDuration (15s de margem pra resposta) — itens pulados não são cobrados.
  const startedAt     = Date.now()
  const ROUTE_BUDGET  = (maxDuration - 15) * 1000
  const WORST_ITEM_MS = FAL_TIMEOUT_MS[engine] + 60_000

  const vistas: unknown[] = []
  const errors: { label: string | null; error: string }[] = []

  for (let i = 0; i < items.length; i += PARALLEL_CHUNK) {
    const chunk = items.slice(i, i + PARALLEL_CHUNK)
    if (Date.now() - startedAt + WORST_ITEM_MS > ROUTE_BUDGET) {
      console.warn('[spaces.generate] chunk pulado por orçamento de tempo:', chunk.length, 'item(ns) não iniciados (sem cobrança)')
      chunk.forEach(item => errors.push({
        label: item.axisLabel,
        error: 'Não iniciada por limite de tempo do lote — nada foi cobrado. Gere novamente.',
      }))
      continue
    }
    const settled = await Promise.allSettled(chunk.map(async item => {
      const refs = refsForItem(item)
      const meta = sharedMeta ?? await computeSourceMeta(refs.geometry.url)
      return generateVista({
        admin, userId: user.id, space, action, refs,
        axisValue:       item.axisValue,
        axisLabel:       item.axisLabel,
        userIntent:      item.userIntent,
        userInstruction: item.userInstruction,
        engine, quality, costPerVista, falEndpoint,
        sourceMeta: meta, dna: visualDna, briefing,
        batchId, logContext: 'spaces.generate',
      })
    }))
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') vistas.push(r.value)
      else {
        // Não vaza mensagem crua (Postgres/provider) pro cliente (AL-9).
        const item = chunk[idx]
        console.error('[spaces.generate] item falhou:', item.axisLabel,
          r.reason instanceof Error ? r.reason.message : r.reason)
        errors.push({ label: item.axisLabel, error: 'Falha ao gerar uma das vistas. Tente novamente.' })
      }
    })
  }

  const { data: balAfter } = await admin
    .from('user_node_balance')
    .select('plan_balance, lumen_balance, total_balance')
    .eq('user_id', payerId)
    .single()

  return NextResponse.json({
    batch_id:      batchId,
    vistas,
    errors:        errors.length ? errors : undefined,
    balance_after: balAfter ?? null,
  })
}
