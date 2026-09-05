// lib/ai/ark/seedreamEdit.ts
//
// Edição via Seedream 5.0 Pro Edit DIRETO na ModelArk (BytePlus / ByteDance) —
// rota alternativa do protótipo do Editar V3 (EDIT_V3_SEEDREAM_ROUTE=ark). Mesma
// interface do adaptador via fal (lib/ai/fal/seedreamEdit.ts); o pipeline não
// distingue as duas.
//
// Por que existe (medido 2026-09-06, mesma imagem e prompts): 2K em 40–52 s direto
// contra ~130 s via fal em produção; US$0,09 por imagem acima de 2,61 MP e 0,045
// abaixo (fal: 0,135 / 0,0675). Modo rápido de prompt (~13% mais rápido) opcional.
//
// API (compatível com Images da OpenAI): POST {ARK_BASE_URL}/images/generations
//   model, prompt, image (URL | data URI | lista), size ('1K' | '2K' | 'LxA'),
//   output_format, response_format, watermark, optimize_prompt_options.mode.
// response_format 'b64_json' de propósito: a URL de resultado da ByteDance não
// está na allowlist de fetch do produto e expira em 24 h; o pipeline já aceita
// data: URL (é o que o adaptador Google devolve).
// Região: só ap-southeast-1 (Singapura) tem o Pro. Dados saem do país — a página
// de privacidade precisa nomear a operadora antes de isto ir pra produção.

import { SeedreamEditError, type SeedreamEditImageInput, type SeedreamEditImageOutput } from '@/lib/ai/fal/seedreamEdit'

export const ARK_SEEDREAM_PRO_MODEL = 'dola-seedream-5-0-pro-260628'
const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
const TIMEOUT_MS = 180_000
// Preço oficial ModelArk (2026-09-04): ≤2,61 MP US$0,045; acima US$0,09;
// +US$0,003 por imagem de entrada além da primeira.
const COST_LOW_USD = 0.045
const COST_HIGH_USD = 0.09
const COST_EXTRA_INPUT_USD = 0.003
const LOW_TIER_MAX_PIXELS = 2_610_000

function baseUrl(): string {
  return (process.env.ARK_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function modelId(): string {
  return process.env.ARK_SEEDREAM_PRO_MODEL?.trim() || ARK_SEEDREAM_PRO_MODEL
}

/** Modo rápido de otimização de prompt (menos latência, qualidade "levemente menor" segundo a doc). */
export function arkFastModeEnabled(): boolean {
  return process.env.EDIT_V3_SEEDREAM_FAST === '1'
}

interface ArkImagesResponse {
  model?: string
  data?: { url?: string; b64_json?: string; size?: string }[]
  usage?: { generated_images?: number; output_tokens?: number }
  error?: { code?: string; message?: string }
}

/** Edita a imagem via Seedream 5.0 Pro na ModelArk. Lança SeedreamEditError em qualquer falha. */
export async function editImageWithSeedreamArk(input: SeedreamEditImageInput): Promise<SeedreamEditImageOutput> {
  const key = process.env.ARK_API_KEY?.trim()
  if (!key) throw new SeedreamEditError('config', 'ARK_API_KEY não configurada.')
  const startedAt = Date.now()
  const imageUrls = [input.imageUrl, ...(input.references ?? []).map(r => r.url)]
  // '1K' ≈ 1 MP (faixa barata); '2K' = teto do modelo (~4,2 MP em 16:9). O modelo
  // segue a proporção da imagem enviada — o recompose redimensiona pro crop.
  const size = (input.resolution ?? '2K') === '1K' ? '1K' : '2K'
  const body: Record<string, unknown> = {
    model: modelId(),
    prompt: input.prompt,
    image: imageUrls.length === 1 ? imageUrls[0] : imageUrls,
    size,
    output_format: 'png',
    response_format: 'b64_json',
    watermark: false,
    ...(arkFastModeEnabled() ? { optimize_prompt_options: { mode: 'fast' } } : {}),
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${baseUrl()}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error).name === 'AbortError') {
      throw new SeedreamEditError('timeout', `seedream (ark) excedeu ${TIMEOUT_MS}ms`)
    }
    throw new SeedreamEditError('api', `seedream (ark) falhou na rede: ${(err as Error).message}`)
  }
  clearTimeout(timer)

  const json = (await res.json().catch(() => null)) as ArkImagesResponse | null
  if (!res.ok || json?.error) {
    // Status + código + mensagem da ModelArk — sem prompt/URLs (AL-9).
    console.error(
      `[seedreamEdit:ark] FALHOU model=${modelId()} status=${res.status} ` +
      `code=${json?.error?.code ?? 'n/a'} msg=${(json?.error?.message ?? '').slice(0, 200)}`,
    )
    throw new SeedreamEditError('api', json?.error?.message ?? `HTTP ${res.status}`)
  }
  const img = json?.data?.[0]
  if (!img?.b64_json && !img?.url) throw new SeedreamEditError('no_output', 'seedream (ark) não devolveu imagem.')

  const [w, h] = (img.size ?? '').split('x').map(Number)
  const outputWidth = Number.isFinite(w) && w > 0 ? w : 0
  const outputHeight = Number.isFinite(h) && h > 0 ? h : 0
  const pixels = outputWidth * outputHeight
  const costUsd =
    (pixels > 0 && pixels <= LOW_TIER_MAX_PIXELS ? COST_LOW_USD : COST_HIGH_USD) +
    COST_EXTRA_INPUT_USD * Math.max(0, imageUrls.length - 1)

  return {
    imageRef: img.b64_json ? `data:image/png;base64,${img.b64_json}` : (img.url as string),
    provider: 'ark',
    model: 'seedream-5-pro-edit',
    requestId: res.headers.get('x-request-id') ?? null,
    durationMs: Date.now() - startedAt,
    outputWidth,
    outputHeight,
    costUsd,
  }
}
