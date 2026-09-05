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
// (prompt, image_urls, resolution, num_images, output_format, seed e — nos
// endpoints cujo schema FAL aceita, hoje só nano-banana-2/edit —
// thinking_level). O caminho GCP deriva o generateContent DESSE input (ordem
// das imagens preservada — ela é contrato de prompt em vários fluxos;
// thinking_level vira thinkingConfig); o fallback repassa o input
// byte-idêntico pra FAL. Endpoints sem mapeamento Google (flux, seedream…)
// passam direto pela FAL, então TODAS as rotas podem usar esta camada.
//
// Resiliência do caminho primário (o fallback FAL é o provider CARO — só vale
// quando o GCP realmente não entrega):
//   - 429/5xx do Vertex é capacidade compartilhada do endpoint global, não
//     quota do projeto: até 3 tentativas com backoff 2s/4s (+jitter) dentro do
//     orçamento do GCP antes de considerar fallback. IMAGE_GCP_MAX_ATTEMPTS=1
//     desliga; IMAGE_GCP_BACKOFF_MS ajusta.
//   - a MESMA saturação também aparece como chamada TRAVADA (sem 429): a
//     latência do Vertex é bimodal — ou responde em ~30-40s, ou não responde.
//     Daí o teto POR TENTATIVA (GCP_ATTEMPT_TIMEOUT_MS, 75s ≈ p99 das que dão
//     certo): corta o stall cedo e tenta de novo NO GCP, em vez de gastar o
//     orçamento inteiro esperando e entregar a geração pro FAL.
//   - o GCP recebe 75% do orçamento do call site (IMAGE_GCP_BUDGET_SHARE),
//     limitado por IMAGE_GCP_TIMEOUT_MS; o fallback FAL tem piso próprio de
//     45s (FAL_FALLBACK_MIN_MS) pra que a fatia maior não vire falha total.
//
// Knobs Gemini 3 de fidelidade (lib/ai/gemini-knobs): os INPUTS de imagem são
// tokenizados em mediaResolution 'high' por default (IMAGE_INPUT_MEDIA_RESOLUTION
// desliga/ajusta) — o modelo não preserva o que ele nem "viu". Knob rejeitado
// pelo Vertex (400) dispara UM retry compat sem os knobs novos antes de
// qualquer fallback — knob novo nunca pode rebaixar o caminho primário.
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
  isTransientCapacityError,
  type InputMediaResolution,
} from '@/lib/ai/gemini-knobs'

fal.config({ credentials: process.env.FAL_KEY })

const STORAGE_BUCKET = 'space-mestres'

// ── Retry de capacidade do Vertex ─────────────────────────────────────────────
//
// O 429 RESOURCE_EXHAUSTED dos modelos de imagem no endpoint global é de
// capacidade compartilhada, não de quota do projeto: passa em segundos. Backoff
// bem maior que o do lib/gemini (texto) porque geração de imagem é lenta e um
// pico de capacidade não se resolve em 500ms. Envs só pra ajuste fino/rollback
// (IMAGE_GCP_MAX_ATTEMPTS=1 desliga o retry sem redeploy de código).
const GCP_MAX_ATTEMPTS    = Math.max(1, Number(process.env.IMAGE_GCP_MAX_ATTEMPTS) || 3)
const GCP_BASE_BACKOFF_MS = Math.max(250, Number(process.env.IMAGE_GCP_BACKOFF_MS) || 2_000)
// Tempo mínimo que precisa sobrar do orçamento pra mais uma tentativa valer a
// pena: abaixo disso a chamada não termina e só queima o tempo do fallback.
const GCP_MIN_RETRY_WINDOW_MS = 25_000

// Teto POR TENTATIVA (o budget total é outro): a chamada do Vertex é bimodal —
// ou volta rápido, ou não volta. Sobre 428 chamadas OK em 30 dias: p50 30,6s /
// p90 45,5s / p95 55s / p99 83,5s / máx 107s. Cortar em 75s pega só 2,1% das
// chamadas legítimas, e essas vão pra OUTRA tentativa no GCP — não pro FAL.
// Sem esse teto, uma chamada travada consumia o orçamento inteiro e entregava
// a geração pro provider caro; com ele, cabe stall(75s) + retry(~40s) dentro
// do orçamento. IMAGE_GCP_ATTEMPT_TIMEOUT_MS ajusta.
const GCP_ATTEMPT_TIMEOUT_MS = Math.max(30_000, Number(process.env.IMAGE_GCP_ATTEMPT_TIMEOUT_MS) || 75_000)

/** Tentativa individual do Vertex que passou do teto por tentativa. Não é o
 *  timeout do orçamento (ImageProviderTimeoutError) — este é RETENTÁVEL. */
class GcpAttemptStallError extends Error {
  constructor(ms: number) {
    super(`tentativa do Vertex passou de ${ms}ms sem responder`)
    this.name = 'GcpAttemptStallError'
  }
}

