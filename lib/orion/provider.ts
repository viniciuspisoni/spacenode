// ── Orion · camada de fornecedor (server-only) ───────────────────────────────
//
// Dois caminhos, escolhidos por env PRIVADA — nunca pelo cliente:
//   ORION_IMAGE_PROVIDER = 'openai' (default) | 'fal'
//
//   openai → POST https://api.openai.com/v1/images/edits (multipart), com
//            OPENAI_API_KEY só no servidor. Os BYTES das imagens vão no corpo:
//            não existe upload intermediário, então este caminho funciona SEM
//            FAL_KEY. Os bytes saem do armazenamento do próprio SpaceNode via
//            fetchStorageBytes, que já aplica a allowlist de SSRF (AL-1).
//   fal    → fal.subscribe('openai/gpt-image-2.5/<variante>/edit'), reusando o
//            cliente que o repo já configura. Existe só pra COMPARAR preço e
//            resultado com a rota direta.
//
// SEM FALLBACK AUTOMÁTICO, de propósito: nada de trocar de fornecedor, de
// variante ou de motor por conta própria, e nada de disparar duas gerações em
// paralelo pra entregar a primeira (o hedge do Quasar/Vega existe em
// lib/ai/image-provider e NÃO se aplica aqui — no piloto isso mascararia
// exatamente o que estamos medindo, e dobraria o custo).
//
// Contrato conferido em 2026-09-10:
//   OpenAI /v1/images/edits — model, prompt, image[] (até 16), size
//     ('LxA', múltiplos de 16, ≤3840/lado, aspecto 1:3–3:1), quality
//     (low|medium|high|xhigh|max|auto), n, output_format (png|jpeg|webp),
//     output_compression, background, input_fidelity, moderation, user.
//     Resposta: data[].b64_json + usage{input_tokens, input_tokens_details,
//     output_tokens, total_tokens} + size/quality/output_format ecoados.
//   fal openai/gpt-image-2.5/{sunburst,flare}/edit — prompt, image_urls (≤16),
//     mask_url, image_size (objeto {width,height} ou preset), background,
//     quality, num_images, output_format, output_compression, sync_mode.
//     Resposta: images[] com url/width/height/content_type.
//
// Parâmetros que NÃO mandamos: `input_fidelity` e `moderation` (existem na
// Image API mas a doc dos 2.5 não confirma o comportamento — a comparação tem
// que rodar no default), `seed`/`thinking_level`/`resolution` (são de Gemini
// ou Seedream, não deste schema) e `auto` em size/quality (o teste precisa
// saber o que pediu).

import { fal } from '@fal-ai/client'
import { imageDims, uploadToStorage, type ImageDelivery } from '@/lib/ai/image-provider'
import { fetchStorageBytes } from '@/lib/storage/fetch'
import { signStorageUrl } from '@/lib/storage/signed'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ORION_MODELS,
  isOrionProvider,
  orionSizeParam,
  parseOrionSizeParam,
  type OrionProvider,
  type OrionQuality,
  type OrionSize,
  type OrionVariant,
} from './config'
import { EMPTY_ORION_USAGE, parseOpenAiUsage, type OrionUsage } from './pricing'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
const ORION_MAX_IMAGES = 16

/** Teto da chamada ao fornecedor. O orçamento total da rota (300 s de
 *  maxDuration, ~280 s úteis) continua mandando: o call site passa o menor. */
export const ORION_DEFAULT_TIMEOUT_MS = 240_000

export const ORION_FAL_ENDPOINTS: Record<OrionVariant, string> = {
  sunburst: 'openai/gpt-image-2.5/sunburst/edit',
  flare:    'openai/gpt-image-2.5/flare/edit',
}

/** Fornecedor do piloto. Env privada de servidor, default 'openai'. */
export function orionProvider(): OrionProvider {
  const raw = process.env.ORION_IMAGE_PROVIDER?.trim().toLowerCase()
  return isOrionProvider(raw) ? raw : 'openai'
}

export function hasOpenAiCredentials(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim()
}

/** Credencial do fornecedor ATIVO — a página usa pra não oferecer um card que
 *  vai falhar na primeira geração. */
export function orionProviderReady(provider: OrionProvider = orionProvider()): boolean {
  return provider === 'openai' ? hasOpenAiCredentials() : !!process.env.FAL_KEY?.trim()
}

// ── Erros ────────────────────────────────────────────────────────────────────

