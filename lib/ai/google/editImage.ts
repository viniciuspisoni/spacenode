// lib/ai/google/editImage.ts
//
// Camada de edição de imagem via API DIRETA do Google (@google/genai +
// GEMINI_API_KEY) — o motor principal do Editar V3 ("Nano Banana"). Sem FAL.
//
// Modelos:
//   gemini-3.1-flash-image  — padrão (Nano Banana; multi-imagem até 14 refs)
//   gemini-3-pro-image      — alta precisão
//
// Os modelos Gemini NÃO aceitam máscara em pixels (doc oficial): a seleção vai
// como "mapa" (2ª imagem) + contrato textual de papéis. A preservação fora da
// seleção é GARANTIDA pelo recompose server-side do pipeline — o modelo
// re-sintetiza a cena, então o recompose é obrigatório.
//
// Ordem das imagens: [principal] → [máscara?] → [referências...].

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
import { fetchStorageBytes } from '@/lib/storage/fetch'
import {
  inputMediaResolutionDefault,
  isInvalidArgumentError,
  nb2ThinkingLevel,
  type InputMediaResolution,
} from '@/lib/ai/gemini-knobs'

export type GoogleImageModel = 'gemini-3.1-flash-image' | 'gemini-3-pro-image'
export type GoogleImageResolution = '1K' | '2K' | '4K'

export type GoogleEditErrorKind = 'config' | 'api' | 'timeout' | 'no_output'

export class GoogleEditError extends Error {
  readonly kind: GoogleEditErrorKind
  constructor(kind: GoogleEditErrorKind, message: string) {
    super(message)
    this.name = 'GoogleEditError'
    this.kind = kind
  }
}

const TIMEOUT_MS: Record<GoogleImageModel, number> = {
  'gemini-3.1-flash-image': 120_000,
  'gemini-3-pro-image': 150_000,
}

/** ID canônico → ID exposto na API. Default = GA sem -preview: o GA já resolve
 *  nesta chave (confirmado 2026-07-24) e os aliases -preview são efêmeros — já
 *  foram aposentados no Vertex (lib/ai/image-provider). Override por env se o
 *  id mudar. */
const API_MODEL_NAME: Record<GoogleImageModel, string> = {
  'gemini-3.1-flash-image':
    process.env.GEMINI_FLASH_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image',
  'gemini-3-pro-image':
    process.env.GEMINI_PRO_IMAGE_MODEL?.trim() || 'gemini-3-pro-image',
}

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  // .trim() remove espaço/newline/BOM — a chave suja quebra TODA chamada com
  // erro de ByteString no header HTTP.
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new GoogleEditError('config', 'GEMINI_API_KEY não configurada.')
  }
  _client = new GoogleGenAI({ apiKey })
  return _client
}

// Tokenização dos INPUTS (Gemini 3): 'high' por default — o modelo não
// preserva o detalhe que ele nem "viu" (ver lib/ai/gemini-knobs).
const PART_MEDIA_LEVEL: Record<InputMediaResolution, PartMediaResolutionLevel> = {
  low:        PartMediaResolutionLevel.MEDIA_RESOLUTION_LOW,
  medium:     PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
  high:       PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  ultra_high: PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
}

