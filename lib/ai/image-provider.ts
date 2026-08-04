// lib/ai/image-provider.ts
//
// Camada ÚNICA de geração de imagem para os modelos Google/Gemini que hoje
// rodam via FAL (família Nano Banana / Gemini Image). GCP/Vertex é o provider
// primário (consome créditos GCP, custo menor); FAL fica como fallback
// transparente. Rota e UI não sabem qual provider gerou — o contrato de saída
// é o mesmo do uso atual da FAL (images[].url + requestId).
//
// Ativação por env (local E Vercel — ver [[project_vercel_env_parity]]):
//   IMAGE_PROVIDER_PRIMARY  = 'gcp' | 'fal'   (default 'fal' — rollback é só
//                                              remover/trocar a env e redeploy)
//   IMAGE_PROVIDER_FALLBACK = 'fal' | 'none'  (default 'fal')
//
// Credenciais Vertex (mesma convenção do vertexVeoAdapter / vertex-imagen-edit):
//   GOOGLE_VERTEX_PROJECT           — id do projeto GCP
//   GOOGLE_VERTEX_CREDENTIALS_JSON  — JSON da service account inline (Vercel)
//   GOOGLE_APPLICATION_CREDENTIALS  — caminho do arquivo da SA (ADC, local)
//   GOOGLE_VERTEX_IMAGE_LOCATION    — região (default 'global' — os modelos
//                                     Gemini Image ficam no endpoint global)
//
// Overrides de modelo (env tem precedência sobre o default; troca por env se o
// id mudar no Vertex):
//   GCP_IMAGE_MODEL_NANO_BANANA     (default gemini-2.5-flash-image)
//   GCP_IMAGE_MODEL_NANO_BANANA_2   (default gemini-3.1-flash-image)
//   GCP_IMAGE_MODEL_NANO_BANANA_PRO (default gemini-3-pro-image)
// ATENÇÃO: no Vertex os Gemini 3 Image são GA (SEM -preview) — os aliases
// -preview dão 404 neste projeto. É o OPOSTO da API direta do Google
// (lib/ai/google/editImage.ts), onde o id válido hoje ainda é -preview.
//
// Contrato: cada call site passa o MESMO falInput que já enviava pra FAL
// (prompt, image_urls, resolution, num_images, output_format, seed). O caminho
// GCP deriva o generateContent DESSE input (ordem das imagens preservada — ela
// é contrato de prompt em vários fluxos); o fallback repassa o input
// byte-idêntico pra FAL. Endpoints sem mapeamento Google (flux, gpt-image…)
// passam direto pela FAL, então TODAS as rotas podem usar esta camada.
//
// Saída GCP vem como bytes (Vertex não tem CDN pública como a FAL):
//   deliver 'url'     → re-hospeda no bucket space-mestres e devolve URL https
//                       (rotas que persistem/retornam URL: Renderizar, Spaces,
//                       Apresentar) — mesmo padrão do vertexVeoAdapter.
//   deliver 'dataUrl' → devolve data: URL (pipelines que já baixam e
//                       re-hospedam o resultado: Editar/Retocar) — mesmo
//                       padrão do vertex-imagen-edit.
//
// Nodes: esta camada NÃO cobra nem refunda nada — débito antes / refund em
// falha continuam nas rotas, exatamente como hoje.

import { fal } from '@fal-ai/client'
import { GoogleGenAI, Modality, createPartFromBase64, createPartFromText, type Part } from '@google/genai'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchStorageBytes } from '@/lib/storage/fetch'

fal.config({ credentials: process.env.FAL_KEY })

const STORAGE_BUCKET = 'space-mestres'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ImageProviderId = 'gcp' | 'fal'

export type ImageDelivery =
  | { kind: 'url'; userId: string; area: string }
  | { kind: 'dataUrl' }

