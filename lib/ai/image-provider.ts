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
//   IMAGE_GCP_TRANSIENT_RETRIES = 0..5        (default 2 — retries extras do
//                                              caminho GCP em 429/500/503/rede
//                                              antes do fallback; 0 desliga)
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
// (prompt, image_urls, resolution, num_images, output_format, seed e — nos
// endpoints cujo schema FAL aceita, hoje só nano-banana-2/edit —
// thinking_level). O caminho GCP deriva o generateContent DESSE input (ordem
// das imagens preservada — ela é contrato de prompt em vários fluxos;
// thinking_level vira thinkingConfig); o fallback repassa o input
// byte-idêntico pra FAL. Endpoints sem mapeamento Google (flux, gpt-image…)
// passam direto pela FAL, então TODAS as rotas podem usar esta camada.
//
// Knobs Gemini 3 de fidelidade (lib/ai/gemini-knobs): os INPUTS de imagem são
// tokenizados em mediaResolution 'high' por default (IMAGE_INPUT_MEDIA_RESOLUTION
// desliga/ajusta) — o modelo não preserva o que ele nem "viu". Knob rejeitado
// pelo Vertex (400) dispara UM retry compat sem os knobs novos antes de
// qualquer fallback — knob novo nunca pode rebaixar o caminho primário.
//
// Erro TRANSITÓRIO do Vertex (429 capacidade/quota, 500/503, rede) ganha até
// IMAGE_GCP_TRANSIENT_RETRIES tentativas extras com backoff curto ANTES do
// fallback (default 2; 0 desliga) — no incidente de 2026-08-14 uma janela de
// 429 intermitente no gemini-3-pro-image mandou ~50% do vega pra FAL, sendo
// que o mesmo request passava segundos depois. O orçamento total continua
// valendo: a race de timeout corre por fora, então retry nunca estoura o
// budget — no pior caso o timeout dispara e o fallback segue como antes.
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
import {
  GoogleGenAI,
  Modality,
  PartMediaResolutionLevel,
  ThinkingLevel,
  createPartFromBase64,
  createPartFromText,
  type GenerateContentConfig,
  type Part,
} from '@google/genai'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchStorageBytes } from '@/lib/storage/fetch'
import {
  inputMediaResolutionDefault,
  isInvalidArgumentError,
  isTransientProviderError,
  type InputMediaResolution,
} from '@/lib/ai/gemini-knobs'

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
  /** Overrides do caminho GCP/Vertex (o caminho FAL ignora — knobs que o
   *  schema da FAL não expõe entram aqui; os que ela expõe vão no próprio
   *  falInput). Usado pelo retry ladder dos fluxos de fidelidade. */
  gcpConfig?: {
    temperature?: number
    /** Fixa a seed por request: retries viram variação CONTROLADA da mesma
     *  amostra, não amostra nova. Precedência sobre falInput.seed. */
    seed?: number
    /** Thinking do NB2 no caminho GCP (precedência sobre falInput.thinking_level).
     *  Ignorado em modelos sem o knob (Pro pensa sempre; 2.5 não pensa). */
    thinkingLevel?: GcpThinkingLevel
    /** Tokenização dos INPUTS de imagem (Gemini 3). Precedência sobre o
     *  default IMAGE_INPUT_MEDIA_RESOLUTION — o ladder usa pra escalar
     *  high → ultra_high nos retries. */
    mediaResolution?: InputMediaResolution
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

// Tentativas EXTRAS do caminho GCP em erro transitório (429/500/503/rede)
// antes de qualquer fallback. 0 desliga (comportamento anterior: o primeiro
// erro já derrubava pro FAL). Env é kill-switch — o default vive no código.
function gcpTransientRetries(): number {
  const raw = Number(process.env.IMAGE_GCP_TRANSIENT_RETRIES)
  return Number.isFinite(raw) && raw >= 0 ? Math.min(Math.floor(raw), 5) : 2
}

// Backoff dos retries transitórios: curto de propósito — 429 de capacidade do
// Vertex costuma limpar em segundos e a espera consome o MESMO budget da
// geração (a race de timeout continua correndo por fora).
const TRANSIENT_BACKOFF_MS = [1_500, 4_000]

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

export type GcpThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

interface GcpModelMapping {
  model: string
  supportsImageSize: boolean
  /** Gemini 3 Image aceita mediaResolution por parte nos INPUTS; o 2.5 não. */
  supportsInputMediaResolution: boolean
  /** Só o NB2 (gemini-3.1-flash-image) expõe thinking configurável. */
  supportsThinking: boolean
}

function envModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

function gcpModelFor(falEndpoint: string): GcpModelMapping | null {
  switch (falEndpoint) {
    case 'fal-ai/nano-banana/edit':
      return {
        model: envModel('GCP_IMAGE_MODEL_NANO_BANANA', 'gemini-2.5-flash-image'),
        supportsImageSize: false,
        supportsInputMediaResolution: false,
        supportsThinking: false,
      }
    case 'fal-ai/nano-banana-2/edit':
      // GA no Vertex é sem -preview (o alias -preview dá 404 neste projeto).
      return {
        model: envModel('GCP_IMAGE_MODEL_NANO_BANANA_2', 'gemini-3.1-flash-image'),
        supportsImageSize: true,
        supportsInputMediaResolution: true,
        supportsThinking: true,
      }
    // Nano Banana Pro e o endpoint explícito do preview são o MESMO Gemini 3 Pro.
    case 'fal-ai/nano-banana-pro/edit':
    case 'fal-ai/gemini-3-pro-image-preview/edit':
      // GA no Vertex é sem -preview (o alias -preview dá 404 neste projeto).
      // Thinking do Pro é sempre-ligado (sem knob na API nem na FAL).
      return {
        model: envModel('GCP_IMAGE_MODEL_NANO_BANANA_PRO', 'gemini-3-pro-image'),
        supportsImageSize: true,
        supportsInputMediaResolution: true,
        supportsThinking: false,
      }
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
  thinkingLevel: GcpThinkingLevel | null
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
  const rawThinking = typeof falInput.thinking_level === 'string' ? falInput.thinking_level.toLowerCase() : null
  const thinkingLevel =
    rawThinking === 'minimal' || rawThinking === 'low' || rawThinking === 'medium' || rawThinking === 'high'
      ? rawThinking
      : null
  return { prompt, imageUrls, resolution, numImages, seed, aspectRatio, thinkingLevel }
}

const PART_MEDIA_LEVEL: Record<InputMediaResolution, PartMediaResolutionLevel> = {
  low:        PartMediaResolutionLevel.MEDIA_RESOLUTION_LOW,
  medium:     PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  high:       PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  ultra_high: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
}

const THINKING_LEVEL: Record<GcpThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low:     ThinkingLevel.LOW,
  medium:  ThinkingLevel.MEDIUM,
  high:    ThinkingLevel.HIGH,
}

async function fetchImagePart(url: string, mediaLevel?: PartMediaResolutionLevel): Promise<Part> {
  const { buffer, contentType } = await fetchStorageBytes(url)
  const ct = contentType.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  return createPartFromBase64(buffer.toString('base64'), mime, mediaLevel)
}

// Retry compat: remove o mediaResolution de uma parte sem re-baixar a imagem.
function stripPartMediaResolution(part: Part): Part {
  if (!part.mediaResolution) return part
  const clone = { ...part }
  delete clone.mediaResolution
  return clone
}

// Sticky por instância: liga DEPOIS que um retry compat deu certo (evidência
// forte de que o endpoint rejeita os knobs Gemini 3) — as próximas chamadas
// pulam os knobs direto, sem pagar a ida-e-volta do 400 a cada request. Reset
// natural a cada cold start (deploy novo re-testa os knobs).
let gcpKnobsRejected = false

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
      // Knobs Gemini 3 de fidelidade (lib/ai/gemini-knobs):
      //   - mediaResolution por parte: quanto detalhe fino dos INPUTS o modelo
      //     tokeniza (default 'high'; o ladder escala pra 'ultra_high').
      //   - thinkingLevel: NB2 planeja a cena antes de gerar — adere melhor ao
      //     contrato de preservação. gcpConfig tem precedência; sem ele vale o
      //     thinking_level do falInput (o MESMO valor que o fallback FAL vê).
      const inputMediaRes = mapping.supportsInputMediaResolution && !gcpKnobsRejected
        ? (args.gcpConfig?.mediaResolution ?? inputMediaResolutionDefault())
        : null
      const thinkingLevel = mapping.supportsThinking && !gcpKnobsRejected
        ? (args.gcpConfig?.thinkingLevel ?? parsed.thinkingLevel)
        : null

      // Ordem preservada: em vários fluxos ela é contrato do prompt
      // (âncora primeiro, fonte → máscara → referências). Com imageLabels,
      // cada imagem é precedida pelo rótulo do seu papel — binding explícito
      // entre o "Image #N" do prompt e a imagem real. buildContents é reusado
      // pelo retry compat (mesmos bytes, sem mediaResolution).
      const partLevel = inputMediaRes ? PART_MEDIA_LEVEL[inputMediaRes] : undefined
      const imageParts = await Promise.all(parsed.imageUrls.map(u => fetchImagePart(u, partLevel)))
      const buildContents = (parts: Part[]): Part[] => {
        const out: Part[] = [createPartFromText(parsed.prompt)]
        parts.forEach((part, i) => {
          const label = args.imageLabels?.[i]
          if (label && label.trim()) out.push(createPartFromText(label.trim()))
          out.push(part)
        })
        return out
      }
      const contents = buildContents(imageParts)

      const baseConfig: GenerateContentConfig = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        // Fluxos de preservação (norte do produto): temperatura baixa reduz
        // "criatividade" fora do pedido — mesmo valor do lib/ai/google. (O
        // ladder mantém 0.2 fixo: a escalada é por condicionamento, não por
        // sampling — ver lib/ai/fidelity/render-only.)
        temperature: args.gcpConfig?.temperature ?? 0.2,
        // gcpConfig.seed tem precedência sobre o seed do falInput.
        ...(args.gcpConfig?.seed !== undefined
          ? { seed: args.gcpConfig.seed }
          : parsed.seed !== undefined ? { seed: parsed.seed } : {}),
        ...(mapping.supportsImageSize && (parsed.resolution || parsed.aspectRatio)
          ? {
              imageConfig: {
                ...(parsed.resolution ? { imageSize: parsed.resolution } : {}),
                ...(parsed.aspectRatio ? { aspectRatio: parsed.aspectRatio } : {}),
              },
            }
          : {}),
      }
      const config: GenerateContentConfig = {
        ...baseConfig,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL[thinkingLevel] } } : {}),
      }

      const requestOnce = async (reqContents: Part[], reqConfig: GenerateContentConfig) => {
        const response = await vertexClient().models.generateContent({
          model: mapping.model,
          contents: reqContents,
          config: reqConfig,
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

      const callOnce = async () => {
        try {
          return await requestOnce(contents, config)
        } catch (err) {
          // Retry compat: knob Gemini 3 rejeitado (400/INVALID_ARGUMENT) não
          // pode rebaixar o caminho primário pro fallback — tenta 1x sem os
          // knobs novos. Erros de outra natureza sobem como antes.
          if ((inputMediaRes || thinkingLevel) && isInvalidArgumentError(err)) {
            console.warn(
              `[image-provider] ${args.context} knob Gemini 3 rejeitado (${truncate((err as Error).message ?? String(err), 160)}) — retry compat sem mediaResolution/thinking`,
            )
            const result = await requestOnce(buildContents(imageParts.map(stripPartMediaResolution)), baseConfig)
            gcpKnobsRejected = true
            return result
          }
          throw err
        }
      }

      // Retry transitório (por chamada): 429 de capacidade/quota, 500/503 e
      // blip de rede se resolvem em segundos — segurar o caminho GCP vale mais
      // que a ida precoce pro fallback (crédito GCP vs fatura FAL). Erros de
      // contrato (400/404) NÃO entram aqui: sobem na hora, como antes. O retry
      // compat de knobs (callOnce) roda por dentro e continua intacto.
      const maxTransientRetries = gcpTransientRetries()
      const callWithTransientRetry = async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await callOnce()
          } catch (err) {
            if (attempt >= maxTransientRetries || !isTransientProviderError(err)) throw err
            const delayMs = TRANSIENT_BACKOFF_MS[Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)]
            console.warn(
              `[image-provider] ${args.context} erro transitório do Vertex (${truncate((err as Error).message ?? String(err), 160)}) — retry ${attempt + 1}/${maxTransientRetries} em ${delayMs}ms`,
            )
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }
      }

      // num_images > 1 não existe nos call sites atuais (sempre 1), mas a FAL
      // aceitava — cobrimos com N chamadas paralelas pra não quebrar contrato.
      return Promise.all(Array.from({ length: parsed.numImages }, callWithTransientRetry))
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