export class OrionError extends Error {
  readonly provider: OrionProvider
  readonly status: number | null
  /** Erro que NÃO deve ser repetido: autenticação, quota esgotada, parâmetro
   *  inválido ou moderação. Repetir só queima tempo e dinheiro. */
  readonly fatal: boolean
  readonly code: string | null
  constructor(
    provider: OrionProvider,
    message: string,
    opts: { status?: number | null; code?: string | null; fatal?: boolean } = {},
  ) {
    super(message)
    this.name = 'OrionError'
    this.provider = provider
    this.status = opts.status ?? null
    this.code = opts.code ?? null
    this.fatal = opts.fatal ?? false
  }
}

export class OrionTimeoutError extends OrionError {
  /** Mesma flag que as rotas já usam pra traduzir timeout na mensagem do usuário. */
  readonly isFalTimeout = true
  constructor(provider: OrionProvider, model: string, timeoutMs: number) {
    super(provider, `Orion excedeu ${timeoutMs}ms (${provider}: ${model})`, { fatal: true })
    this.name = 'OrionTimeoutError'
  }
}

const NON_RETRYABLE_CODES = new Set([
  'invalid_api_key',
  'insufficient_quota',
  'billing_hard_limit_reached',
  'moderation_blocked',
  'content_policy_violation',
  'invalid_request_error',
  'image_generation_user_error',
])

function isFatalStatus(status: number | null, code: string | null): boolean {
  if (code && NON_RETRYABLE_CODES.has(code)) return true
  if (status === null) return false
  if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) return true
  // 429 só é fatal quando é quota esgotada (código acima); rate limit puro é
  // transitório — mas o piloto roda uma tentativa só, então nada re-tenta aqui.
  return false
}

function truncate(msg: string, max = 300): string {
  return msg.length > max ? msg.slice(0, max) + '…' : msg
}

// ── Contrato ─────────────────────────────────────────────────────────────────

export interface OrionGenerateArgs {
  variant: OrionVariant
  quality: OrionQuality
  /** Dimensão EXPLÍCITA pedida (nunca 'auto'). */
  size: OrionSize
  prompt: string
  /** URLs das imagens de referência, NA ORDEM (a #1 é a âncora do prompt).
   *  Precisam passar na allowlist de fetch — Storage do projeto ou CDN da FAL. */
  imageUrls: string[]
  timeoutMs: number
  /** Identificação nos logs, ex.: 'generate:orion'. */
  context: string
  deliver: ImageDelivery
  /** Fornecedor explícito (testes). Default: o da env. */
  provider?: OrionProvider
}

export interface OrionGeneratedImage {
  url: string
  width: number | null
  height: number | null
}

export interface OrionGenerateResult {
  images: OrionGeneratedImage[]
  provider: OrionProvider
  /** Modelo exato: 'gpt-image-2.5-sunburst' (openai) ou o endpoint da fal. */
  providerModel: string
  variant: OrionVariant
  quality: OrionQuality
  /** Qualidade que o fornecedor ECOOU — pode divergir do pedido. null = não informou. */
  qualityReported: string | null
  requestedSize: { width: number; height: number }
  /** Dimensão REALMENTE entregue (eco do fornecedor ou cabeçalho do PNG).
   *  null quando não deu pra saber — não vira zero. */
  deliveredSize: { width: number; height: number } | null
  requestId: string | null
  latencyMs: number
  imageCount: number
  usage: OrionUsage
  /** `usage` cru do fornecedor (null quando não vem — a fal não devolve). */
  usageRaw: unknown
  outputFormat: string
}

// ── Caminho OpenAI direto (bytes, sem upload intermediário) ──────────────────

interface OpenAiImagesResponse {
  created?: number
  data?: { b64_json?: string; url?: string; revised_prompt?: string }[]
  usage?: unknown
  size?: string
  quality?: string
  output_format?: string
  background?: string
  error?: { message?: string; type?: string; code?: string }
}

