// lib/edit-v2/providers/gemini-image.ts
//
// Provider Gemini Image via API DIRETA do Google (@google/genai + GEMINI_API_KEY)
// — sem FAL. Modelos:
//   gemini-3.1-flash-image  — Econômica (multi-imagem: até 14 referências)
//   gemini-3-pro-image      — Alta precisão
//
// Os modelos Gemini NÃO aceitam máscara em pixels (doc oficial): a seleção vai
// como "mapa" (2ª imagem) + contrato textual de papéis (prompts.ts), e a
// preservação fora da seleção é GARANTIDA pelo recompose server-side do
// pipeline — exatamente o desenho validado no v1.
//
// Ordem das imagens (mesmo contrato do imageRolesContract):
//   [principal] → [máscara?] → [referências...]
//
// Custo: ~16% mais barato que os mesmos modelos via FAL (1K/2K) e elimina o
// intermediário. Gate: GEMINI_EDIT_ENABLED=1.

import { GoogleGenAI, Modality, createPartFromBase64, createPartFromText, type Part } from '@google/genai'
import { MODEL_COST_USD } from '../pricing'
import {
  EditV2ProviderError,
  type EditModelIdV2,
  type ProviderEditInputV2,
  type ProviderEditOutputV2,
} from '../types'

export type GeminiImageModel = Extract<EditModelIdV2, 'gemini-3.1-flash-image' | 'gemini-3-pro-image'>

const TIMEOUT_MS: Record<GeminiImageModel, number> = {
  'gemini-3.1-flash-image': 120_000,
  'gemini-3-pro-image': 150_000,
}

/** ID canônico (telemetria/pricing) → ID exposto na API hoje. A validação de
 *  ambiente (2026-06-12, listagem oficial de modelos da chave do projeto)
 *  mostrou apenas as variantes -preview; o alias sem sufixo pode não resolver.
 *  Override por env quando o GA chegar — sem deploy de código. */
const API_MODEL_NAME: Record<GeminiImageModel, string> = {
  'gemini-3.1-flash-image':
    process.env.GEMINI_FLASH_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image':
    process.env.GEMINI_PRO_IMAGE_MODEL?.trim() || 'gemini-3-pro-image-preview',
}

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  // .trim() remove espaço/newline/BOM — mesma lição do lib/gemini.ts (a chave
  // suja quebrava TODA chamada com erro de ByteString no header).
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new EditV2ProviderError('gemini-image', 'config', 'GEMINI_API_KEY não configurada.')
  }
  _client = new GoogleGenAI({ apiKey })
  return _client
}

async function fetchImagePart(url: string): Promise<Part> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new EditV2ProviderError('gemini-image', 'api', `image fetch ${res.status}`)
  }
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  return createPartFromBase64(buf.toString('base64'), mime)
}

export interface GeminiImageEditOpts extends ProviderEditInputV2 {
  model: GeminiImageModel
}

export async function geminiImageEditV2(input: GeminiImageEditOpts): Promise<ProviderEditOutputV2> {
  const startedAt = Date.now()

  // Ordem das imagens = contrato do prompt: principal → máscara? → referências.
  const urls: string[] = [input.imageUrl]
  if (input.maskUrl) urls.push(input.maskUrl)
  for (const ref of input.references ?? []) urls.push(ref.url)
  const imageParts = await Promise.all(urls.map(fetchImagePart))

  const timeoutMs = TIMEOUT_MS[input.model]
  const resolution = input.resolution ?? '1K'

  const response = await Promise.race([
    client().models.generateContent({
      model: API_MODEL_NAME[input.model],
      contents: [createPartFromText(input.prompt), ...imageParts],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: { imageSize: resolution },
        // Edição é tarefa determinística — temperatura baixa reduz "criatividade"
        // fora do pedido (norte: preservar o projeto acima de imagem bonita).
        temperature: 0.2,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new EditV2ProviderError('gemini-image', 'timeout', `${input.model} > ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ])

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find(p => p.inlineData?.data)
  const inline = imagePart?.inlineData
  if (!inline?.data) {
    throw new EditV2ProviderError('gemini-image', 'no_output', `${input.model} não devolveu imagem.`)
  }

  const mime = inline.mimeType && inline.mimeType.startsWith('image/') ? inline.mimeType : 'image/png'
  return {
    imageDataUrl: `data:${mime};base64,${inline.data}`,
    provider: 'gemini-image',
    model: input.model,
    durationMs: Date.now() - startedAt,
    costUsdEstimated: MODEL_COST_USD[input.model][resolution],
    requestId: response.responseId ?? null,
  }
}