// Piso de tempo do fallback FAL quando o GCP consumiu o orçamento (timeout do
// primário). Medido em produção: a FAL leva de ~24s a ~68s no Nano Banana Pro
// nesses casos. Com o piso antigo de 15s, dar mais orçamento ao GCP trocaria
// "fallback lento" por "falha total + refund" — o piso é o que torna a fatia
// de 75% segura. Pode estourar o timeoutMs do call site em alguns segundos: a
// rota tem folga de orçamento própria e prefere entregar a imagem.
const FAL_FALLBACK_MIN_MS = 45_000

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

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

  // Instante em que o orçamento do GCP acaba — o retry de capacidade só repete
  // enquanto couber DENTRO dele (a race abaixo é quem corta de verdade).
  const deadline = Date.now() + budgetMs

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
        // Teto por tentativa, limitado também pelo que resta do orçamento: uma
        // chamada travada é cortada cedo pra sobrar tempo de tentar de novo.
        const attemptCap = Math.max(15_000, Math.min(GCP_ATTEMPT_TIMEOUT_MS, deadline - Date.now()))
        const response = await Promise.race([
          vertexClient().models.generateContent({
            model: mapping.model,
            contents: reqContents,
            config: reqConfig,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new GcpAttemptStallError(attemptCap)), attemptCap),
          ),
        ])
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

      // Retry de CAPACIDADE, camada de FORA do retry compat. Cobre as DUAS caras
      // da mesma saturação do Vertex, medidas em produção no Nano Banana Pro:
      //   - 429 RESOURCE_EXHAUSTED genérico (capacidade compartilhada do
      //     endpoint global, não quota do projeto — ver isTransientCapacityError);
      //   - chamada TRAVADA, sem erro nenhum: a latência é bimodal (p50 30,6s,
      //     p99 83,5s nas que dão certo) e a que não volta nunca volta. O teto
      //     por tentativa a transforma em GcpAttemptStallError, retentável.
      // Sem isto, qualquer um dos dois mandava a geração inteira pro fallback
      // FAL, que é o provider caro. Repetir aqui custa segundos; cair pro FAL
      // custa a geração toda.
      const callWithRetry = async () => {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GCP_MAX_ATTEMPTS; attempt++) {
          try {
            return await callOnce()
          } catch (err) {
            lastErr = err
            const retryable = err instanceof GcpAttemptStallError || isTransientCapacityError(err)
            if (attempt === GCP_MAX_ATTEMPTS || !retryable) throw err
            // Depois de um stall o tempo já foi gasto esperando — não faz
            // sentido esperar mais; o backoff exponencial é só pro 429/5xx.
            const backoff = err instanceof GcpAttemptStallError
              ? 0
              : GCP_BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 500)
            // Sem tempo pro backoff MAIS uma tentativa com chance real de
            // terminar: desiste agora e entrega o resto do orçamento pro
            // fallback, em vez de queimar os dois caminhos.
            if (Date.now() + backoff + GCP_MIN_RETRY_WINDOW_MS > deadline) {
              console.warn(
                `[image-provider] ${args.context} gcp falha retentável na tentativa ${attempt} sem orçamento pra repetir — vai de fallback`,
              )
              throw err
            }
            console.warn(
              `[image-provider] ${args.context} gcp tentativa ${attempt}/${GCP_MAX_ATTEMPTS} falhou ` +
              `(${truncate((err as Error)?.message ?? String(err), 140)}) — retry em ${backoff}ms`,
            )
            await sleep(backoff)
          }
        }
        throw lastErr
      }

      // num_images > 1 não existe nos call sites atuais (sempre 1), mas a FAL
      // aceitava — cobrimos com N chamadas paralelas pra não quebrar contrato.
      return Promise.all(Array.from({ length: parsed.numImages }, callWithRetry))
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
  ]).catch((err: unknown) => {
    // Erro da FAL com endpoint + status + body (ex.: 422 de schema, 429) —
    // sem prompt/URLs (AL-9). Rethrow: as rotas seguem tratando/refundando.
    const e = err as { status?: number; body?: unknown; message?: string }
    console.error(
      `[image-provider] ${args.context} fal FALHOU endpoint=${args.falEndpoint}` +
      ` status=${e?.status ?? 'n/a'} body=${truncate(JSON.stringify(e?.body ?? e?.message ?? String(err)))}`,
    )
    throw err
  })

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
    // Com fallback ligado o GCP fica com 75% do orçamento (era 60%): a 60% o
    // Nano Banana Pro só tinha 108s de 180s e estourava sozinho — o timeout do
    // PRIMÁRIO virava geração no provider caro. Sem fallback, leva o orçamento
    // inteiro. O piso de segurança do fallback é o FAL_FALLBACK_MIN_MS abaixo,
    // não esta fatia — é ele que impede a fatia maior de virar falha total.
    const gcpCap = Number(process.env.IMAGE_GCP_TIMEOUT_MS) || 150_000
    const gcpShare = Math.min(0.9, Math.max(0.5, Number(process.env.IMAGE_GCP_BUDGET_SHARE) || 0.75))
    const gcpBudget = fallback
      ? Math.min(Math.max(30_000, Math.floor(args.timeoutMs * gcpShare)), gcpCap, args.timeoutMs)
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
      const remaining = Math.max(FAL_FALLBACK_MIN_MS, args.timeoutMs - (Date.now() - startedAt))
      const core = await generateViaFal(args, remaining)
      const latencyMs = Date.now() - startedAt
      console.log(`[image-provider] ${args.context} ok provider=fal (fallback) ${latencyMs}ms images=${core.images.length}`)
      return { ...core, provider: 'fal', fallbackUsed: true, latencyMs, errorMessage: primaryError }
    }
  }

  if (primary === 'gcp' && !mapping) {
    // Endpoint não-Google (flux, seedream, upscaler) — FAL é o caminho normal.
  } else if (primary === 'gcp') {
    console.warn(`[image-provider] ${args.context} IMAGE_PROVIDER_PRIMARY=gcp mas credenciais Vertex ausentes — usando fal direto`)
  }

  const core = await generateViaFal(args, args.timeoutMs)
  const latencyMs = Date.now() - startedAt
  console.log(`[image-provider] ${args.context} ok provider=fal model=${core.providerModel} ${latencyMs}ms images=${core.images.length}`)
  return { ...core, provider: 'fal', fallbackUsed: false, latencyMs, errorMessage: null }
}