async function generateViaOpenAi(args: OrionGenerateArgs, budgetMs: number): Promise<OrionGenerateResult> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new OrionError('openai', 'OPENAI_API_KEY ausente — rota direta indisponível', { fatal: true })
  }
  const model = ORION_MODELS[args.variant]
  const startedAt = Date.now()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), budgetMs)
  try {
    // Bytes vindos do NOSSO armazenamento (ou do CDN da FAL, para inputs
    // reusados de renders anteriores). fetchStorageBytes aplica a allowlist e
    // usa service_role quando o bucket está privado — nada de fal.storage.
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', args.prompt)
    form.append('size', orionSizeParam(args.size))
    form.append('quality', args.quality)
    form.append('n', '1')
    form.append('output_format', 'png')

    let index = 0
    for (const url of args.imageUrls.slice(0, ORION_MAX_IMAGES)) {
      const { buffer, contentType } = await fetchStorageBytes(url, ctrl.signal)
      const ct = contentType.split(';')[0]?.trim()
      const mime = ct && ct.startsWith('image/') ? ct : 'image/png'
      const ext = (mime.split('/')[1] ?? 'png').replace('jpeg', 'jpg')
      // `image[]` repetido preserva a ORDEM das referências — o prompt fala em
      // "Image #1"/"Image #2" e depende disso.
      form.append('image[]', new Blob([new Uint8Array(buffer)], { type: mime }), `ref-${++index}.${ext}`)
    }
    if (index === 0) throw new OrionError('openai', 'nenhuma imagem de referência utilizável', { fatal: true })

    const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        ...(process.env.OPENAI_ORG_ID?.trim() ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID.trim() } : {}),
        ...(process.env.OPENAI_PROJECT_ID?.trim() ? { 'OpenAI-Project': process.env.OPENAI_PROJECT_ID.trim() } : {}),
      },
      body: form,
      signal: ctrl.signal,
    })
    const requestId = res.headers.get('x-request-id')

    let json: OpenAiImagesResponse | null = null
    try {
      json = (await res.json()) as OpenAiImagesResponse
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      json = null
    }

    if (!res.ok || json?.error) {
      const code = json?.error?.code ?? json?.error?.type ?? null
      // AL-9: status + código + mensagem do fornecedor. NUNCA o prompt
      // proprietário, as URLs privadas do cliente ou a chave.
      throw new OrionError(
        'openai',
        `openai HTTP ${res.status} ${code ?? ''} ${truncate(json?.error?.message ?? '', 200)}`.trim(),
        { status: res.status, code, fatal: isFatalStatus(res.status, code) },
      )
    }

    const first = json?.data?.[0]
    if (!first?.b64_json) {
      console.error(
        `[orion] ${args.context} resposta sem imagem status=${res.status} ` +
        `keys=${Object.keys(json ?? {}).join(',')} data0=${truncate(JSON.stringify(first ?? null), 200)}`,
      )
      throw new OrionError('openai', 'openai não devolveu imagem', { status: res.status, fatal: false })
    }

    const buffer = Buffer.from(first.b64_json, 'base64')
    const header = imageDims(buffer)
    const echoed = parseOrionSizeParam(json?.size)
    const delivered = header.width && header.height
      ? { width: header.width, height: header.height }
      : echoed

    const mime = json?.output_format === 'jpeg' ? 'image/jpeg'
      : json?.output_format === 'webp' ? 'image/webp'
      : 'image/png'
    const url = args.deliver.kind === 'url'
      ? await uploadToStorage(buffer, mime, args.deliver.userId, args.deliver.area)
      : `data:${mime};base64,${buffer.toString('base64')}`

    return {
      images: [{ url, width: delivered?.width ?? null, height: delivered?.height ?? null }],
      provider: 'openai',
      providerModel: model,
      variant: args.variant,
      quality: args.quality,
      qualityReported: typeof json?.quality === 'string' ? json.quality : null,
      requestedSize: { width: args.size.width, height: args.size.height },
      deliveredSize: delivered,
      requestId,
      latencyMs: Date.now() - startedAt,
      imageCount: index,
      usage: parseOpenAiUsage(json?.usage),
      usageRaw: json?.usage ?? null,
      outputFormat: typeof json?.output_format === 'string' ? json.output_format : 'png',
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new OrionTimeoutError('openai', model, budgetMs)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Caminho fal.ai (comparação) ──────────────────────────────────────────────

async function generateViaFal(args: OrionGenerateArgs, budgetMs: number): Promise<OrionGenerateResult> {
  const endpoint = ORION_FAL_ENDPOINTS[args.variant]
  const startedAt = Date.now()

  // A fal BUSCA as URLs, então elas precisam ser alcançáveis por ela. Com o
  // bucket privado (STORAGE_PRIVATE=1) a URL pública dá 403 — signStorageUrl
  // resolve e é no-op quando o bucket é público ou a URL é externa.
  const admin = createAdminClient()
  const imageUrls: string[] = []
  for (const url of args.imageUrls.slice(0, ORION_MAX_IMAGES)) {
    imageUrls.push((await signStorageUrl(admin, url)) ?? url)
  }
  if (imageUrls.length === 0) throw new OrionError('fal', 'nenhuma imagem de referência utilizável', { fatal: true })

  const input = {
    prompt: args.prompt,
    image_urls: imageUrls,
    // Mesma dimensão explícita pedida à rota direta — comparação justa.
    image_size: { width: args.size.width, height: args.size.height },
    quality: args.quality,
    num_images: 1,
    output_format: 'png',
  }

  const result = await Promise.race([
    fal.subscribe(endpoint, { input: input as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new OrionTimeoutError('fal', endpoint, budgetMs)), budgetMs),
    ),
  ]).catch((err: unknown) => {
    if (err instanceof OrionError) throw err
    const e = err as { status?: number; body?: unknown; message?: string }
    const status = typeof e?.status === 'number' ? e.status : null
    console.error(
      `[orion] ${args.context} fal FALHOU endpoint=${endpoint} status=${status ?? 'n/a'} ` +
      `body=${truncate(JSON.stringify(e?.body ?? e?.message ?? String(err)))}`,
    )
    throw new OrionError('fal', `fal HTTP ${status ?? 'n/a'} ${truncate(e?.message ?? '', 200)}`.trim(), {
      status,
      fatal: isFatalStatus(status, null),
    })
  })

  const data = (result as { data?: { images?: { url?: string; width?: number; height?: number }[] } }).data
  const first = (data?.images ?? []).find(i => typeof i?.url === 'string')
  if (!first?.url) throw new OrionError('fal', 'fal não devolveu imagem', { fatal: false })

  const delivered = typeof first.width === 'number' && typeof first.height === 'number'
    ? { width: first.width, height: first.height }
    : null

  return {
    // A URL do CDN da FAL é o que os motores públicos já entregam hoje — mesma
    // durabilidade, sem um download extra dentro do orçamento da rota.
    images: [{ url: first.url, width: delivered?.width ?? null, height: delivered?.height ?? null }],
    provider: 'fal',
    providerModel: endpoint,
    variant: args.variant,
    quality: args.quality,
    qualityReported: null,
    requestedSize: { width: args.size.width, height: args.size.height },
    deliveredSize: delivered,
    requestId: (result as { requestId?: string }).requestId ?? null,
    latencyMs: Date.now() - startedAt,
    imageCount: imageUrls.length,
    // A fal não expõe tokens neste endpoint — fica null, NUNCA zero.
    usage: { ...EMPTY_ORION_USAGE },
    usageRaw: null,
    outputFormat: 'png',
  }
}