export interface GenerateImageArgs {
  /** Endpoint FAL que o call site usa hoje — id do mapeamento GCP e alvo do fallback. */
  falEndpoint: string
  /** Input EXATO que era passado ao fal.subscribe (fonte dos dois caminhos). */
  falInput: Record<string, unknown>
  /** Orçamento total (mesmo valor do timeout que o call site já usava). */
  timeoutMs: number
  /** Identificação nos logs, ex.: 'generate', 'spaces.generate', 'retocar/nb2'. */
  context: string
  deliver: ImageDelivery
  /** Rótulo de PAPEL de cada imagem, paralelo a falInput.image_urls. No caminho
   *  GCP/Vertex cada rótulo vira uma parte de texto imediatamente ANTES da
   *  imagem correspondente — é o que vincula "Image #1"/"Image #2" do prompt à
   *  imagem certa (sem isso o modelo escolhe a âncora por conta própria, e em
   *  pares print+mestre ele tende a ancorar na imagem mais acabada). Entradas
   *  null pulam o rótulo daquela posição. O caminho FAL ignora (o schema só
   *  aceita image_urls; os papéis seguem indo no texto do prompt). */
  imageLabels?: (string | null)[]
  /** Overrides do caminho GCP/Vertex (o caminho FAL ignora — o schema da FAL
   *  não expõe esses knobs). Usado pelo retry ladder do render_only pra
   *  reduzir "criatividade" (temperatura ↓). */
  gcpConfig?: {
    temperature?: number
  }
}

export interface GeneratedImage {
  url: string
  width: number | null
  height: number | null
}

export interface GenerateImageResult {
  images: GeneratedImage[]
  provider: ImageProviderId
  /** Modelo real: id do modelo Vertex (gcp) ou endpoint FAL (fal). */
  providerModel: string
  /** requestId da FAL ou responseId do Vertex — rastreabilidade. */
  requestId: string | null
  fallbackUsed: boolean
  latencyMs: number
  /** Erro do provider primário quando o fallback foi usado. */
  errorMessage: string | null
}

// ── Erros (compat com o tratamento das rotas/wrappers atuais) ─────────────────

export class ImageProviderTimeoutError extends Error {
  /** Mesma flag que as rotas já usam pra mapear a mensagem de timeout. */
  readonly isFalTimeout = true
  constructor(provider: ImageProviderId, endpoint: string, timeoutMs: number) {
    super(`geração de imagem excedeu ${timeoutMs}ms (${provider}: ${endpoint})`)
    this.name = 'ImageProviderTimeoutError'
  }
}

export class ImageProviderNoOutputError extends Error {
  constructor(provider: ImageProviderId, endpoint: string) {
    super(`provider não devolveu imagem (${provider}: ${endpoint})`)
    this.name = 'ImageProviderNoOutputError'
  }
}

// ── Config por env ────────────────────────────────────────────────────────────

export function imageProviderPrimary(): ImageProviderId {
  return process.env.IMAGE_PROVIDER_PRIMARY?.trim().toLowerCase() === 'gcp' ? 'gcp' : 'fal'
}

function imageFallbackEnabled(): boolean {
  return (process.env.IMAGE_PROVIDER_FALLBACK?.trim().toLowerCase() || 'fal') !== 'none'
}

