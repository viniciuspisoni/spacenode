// vertex/imagen-edit — Google Vertex AI Imagen 3 capability (masked editing).
//
// Inpaint com máscara REAL em pixels (MASK_MODE_USER_PROVIDED): o endpoint mais
// preciso para remoção/inserção/troca localizada — e o mais barato
// (~US$0.020/img). Selecionado pelo editRouter Google-first quando
// VERTEX_IMAGEN_ENABLED=1 (lib/spaces/edit-router.ts, vertexImagenEnabled()).
//
// Envs necessárias (local E Vercel — ver [[project_vercel_env_parity]]):
//   GOOGLE_VERTEX_PROJECT           — id do projeto GCP
//   GOOGLE_VERTEX_LOCATION          — região (default us-central1)
//   GOOGLE_VERTEX_CREDENTIALS_JSON  — JSON da service account (papel
//                                     "Vertex AI User"), inteiro, numa env só
//
// Máscara: PNG P&B do RetocarCanvas (BRANCO = editar). editMode vem do
// intentHint ('removal' → EDIT_MODE_INPAINT_REMOVAL, senão INSERTION).
// O resultado volta como data URL (base64); o pipeline baixa via
// fetchImageBuffer (fetch suporta data:) e re-hospeda no Supabase.

import { GoogleGenAI } from '@google/genai'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'

export const VERTEX_IMAGEN_EDIT_ENDPOINT = 'vertex/imagen-edit'
export const VERTEX_IMAGEN_MODEL = 'imagen-3.0-capability-001'
const TIMEOUT_MS = 120_000

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
  const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
  if (!project || !credsJson) {
    throw new Error(
      '[vertex-imagen-edit] GOOGLE_VERTEX_PROJECT e GOOGLE_VERTEX_CREDENTIALS_JSON são ' +
      'obrigatórias com VERTEX_IMAGEN_ENABLED=1.',
    )
  }
  _client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    googleAuthOptions: { credentials: JSON.parse(credsJson) },
  })
  return _client
}

async function fetchBase64(url: string): Promise<{ bytes: string; mime: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[vertex-imagen-edit] image fetch ${res.status}`)
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/png'
  const buf = Buffer.from(await res.arrayBuffer())
  return { bytes: buf.toString('base64'), mime }
}

// Tipagem estrutural defensiva: a superfície editImage do @google/genai variou
// entre versões; isolar aqui mantém o build estável e falha ALTO em runtime se
// o SDK instalado não expuser o método (só acontece com a flag ligada).
interface EditImageModels {
  editImage?: (req: Record<string, unknown>) => Promise<{
    generatedImages?: Array<{ image?: { imageBytes?: string; mimeType?: string } }>
  }>
}

export const callVertexImagenEdit: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  const models = client().models as unknown as EditImageModels
  if (typeof models.editImage !== 'function') {
    throw new Error(
      '[vertex-imagen-edit] o @google/genai instalado não expõe models.editImage — ' +
      'atualize o pacote antes de ligar VERTEX_IMAGEN_ENABLED.',
    )
  }

  const [img, mask] = await Promise.all([
    fetchBase64(input.imageUrl),
    fetchBase64(input.maskUrl),
  ])

  const editMode = input.intentHint === 'removal'
    ? 'EDIT_MODE_INPAINT_REMOVAL'
    : 'EDIT_MODE_INPAINT_INSERTION'

  const request: Record<string, unknown> = {
    model:  VERTEX_IMAGEN_MODEL,
    prompt: input.prompt,
    referenceImages: [
      {
        referenceType: 'REFERENCE_TYPE_RAW',
        referenceId:   1,
        referenceImage: { imageBytes: img.bytes, mimeType: img.mime },
      },
      {
        referenceType: 'REFERENCE_TYPE_MASK',
        referenceId:   2,
        referenceImage: { imageBytes: mask.bytes, mimeType: mask.mime },
        maskImageConfig: {
          maskMode:     'MASK_MODE_USER_PROVIDED',
          // Dilatação leve (fração do lado) — cobre a borda do objeto/sombra.
          maskDilation: 0.01,
        },
      },
    ],
    config: {
      editMode,
      numberOfImages: 1,
      includeRaiReason: true,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    },
  }

  const result = await Promise.race([
    models.editImage(request),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new RetouchTimeoutError(VERTEX_IMAGEN_EDIT_ENDPOINT)), TIMEOUT_MS),
    ),
  ])

  const image = result.generatedImages?.[0]?.image
  if (!image?.imageBytes) throw new RetouchNoOutputError(VERTEX_IMAGEN_EDIT_ENDPOINT)

  const mime = image.mimeType && image.mimeType.startsWith('image/') ? image.mimeType : 'image/png'
  return {
    imageUrl: `data:${mime};base64,${image.imageBytes}`,
    endpoint: VERTEX_IMAGEN_EDIT_ENDPOINT,
  }
}
