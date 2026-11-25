// lib/bench-v3/preflight.ts
//
// Conferência gratuita antes de gastar: chaves presentes e IDs de modelo
// existentes em cada fornecedor (listagem de modelos não é cobrada). ModelArk
// e fal não têm listagem simples; para eles só confere a chave.

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import type { ImageEngine, VisionModel } from './catalog'
import { resolveRoute } from './image-adapters'

export interface PreflightLine { item: string; status: 'ok' | 'faltando' | 'nao_verificado'; detail: string }

const KEY: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY', ark: 'ARK_API_KEY', fal: 'FAL_KEY',
}
const has = (provider: string) => Boolean(process.env[KEY[provider]]?.trim())

async function listIds(provider: string): Promise<string[] | null> {
  if (!has(provider)) return null
  try {
    if (provider === 'anthropic') {
      const ids: string[] = []
      for await (const m of new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).models.list()) ids.push(m.id)
      return ids
    }
    if (provider === 'gemini') {
      const ids: string[] = []
      const pager = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.list()
      for await (const m of pager) if (m.name) ids.push(m.name.replace(/^models\//, ''))
      return ids
    }
    const base = provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'xai' ? 'https://api.x.ai/v1' : null
    if (!base) return null
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${process.env[KEY[provider]]?.trim()}` } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { data?: { id?: string }[] }
    return (json.data ?? []).map(m => m.id ?? '').filter(Boolean)
  } catch (e) {
    return [`__erro__:${(e as Error).message}`]
  }
}

export async function preflight(engines: ImageEngine[], vision: VisionModel[]): Promise<PreflightLine[]> {
  const wanted = [
    ...engines.map(e => { const r = resolveRoute(e); return { item: e.label, provider: r.kind as string, model: r.target } }),
    ...vision.map(v => ({ item: v.label, provider: v.provider as string, model: v.model })),
  ]
  const cache = new Map<string, Promise<string[] | null>>()
  const lines: PreflightLine[] = []
  for (const w of wanted) {
    if (!has(w.provider)) { lines.push({ item: w.item, status: 'faltando', detail: `${KEY[w.provider]} ausente` }); continue }
    if (!cache.has(w.provider)) cache.set(w.provider, listIds(w.provider))
    const ids = await cache.get(w.provider)!
    if (!ids) { lines.push({ item: w.item, status: 'nao_verificado', detail: `${w.provider}: sem listagem; ${w.model} será testado na 1ª chamada` }); continue }
    if (ids[0]?.startsWith('__erro__')) { lines.push({ item: w.item, status: 'faltando', detail: `${w.provider}: ${ids[0].slice(9)}` }); continue }
    if (ids.includes(w.model)) { lines.push({ item: w.item, status: 'ok', detail: w.model }); continue }
    const family = w.model.split('-').slice(0, 2).join('-')
    const near = ids.filter(id => id.startsWith(family) || (w.provider === 'gemini' && /image/.test(id))).slice(0, 8)
    lines.push({ item: w.item, status: 'faltando', detail: `${w.model} não existe na conta. Parecidos: ${near.join(', ') || 'nenhum'}` })
  }
  return lines
}