function hasVertexCredentials(): boolean {
  return !!process.env.GOOGLE_VERTEX_PROJECT?.trim() &&
    (!!process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim() ||
     !!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
}

// ── Mapeamento endpoint FAL → modelo Gemini no Vertex ─────────────────────────
//
// Só os endpoints que SÃO modelos Google. `supportsImageSize`: a família
// Gemini 3 aceita imageConfig.imageSize (1K/2K/4K); o 2.5 Flash Image não —
// e os call sites desse endpoint também não passam `resolution` pra FAL.

interface GcpModelMapping {
  model: string
  supportsImageSize: boolean
}

function envModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

function gcpModelFor(falEndpoint: string): GcpModelMapping | null {
  switch (falEndpoint) {
    case 'fal-ai/nano-banana/edit':
      return { model: envModel('GCP_IMAGE_MODEL_NANO_BANANA', 'gemini-2.5-flash-image'), supportsImageSize: false }
    case 'fal-ai/nano-banana-2/edit':
      // GA no Vertex é sem -preview (o alias -preview dá 404 neste projeto).
      return { model: envModel('GCP_IMAGE_MODEL_NANO_BANANA_2', 'gemini-3.1-flash-image'), supportsImageSize: true }
    // Nano Banana Pro e o endpoint explícito do preview são o MESMO Gemini 3 Pro.
    case 'fal-ai/nano-banana-pro/edit':
    case 'fal-ai/gemini-3-pro-image-preview/edit':
      // GA no Vertex é sem -preview (o alias -preview dá 404 neste projeto).
      return { model: envModel('GCP_IMAGE_MODEL_NANO_BANANA_PRO', 'gemini-3-pro-image'), supportsImageSize: true }
    default:
      return null
  }
}

// ── Cliente Vertex (instância própria — o Veo usa região us-central1;
//    imagem usa o endpoint global) ─────────────────────────────────────────────

let _vertex: GoogleGenAI | null = null
function vertexClient(): GoogleGenAI {
  if (_vertex) return _vertex
  const project   = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  const location  = process.env.GOOGLE_VERTEX_IMAGE_LOCATION?.trim() || 'global'
  const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
  if (!project || !hasVertexCredentials()) {
    throw new Error(
      'IMAGE_PROVIDER_PRIMARY=gcp exige GOOGLE_VERTEX_PROJECT e uma credencial: ' +
      'GOOGLE_VERTEX_CREDENTIALS_JSON (inline) ou GOOGLE_APPLICATION_CREDENTIALS (caminho ADC).',
    )
  }
  _vertex = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    ...(credsJson ? { googleAuthOptions: { credentials: JSON.parse(credsJson) } } : {}),
  })
  return _vertex
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ParsedFalInput {
  prompt: string
  imageUrls: string[]
  resolution: '1K' | '2K' | '4K' | null
  numImages: number
  seed: number | undefined
  aspectRatio: string | null
}

function parseFalInput(falInput: Record<string, unknown>): ParsedFalInput {
  const prompt = typeof falInput.prompt === 'string' ? falInput.prompt : ''
  const rawUrls = Array.isArray(falInput.image_urls) ? falInput.image_urls : []
  const imageUrls = rawUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
  const res = typeof falInput.resolution === 'string' ? falInput.resolution.toUpperCase() : null
  const resolution = res === '1K' || res === '2K' || res === '4K' ? res : null
  const rawNum = Number(falInput.num_images)
  const numImages = Number.isFinite(rawNum) && rawNum >= 1 ? Math.min(Math.floor(rawNum), 4) : 1
  const seed = typeof falInput.seed === 'number' ? falInput.seed : undefined
  const aspectRatio = typeof falInput.aspect_ratio === 'string' ? falInput.aspect_ratio : null
  return { prompt, imageUrls, resolution, numImages, seed, aspectRatio }
}

async function fetchImagePart(url: string): Promise<Part> {
  const { buffer, contentType } = await fetchStorageBytes(url)
  const ct = contentType.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  return createPartFromBase64(buffer.toString('base64'), mime)
}

// Dimensões via parse do CABEÇALHO (PNG/JPEG) em JS puro. Sem sharp de
// propósito: este módulo entra no grafo dos client components via barrel de
// lib/spaces/engines (que só consome tipos/labels), e sharp não tem build de
// browser — o next build quebra em 'fs'. Best-effort: formato desconhecido
// devolve nulls (o Preserve V2 já trata aspecto nulo).
function imageDims(buf: Buffer): { width: number | null; height: number | null } {
  try {
    // PNG: assinatura de 8 bytes + chunk IHDR → width/height BE nos offsets 16/20.
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    // JPEG: varre segmentos até um SOFn (C0–CF, exceto C4/C8/CC) → height/width BE.
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue }
        const marker = buf[off + 1]
        if (marker === 0xff) { off++; continue }                    // fill byte
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { off += 2; continue } // sem payload
        if (marker === 0xda) break                                  // SOS: header acabou sem SOF
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) }
        }
        const len = buf.readUInt16BE(off + 2)
        off += 2 + Math.max(len, 2)
      }
    }
    return { width: null, height: null }
  } catch {
    return { width: null, height: null }
  }
}

