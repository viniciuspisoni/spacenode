// Camada 2: geração via fal.ai, mesmo transporte para todos os candidatos —
// a comparação fica entre MODELOS, não entre rotas. Em produção o Seedream
// sai pela ModelArk (mais barata); o custo direto entra no relatório à parte.
//
// SERVER-ONLY e PAGO. Só é chamado pelo runner com BENCH3=1.

import { fal } from '@fal-ai/client'
import { buildFidelityPrompt, type BriefingArquitetonico, type GenerateOptions } from '@/lib/prompts'
import type { GeneratorSpec } from './config'

let configured = false
function falReady(): void {
  if (configured) return
  if (!process.env.FAL_KEY) throw new Error('falta FAL_KEY no .env.local')
  fal.config({ credentials: process.env.FAL_KEY })
  configured = true
}

const uploads = new Map<string, string>()

/** Sobe o print uma vez por execução e reaproveita a URL entre motores. */
export async function uploadInput(caseName: string, buf: Buffer, mime: string): Promise<string> {
  const hit = uploads.get(caseName)
  if (hit) return hit
  falReady()
  const url = await fal.storage.upload(new File([new Uint8Array(buf)], `${caseName}.${mime === 'image/png' ? 'png' : 'jpg'}`, { type: mime }))
  uploads.set(caseName, url)
  return url
}

export function benchPrompt(gen: GeneratorSpec, projectType: 'interior' | 'exterior', briefing?: BriefingArquitetonico, correction?: string): string {
  // Mesmo ponto de partida do bench de produção (tests/fidelity/bench.test.ts):
  // Máxima, tudo em "preservar", sem âncora.
  const options: GenerateOptions = {
    projectType,
    segment: 'Residencial',
    environment: '',
    lighting: 'Preservar Original',
    background: 'Preservar Original',
    sceneElements: [],
    geometryLock: 85,
    fidelityMode: 'strict',
    fidelityLevel: 'maximum',
  }
  const base = buildFidelityPrompt(options, 'maximum', briefing, { engine: gen.promptProfile })
  return correction ? `${base}\n\nCORRECTION FROM QUALITY REVIEW (fix these, change nothing else): ${correction}` : base
}

export interface GenResult { ok: boolean; png: Buffer | null; width: number | null; height: number | null; ms: number; requestId: string | null; error: string | null }

export async function generate(gen: GeneratorSpec, inputUrl: string, prompt: string, src: { width: number; height: number } | null, timeoutMs = 300_000): Promise<GenResult> {
  falReady()
  const started = Date.now()
  try {
    const result = await Promise.race([
      fal.subscribe(gen.falEndpoint, { input: { prompt, image_urls: [inputUrl], ...gen.params(src) } as never }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout ${timeoutMs} ms`)), timeoutMs)),
    ])
    const data = result.data as { images?: Array<{ url: string; width?: number; height?: number }> }
    const img = data.images?.[0]
    if (!img?.url) throw new Error('resposta sem imagem')
    const res = await fetch(img.url)
    if (!res.ok) throw new Error(`download do output falhou: ${res.status}`)
    const raw = Buffer.from(await res.arrayBuffer())
    const sharp = (await import('sharp')).default
    const png = await sharp(raw).png().toBuffer()
    const meta = await sharp(png).metadata()
    return { ok: true, png, width: meta.width ?? null, height: meta.height ?? null, ms: Date.now() - started, requestId: result.requestId ?? null, error: null }
  } catch (err) {
    return { ok: false, png: null, width: null, height: null, ms: Date.now() - started, requestId: null, error: String((err as Error)?.message ?? err).slice(0, 300) }
  }
}
