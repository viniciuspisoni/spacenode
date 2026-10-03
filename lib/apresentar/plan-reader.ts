// ── Apresentar · Planta Humanizada · Leitor de planta ────────────────────────
//
// Estágio 1 do harness: ANTES de gastar com o modelo de imagem, uma passada de
// visão barata (gemini-2.5-flash, ~US$0,002) lê a planta técnica e devolve o
// que a UI não tem como saber e o usuário não deveria ter que digitar:
//
//   - o tipo de projeto (sai o botão "Cena" da interface);
//   - a lista de ambientes com nome canônico em PT-BR e caixa delimitadora
//     (os rótulos passam a ser desenhados por nós, em vetor — o modelo de
//     imagem deixa de ser contratado pra escrever texto, que é justamente a
//     capacidade cara);
//   - se a planta JÁ vem com os nomes impressos (aí não sobrepomos nada);
//   - se há área externa (varanda, jardim) — dirige o repertório de vegetação.
//
// Com o brief em mãos o prompt do estágio 2 deixa de ser genérico ("add
// furniture in every room") e passa a ser específico por ambiente ("cozinha:
// bancada em L, cooktop, geladeira") — que é de onde vem o salto de qualidade.
//
// REGRA DURA: este estágio NUNCA derruba a geração. Falha de visão, JSON
// inválido ou timeout viram um brief `degraded` e o pipeline segue com o
// comportamento antigo (prompt genérico, sem rótulos). O usuário não fica sem
// planta porque o leitor caiu.
//
// SERVER-ONLY: importa lib/gemini (SDK do Google). Não entra no grafo client.

import { geminiVisionJson } from '@/lib/gemini'
import { PLAN_ROOM_KINDS } from './config'
import type { HumanizedPlanProjectType, PlanBrief, PlanRoom, PlanRoomKind } from './config'

const READER_TIMEOUT_MS = 30_000
const MAX_ROOMS = 24

const VALID_PROJECT_TYPES: HumanizedPlanProjectType[] = [
  'apartamento', 'casa', 'comercial', 'corporativo', 'paisagismo',
]

export type { PlanBrief, PlanRoom, PlanRoomKind }

/** Brief neutro pra quando a leitura falha — o pipeline segue sem ele. */
export function degradedBrief(
  projectType: HumanizedPlanProjectType,
  reason: string,
): PlanBrief {
  return {
    projectType,
    rooms: [],
    hasOutdoor: false,
    hasPrintedLabels: false,
    degraded: true,
    degradedReason: reason,
  }
}

// ── Prompt ───────────────────────────────────────────────────────────────────
//
// Coordenadas em `box_2d` [ymin, xmin, ymax, xmax] numa escala 0–1000 é a
// convenção NATIVA de detecção do Gemini — pedir em fração 0..1 ou em pixels
// rende caixa pior. Convertemos pra 0..1 na saída.

const SYSTEM = `You read technical architectural floor plans and return STRICT JSON. No prose, no markdown fences.

You are given ONE orthographic top-down technical floor plan (CAD linework, possibly with dimensions and hatching).

Return this exact shape:
{
  "projectType": "apartamento" | "casa" | "comercial" | "corporativo" | "paisagismo",
  "hasPrintedLabels": boolean,
  "hasOutdoor": boolean,
  "rooms": [
    { "name": string, "kind": string, "box_2d": [ymin, xmin, ymax, xmax] }
  ]
}

Rules:
- "rooms": one entry per enclosed room or clearly delimited zone. Skip wall cavities, shafts and hatched voids. At most 24.
- "name": the room name in BRAZILIAN PORTUGUESE, Title Case, as an architect would label it on a presentation plan. Use: Sala, Sala de Estar, Sala de Jantar, Cozinha, Quarto, Suíte, Banheiro, Lavabo, Área de Serviço, Varanda, Hall, Corredor, Closet, Escritório, Despensa, Garagem, Jardim, Terraço, Recepção, Sala de Reunião, Copa, Depósito, Loja, Vestiário. If the plan already prints a name, reuse that exact name. If a type repeats, number it (Quarto 01, Quarto 02).
- "kind": one of social, cozinha, dormitorio, banho, servico, circulacao, externo, trabalho, comercial, outro.
- "box_2d": the room's bounding box in [ymin, xmin, ymax, xmax], integers on a 0-1000 scale of the image. Be precise: this is used to place a text label at the centre of the room.
- "hasPrintedLabels": true ONLY if room names are already printed as text inside the rooms in the drawing.
- "hasOutdoor": true if there is a balcony, terrace, garden, yard or any outdoor area.
- If the image is not a floor plan, return "rooms": [] and your best guess for projectType.`

const USER = 'Read this floor plan and return the JSON.'

// ── Parsing defensivo ────────────────────────────────────────────────────────

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/** 0–1000 (convenção do Gemini) → 0..1, com clamp. */
function norm(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n / 1000))
}

function parseRoom(raw: unknown): PlanRoom | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 28) : ''
  if (!name) return null

  const box = Array.isArray(r.box_2d) ? r.box_2d : null
  if (!box || box.length !== 4) return null
  const [y0, x0, y1, x1] = box.map(norm)
  if (y0 === null || x0 === null || y1 === null || x1 === null) return null

  // O modelo às vezes troca a ordem dos cantos — normaliza em vez de descartar.
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1)
  const left = Math.min(x0, x1), right = Math.max(x0, x1)
  const w = right - left
  const h = bottom - top
  // Caixa degenerada não posiciona rótulo nenhum.
  if (w < 0.01 || h < 0.01) return null

  const kindRaw = typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : ''
  const kind = (PLAN_ROOM_KINDS as string[]).includes(kindRaw) ? kindRaw as PlanRoomKind : 'outro'

  return { name, kind, cx: left + w / 2, cy: top + h / 2, w, h }
}

export function parsePlanBrief(
  raw: string,
  fallbackType: HumanizedPlanProjectType,
): PlanBrief {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>

  const typeRaw = typeof parsed.projectType === 'string' ? parsed.projectType.trim().toLowerCase() : ''
  const projectType = (VALID_PROJECT_TYPES as string[]).includes(typeRaw)
    ? typeRaw as HumanizedPlanProjectType
    : fallbackType

  const rooms = (Array.isArray(parsed.rooms) ? parsed.rooms : [])
    .map(parseRoom)
    .filter((r): r is PlanRoom => r !== null)
    .slice(0, MAX_ROOMS)

  const hasOutdoor = parsed.hasOutdoor === true || rooms.some(r => r.kind === 'externo')

  return {
    projectType,
    rooms,
    hasOutdoor,
    hasPrintedLabels: parsed.hasPrintedLabels === true,
    degraded: false,
  }
}

// ── Chamada ──────────────────────────────────────────────────────────────────

/** Lê a planta técnica. NUNCA lança: falha vira brief degradado. */
export async function readPlan(
  imageUrl: string,
  fallbackType: HumanizedPlanProjectType,
): Promise<PlanBrief> {
  try {
    const raw = await geminiVisionJson({
      system:      SYSTEM,
      user:        USER,
      imageUrl,
      temperature: 0,      // leitura, não criação
      maxTokens:   2200,   // 24 ambientes × ~60 tokens + folga
      timeoutMs:   READER_TIMEOUT_MS,
    })
    return parsePlanBrief(raw, fallbackType)
  } catch (err) {
    const reason = (err as Error).message ?? 'desconhecido'
    console.warn('[apresentar/humanized-plan] leitor de planta indisponível (segue sem):', reason)
    return degradedBrief(fallbackType, reason)
  }
}