// ── Entrada única ────────────────────────────────────────────────────────────

/** Gera UMA imagem pelo fornecedor configurado. Lança em falha — sem trocar de
 *  fornecedor, sem retry e sem corrida paralela. */
export async function generateOrionImage(args: OrionGenerateArgs): Promise<OrionGenerateResult> {
  const provider = args.provider ?? orionProvider()
  const budgetMs = Math.max(15_000, Math.min(args.timeoutMs, ORION_DEFAULT_TIMEOUT_MS))
  const model = provider === 'openai' ? ORION_MODELS[args.variant] : ORION_FAL_ENDPOINTS[args.variant]
  console.log(
    `[orion] ${args.context} → ${provider} model=${model} quality=${args.quality} ` +
    `size=${orionSizeParam(args.size)} (${args.size.source}) refs=${args.imageUrls.length} ` +
    `budget=${Math.round(budgetMs / 1000)}s`,
  )

  const result = provider === 'openai'
    ? await generateViaOpenAi(args, budgetMs)
    : await generateViaFal(args, budgetMs)

  console.log(
    `[orion] ${args.context} ok provider=${result.provider} model=${result.providerModel} ` +
    `${result.latencyMs}ms pedido=${orionSizeParam(args.size)} ` +
    `entregue=${result.deliveredSize ? `${result.deliveredSize.width}x${result.deliveredSize.height}` : 'desconhecida'} ` +
    `tokens=${result.usage.totalTokens ?? 'n/d'} req=${result.requestId ?? 'n/a'}`,
  )
  return result
}
