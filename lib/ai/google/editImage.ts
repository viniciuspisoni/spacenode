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

import { GoogleGenAI, Modality, createPartFromBase64, createPartFromText, type Part } from '@google/genai'

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

/** ID canônico → ID exposto na API. A chave do projeto só resolve as variantes
 *  -preview hoje (validação 2026-06-12); override por env quando o GA chegar. */
const API_MODEL_NAME: Record<GoogleImageModel, string> = {
  'gemini-3.1-flash-image':
    process.env.GEMINI_FLASH_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image':
    process.env.GEMINI_PRO_IMAGE_MODEL?.trim() || 'gemini-3-pro-image-preview',
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

async function fetchImagePart(url: string): Promise<Part> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new GoogleEditError('api', `falha ao buscar imagem (${res.status})`)
  }
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return createPartFromBase64(buf.toString('base64'), mime)
}

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
}

/** Edita a imagem via Gemini Image. Lança GoogleEditError em qualquer falha. */
export async function editImageWithGoogle(input: GoogleEditImageInput): Promise<GoogleEditImageOutput> {
  const startedAt = Date.now()

  // Ordem das imagens = contrato do prompt: principal → máscara? → referências.
  const urls: string[] = [input.imageUrl]
  if (input.maskUrl) urls.push(input.maskUrl)
  for (const ref of input.references ?? []) urls.push(ref.url)
  const imageParts = await Promise.all(urls.map(fetchImagePart))

  const timeoutMs = TIMEOUT_MS[input.model]
  const apiModel = API_MODEL_NAME[input.model]
  const resolution = input.resolution ?? '1K'

  const response = await Promise.race([
    client().models.generateContent({
      model: apiModel,
      contents: [createPartFromText(input.prompt), ...imageParts],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: { imageSize: resolution },
        // Edição é determinística — temperatura baixa reduz "criatividade" fora
        // do pedido (preservar o projeto acima de imagem bonita).
        temperature: 0.2,
      },
    }),
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

  return {
    imageRef: `data:${mime};base64,${inline.data}`,
    provider: 'google',
    model: input.model,
    apiModel,
    requestId: response.responseId ?? null,
    durationMs: Date.now() - startedAt,
  }
}