async function fetchImagePart(url: string, mediaLevel?: PartMediaResolutionLevel): Promise<Part> {
  let buffer: Buffer
  let contentType: string
  try {
    ({ buffer, contentType } = await fetchStorageBytes(url))
  } catch (e) {
    throw new GoogleEditError('api', `falha ao buscar imagem: ${(e as Error).message}`)
  }
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

// Sticky por instância: liga DEPOIS que um retry compat deu certo — as
// próximas edições pulam os knobs direto (sem pagar o 400 a cada request).
// Reset natural a cada cold start.
let googleKnobsRejected = false

export interface GoogleEditImageInput {
  imageUrl: string
  maskUrl?: string | null
  references?: { url: string }[]
  prompt: string
  model: GoogleImageModel
  resolution?: GoogleImageResolution
}

export interface GoogleEditImageOutput {
  /** Resultado como data: URL (o pipeline busca o buffer e recompõe). */
  imageRef: string
  provider: 'google'
  model: GoogleImageModel
  apiModel: string
  requestId: string | null
  durationMs: number
  /** Tokens REAIS da resposta (ground-truth de custo). Entrada (texto+imagens),
   *  saída (imagem gerada) e total. */
  promptTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

/** Edita a imagem via Gemini Image. Lança GoogleEditError em qualquer falha. */
export async function editImageWithGoogle(input: GoogleEditImageInput): Promise<GoogleEditImageOutput> {
  const startedAt = Date.now()

  // Knobs Gemini 3 de fidelidade (lib/ai/gemini-knobs): tokenização 'high'
  // dos inputs + thinking do NB2 (o Pro pensa sempre — sem knob).
  const mediaRes = googleKnobsRejected ? null : inputMediaResolutionDefault()
  const partLevel = mediaRes ? PART_MEDIA_LEVEL[mediaRes] : undefined
  const thinking = !googleKnobsRejected && input.model === 'gemini-3.1-flash-image' ? nb2ThinkingLevel() : null

  // Ordem das imagens = contrato do prompt: principal → máscara? → referências.
  const urls: string[] = [input.imageUrl]
  if (input.maskUrl) urls.push(input.maskUrl)
  for (const ref of input.references ?? []) urls.push(ref.url)
  const imageParts = await Promise.all(urls.map(u => fetchImagePart(u, partLevel)))

  const timeoutMs = TIMEOUT_MS[input.model]
  const apiModel = API_MODEL_NAME[input.model]
  const resolution = input.resolution ?? '1K'

  const baseConfig: GenerateContentConfig = {
    responseModalities: [Modality.IMAGE, Modality.TEXT],
    imageConfig: { imageSize: resolution },
    // Edição é determinística — temperatura baixa reduz "criatividade" fora
    // do pedido (preservar o projeto acima de imagem bonita).
    temperature: 0.2,
  }
  const config: GenerateContentConfig = {
    ...baseConfig,
    ...(thinking
      ? { thinkingConfig: { thinkingLevel: thinking === 'minimal' ? ThinkingLevel.MINIMAL : ThinkingLevel.HIGH } }
      : {}),
  }

  const runGenerate = (reqContents: Part[], reqConfig: GenerateContentConfig) =>
    client().models.generateContent({ model: apiModel, contents: reqContents, config: reqConfig })

  const attemptOnce = async () => {
    try {
      return await runGenerate([createPartFromText(input.prompt), ...imageParts], config)
    } catch (err) {
      // Retry compat: knob Gemini 3 rejeitado (400/INVALID_ARGUMENT) não pode
      // derrubar a edição — tenta 1x sem os knobs novos. Outros erros sobem.
      if ((partLevel || thinking) && isInvalidArgumentError(err)) {
        console.warn(
          `[editImage] knob Gemini 3 rejeitado (${((err as Error).message ?? String(err)).slice(0, 160)}) — retry compat sem mediaResolution/thinking`,
        )
        const result = await runGenerate(
          [createPartFromText(input.prompt), ...imageParts.map(stripPartMediaResolution)],
          baseConfig,
        )
        googleKnobsRejected = true
        return result
      }
      throw err
    }
  }

  const response = await Promise.race([
    attemptOnce(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new GoogleEditError('timeout', `${input.model} excedeu ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ])

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find(p => p.inlineData?.data)
  const inline = imagePart?.inlineData
  if (!inline?.data) {
    throw new GoogleEditError('no_output', `${input.model} não devolveu imagem.`)
  }
  const mime = inline.mimeType && inline.mimeType.startsWith('image/') ? inline.mimeType : 'image/png'
  const usage = response.usageMetadata

  return {
    imageRef: `data:${mime};base64,${inline.data}`,
    provider: 'google',
    model: input.model,
    apiModel,
    requestId: response.responseId ?? null,
    durationMs: Date.now() - startedAt,
    promptTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
  }
}