// Sobe o resultado pro Storage e devolve a URL pública — mesma convenção de
// chave do rehost/uploadEditAsset (`${userId}/${area}/…`), mesmo bucket.
async function uploadToStorage(buf: Buffer, mime: string, userId: string, area: string): Promise<string> {
  const admin = createAdminClient()
  const ext = ((mime.split('/')[1] ?? 'png').split(';')[0] || 'png').replace('jpeg', 'jpg')
  const rand = Math.random().toString(36).slice(2, 8)
  const key = `${userId}/${area}/${Date.now()}-${rand}.${ext}`
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(key, buf, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`upload do resultado pro Storage falhou: ${error.message}`)
  return admin.storage.from(STORAGE_BUCKET).getPublicUrl(key).data.publicUrl
}

function truncate(msg: string, max = 300): string {
  return msg.length > max ? msg.slice(0, max) + '…' : msg
}

interface CoreResult {
  images: GeneratedImage[]
  providerModel: string
  requestId: string | null
}

// ── Caminho GCP/Vertex ────────────────────────────────────────────────────────

async function generateViaGcp(
  args: GenerateImageArgs,
  mapping: GcpModelMapping,
  budgetMs: number,
): Promise<CoreResult> {
  const parsed = parseFalInput(args.falInput)
  if (!parsed.prompt) throw new Error('falInput sem prompt — nada pra enviar ao Vertex')

  const generated = await Promise.race([
    (async () => {
      // Ordem preservada: em vários fluxos ela é contrato do prompt
      // (âncora primeiro, fonte → máscara → referências). Com imageLabels,
      // cada imagem é precedida pelo rótulo do seu papel — binding explícito
      // entre o "Image #N" do prompt e a imagem real.
      const imageParts = await Promise.all(parsed.imageUrls.map(fetchImagePart))
      const contents: Part[] = [createPartFromText(parsed.prompt)]
      imageParts.forEach((part, i) => {
        const label = args.imageLabels?.[i]
        if (label && label.trim()) contents.push(createPartFromText(label.trim()))
        contents.push(part)
      })

      const config = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        // Fluxos de preservação (norte do produto): temperatura baixa reduz
        // "criatividade" fora do pedido — mesmo valor do lib/ai/google. O
        // retry ladder do render_only baixa ainda mais via gcpConfig.
        temperature: args.gcpConfig?.temperature ?? 0.2,
        ...(parsed.seed !== undefined ? { seed: parsed.seed } : {}),
        ...(mapping.supportsImageSize && (parsed.resolution || parsed.aspectRatio)
          ? {
              imageConfig: {
                ...(parsed.resolution ? { imageSize: parsed.resolution } : {}),
                ...(parsed.aspectRatio ? { aspectRatio: parsed.aspectRatio } : {}),
              },
            }
          : {}),
      }

      const callOnce = async () => {
        const response = await vertexClient().models.generateContent({
          model: mapping.model,
          contents,
          config,
        })
        const parts = response.candidates?.[0]?.content?.parts ?? []
        const inline = parts.find(p => p.inlineData?.data)?.inlineData
        if (!inline?.data) throw new ImageProviderNoOutputError('gcp', args.falEndpoint)
        const mime = inline.mimeType && inline.mimeType.startsWith('image/') ? inline.mimeType : 'image/png'
        return {
          buffer: Buffer.from(inline.data, 'base64'),
          mime,
          responseId: response.responseId ?? null,
        }
      }

      // num_images > 1 não existe nos call sites atuais (sempre 1), mas a FAL
      // aceitava — cobrimos com N chamadas paralelas pra não quebrar contrato.
      return Promise.all(Array.from({ length: parsed.numImages }, callOnce))
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ImageProviderTimeoutError('gcp', args.falEndpoint, budgetMs)), budgetMs),
    ),
  ])

  const images: GeneratedImage[] = []
  for (const g of generated) {
    const dims = imageDims(g.buffer)
    const url = args.deliver.kind === 'url'
      ? await uploadToStorage(g.buffer, g.mime, args.deliver.userId, args.deliver.area)
      : `data:${g.mime};base64,${g.buffer.toString('base64')}`
    images.push({ url, width: dims.width, height: dims.height })
  }

  return { images, providerModel: mapping.model, requestId: generated[0]?.responseId ?? null }
}

// ── Caminho FAL (legado — input repassado byte-idêntico) ──────────────────────

