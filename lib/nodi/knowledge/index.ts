// ── Base de conhecimento do Nodi — motor ─────────────────────────────────────
//
// Matching determinístico e barato: normaliza (minúsculas, sem acento),
// pontua keywords/frases e padrões por entrada, aplica boost do módulo atual
// e devolve as melhores. Sem embedding, sem rede — roda em qualquer rota em
// ~0ms e é a resposta de fallback quando não há provedor de IA configurado.
//
// O CONTEÚDO mora em entries.ts (uma entrada por assunto, centralizado — a
// regra do produto é nunca espalhar resposta fixa por componente). Como
// atualizar: docs/NODI.md.

import type { NodiAction } from '../types'
import { KB_ENTRIES, type KBEntry } from './entries'

export interface KBMatch {
  entry: KBEntry
  score: number
}

/** Resultado pronto de uma entrada (texto + ações). */
export interface KBAnswerPayload {
  id: string
  title: string
  text: string
  actions: NodiAction[]
}

// Thresholds calibrados nos testes (tests/nodi/knowledge.test.ts):
// >= STRONG responde direto da base; entre WEAK e STRONG é candidato (vai de
// grounding pro provedor de IA, ou vira resposta de confiança média sem IA);
// < WEAK é ruído.
export const KB_STRONG_SCORE = 5
export const KB_WEAK_SCORE = 2.5

/** minúsculas + sem acento + espaços colapsados — base de toda comparação. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreEntry(entry: KBEntry, normalized: string, moduleId: string | null): number {
  let score = 0

  for (const keyword of entry.keywords) {
    const k = normalizeText(keyword)
    if (!k) continue
    if (k.includes(' ')) {
      // frase: substring já normalizada
      if (normalized.includes(k)) score += 3
    } else if (new RegExp(`\\b${k}\\b`).test(normalized)) {
      score += 2
    }
  }

  if (entry.patterns) {
    for (const p of entry.patterns) {
      if (p.test(normalized)) score += 6
    }
  }

  // Boost de contexto: a mesma pergunta ("quanto custa?") deve cair no custo
  // DA FERRAMENTA aberta. 3 pontos vencem o desempate contra a entrada
  // genérica sem deixar entrada irrelevante (score 0) flutuar.
  if (score > 0 && moduleId && entry.modules?.includes(moduleId)) score += 3

  return score
}

/** Melhores entradas para uma pergunta livre, no contexto do módulo atual. */
export function matchKb(question: string, moduleId: string | null, limit = 3): KBMatch[] {
  const normalized = normalizeText(question)
  if (!normalized) return []
  return KB_ENTRIES
    .map(entry => ({ entry, score: scoreEntry(entry, normalized, moduleId) }))
    .filter(m => m.score >= KB_WEAK_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Entrada por id (clique numa sugestão/FAQ — resposta determinística). */
export function getKbEntry(id: string): KBEntry | undefined {
  return KB_ENTRIES.find(e => e.id === id)
}

/** Materializa a resposta de uma entrada. */
export function buildKbAnswer(entry: KBEntry): KBAnswerPayload {
  const built = entry.build()
  return { id: entry.id, title: entry.title, text: built.text, actions: built.actions ?? [] }
}

/** Sugestões rápidas pro módulo atual (chips do painel). */
export function getSuggestions(moduleId: string | null, limit = 3): { id: string; title: string }[] {
  const forModule = KB_ENTRIES.filter(e => e.suggest && moduleId && e.modules?.includes(moduleId))
  const generic = KB_ENTRIES.filter(e => e.suggest && (!e.modules || e.modules.length === 0))
  const seen = new Set<string>()
  const out: { id: string; title: string }[] = []
  for (const e of [...forModule, ...generic]) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    out.push({ id: e.id, title: e.title })
    if (out.length >= limit) break
  }
  return out
}

/** Índice do FAQ (títulos; a resposta vem por id via /api/nodi/ask). */
export function getFaqIndex(): { id: string; title: string }[] {
  return KB_ENTRIES.filter(e => e.faq).map(e => ({ id: e.id, title: e.title }))
}