async function generateViaFal(args: GenerateImageArgs, budgetMs: number): Promise<CoreResult> {
  const result = await Promise.race([
    fal.subscribe(args.falEndpoint, { input: args.falInput as unknown as never }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ImageProviderTimeoutError('fal', args.falEndpoint, budgetMs)), budgetMs),
    ),
  ])

  const data = result.data as { images?: { url?: string; width?: number; height?: number }[] }
  const images: GeneratedImage[] = (data.images ?? [])
    .filter((i): i is { url: string; width?: number; height?: number } => typeof i?.url === 'string')
    .map(i => ({ url: i.url, width: i.width ?? null, height: i.height ?? null }))
  if (images.length === 0) throw new ImageProviderNoOutputError('fal', args.falEndpoint)

  return {
    images,
    providerModel: args.falEndpoint,
    requestId: (result as { requestId?: string }).requestId ?? null,
  }
}

// ── Entrada única ─────────────────────────────────────────────────────────────

/** Gera imagem(ns) respeitando IMAGE_PROVIDER_PRIMARY/FALLBACK. Lança em falha
 *  total (rota faz refund, como hoje); timeout carrega isFalTimeout=true. */
export async function generateImage(args: GenerateImageArgs): Promise<GenerateImageResult> {
  const startedAt = Date.now()
  const primary = imageProviderPrimary()
  const mapping = gcpModelFor(args.falEndpoint)

  if (primary === 'gcp' && mapping && hasVertexCredentials()) {
    const fallback = imageFallbackEnabled()
    // Com fallback ligado, o GCP fica com ~60% do orçamento pra sobrar tempo
    // real de FAL depois; sem fallback, leva o orçamento inteiro.
    const gcpCap = Number(process.env.IMAGE_GCP_TIMEOUT_MS) || 150_000
    const gcpBudget = fallback
      ? Math.min(Math.max(30_000, Math.floor(args.timeoutMs * 0.6)), gcpCap, args.timeoutMs)
      : Math.min(args.timeoutMs, gcpCap)

    console.log(`[image-provider] ${args.context} → gcp model=${mapping.model} budget=${Math.round(gcpBudget / 1000)}s fallback=${fallback ? 'fal' : 'none'}`)
    try {
      const core = await generateViaGcp(args, mapping, gcpBudget)
      const latencyMs = Date.now() - startedAt
      console.log(`[image-provider] ${args.context} ok provider=gcp model=${core.providerModel} ${latencyMs}ms images=${core.images.length}`)
      return { ...core, provider: 'gcp', fallbackUsed: false, latencyMs, errorMessage: null }
    } catch (err) {
      const primaryError = truncate((err as Error).message ?? String(err))
      if (!fallback) {
        console.error(`[image-provider] ${args.context} gcp FALHOU sem fallback: ${primaryError}`)
        throw err
      }
      console.error(`[image-provider] ${args.context} gcp FALHOU (${primaryError}) → fallback fal ${args.falEndpoint}`)
      const remaining = Math.max(15_000, args.timeoutMs - (Date.now() - startedAt))
      const core = await generateViaFal(args, remaining)
      const latencyMs = Date.now() - startedAt
      console.log(`[image-provider] ${args.context} ok provider=fal (fallback) ${latencyMs}ms images=${core.images.length}`)
      return { ...core, provider: 'fal', fallbackUsed: true, latencyMs, errorMessage: primaryError }
    }
  }

  if (primary === 'gcp' && !mapping) {
    // Endpoint não-Google (flux, gpt-image, upscaler) — FAL é o caminho normal.
  } else if (primary === 'gcp') {
    console.warn(`[image-provider] ${args.context} IMAGE_PROVIDER_PRIMARY=gcp mas credenciais Vertex ausentes — usando fal direto`)
  }

  const core = await generateViaFal(args, args.timeoutMs)
  const latencyMs = Date.now() - startedAt
  console.log(`[image-provider] ${args.context} ok provider=fal model=${core.providerModel} ${latencyMs}ms images=${core.images.length}`)
  return { ...core, provider: 'fal', fallbackUsed: false, latencyMs, errorMessage: null }
}
