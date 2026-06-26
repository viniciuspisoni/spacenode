// lib/edit-v2/providers/vertex-imagen.ts
//
// Provider Vertex AI Imagen — inpaint com máscara REAL em pixels
// (MASK_MODE_USER_PROVIDED). O motor mais preciso e mais barato (~US$0,02/img,
// confirmar na fatura) para Remover / Corrigir / Trocar material e Inserir sem
// referência. Saída do capability é ~1K — o pipeline edita a REGIÃO (crop) e
// recompõe no original em resolução cheia.
//
// Envs (local E Vercel — ver memória project_vercel_env_parity):
//   GOOGLE_VERTEX_PROJECT           — id do projeto GCP
//   GOOGLE_VERTEX_LOCATION          — região (default us-central1)
//   Credencial (UMA das duas formas):
//     GOOGLE_VERTEX_CREDENTIALS_JSON — JSON inteiro da service account numa env
//                                      (única opção viável na Vercel)
//     GOOGLE_APPLICATION_CREDENTIALS — caminho do arquivo da SA (padrão ADC do
//                                      Google; o SDK lê sozinho — bom p/ local)
// Gate: VERTEX_IMAGEN_ENABLED=1 (lib/edit-v2/flags.ts).
//
// Adaptado do engine v1 (lib/spaces/engines/vertex-imagen-edit.ts) com o
// contrato v2: telemetria de duração/custo no retorno e erros tipados.

import {
  EditMode,
  GoogleGenAI,
  MaskReferenceImage,
  MaskReferenceMode,
  RawReferenceImage,
} from '@google/genai'
import { MODEL_COST_USD } from '../pricing'
import {
  EditV2ProviderError,
  type EditIntentV2,
  type ProviderEditInputV2,
  type ProviderEditOutputV2,
} from '../types'

export const VERTEX_IMAGEN_MODEL_V2 = 'imagen-3.0-capability-001' as const
const TIMEOUT_MS = 120_000

let _client: GoogleGenAI | null = null
function client(): GoogleGenAI {
  if (_client) return _client
  const project = process.env.GOOGLE_VERTEX_PROJECT?.trim()
  const location = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
  const credsJson = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  if (!project || (!credsJson && !adcPath)) {
    throw new EditV2ProviderError(
      'vertex-imagen',
      'config',
      'Com VERTEX_IMAGEN_ENABLED=1 são obrigatórias GOOGLE_VERTEX_PROJECT e uma credencial: ' +
      'GOOGLE_VERTEX_CREDENTIALS_JSON (inline) ou GOOGLE_APPLICATION_CREDENTIALS (caminho ADC).',
    )
  }
  _client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    // Com JSON inline, injeta explicitamente; com ADC, omitir googleAuthOptions
    // faz o google-auth-library ler GOOGLE_APPLICATION_CREDENTIALS sozinho.
    ...(credsJson ? { googleAuthOptions: { credentials: JSON.parse(credsJson) } } : {}),
  })
  return _client
}

async function fetchBase64(url: string): Promise<{ bytes: string; mime: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new EditV2ProviderError('vertex-imagen', 'api', `image fetch ${res.status}`)
  }
  const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
  const mime = ct && ct.startsWith('image/') ? ct : 'image/png'
  const buf = Buffer.from(await res.arrayBuffer())
  return { bytes: buf.toString('base64'), mime }
}

/** Remoção/correção apagam conteúdo; os demais inserem/substituem. */
function editModeFor(intent: EditIntentV2): EditMode {
  return intent === 'remove_element'
    ? EditMode.EDIT_MODE_INPAINT_REMOVAL
    : EditMode.EDIT_MODE_INPAINT_INSERTION
}

export async function vertexImagenEditV2(
  input: ProviderEditInputV2,
): Promise<ProviderEditOutputV2> {
  if (!input.maskUrl) {
    throw new EditV2ProviderError('vertex-imagen', 'config', 'Vertex Imagen exige máscara.')
  }

  const startedAt = Date.now()
  const [img, mask] = await Promise.all([
    fetchBase64(input.imageUrl),
    fetchBase64(input.maskUrl),
  ])

  // O SDK chama .toReferenceImageAPI() em cada elemento — instâncias das
  // classes SDK, não plain objects.
  const rawRef = new RawReferenceImage()
  rawRef.referenceId = 1
  rawRef.referenceImage = { imageBytes: img.bytes, mimeType: img.mime }

  const maskRef = new MaskReferenceImage()
  maskRef.referenceId = 2
  maskRef.referenceImage = { imageBytes: mask.bytes, mimeType: mask.mime }
  // Dilatação leve — cobre borda do objeto/sombra (recomendação oficial: 0.01).
  maskRef.config = { maskMode: MaskReferenceMode.MASK_MODE_USER_PROVIDED, maskDilation: 0.01 }

  const result = await Promise.race([
    client().models.editImage({
      model: VERTEX_IMAGEN_MODEL_V2,
      prompt: input.prompt,
      referenceImages: [rawRef, maskRef],
      config: {
        editMode: editModeFor(input.intent),
        numberOfImages: 1,
        includeRaiReason: true,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new EditV2ProviderError('vertex-imagen', 'timeout', `editImage > ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      ),
    ),
  ])

  const image = result.generatedImages?.[0]?.image
  if (!image?.imageBytes) {
    throw new EditV2ProviderError('vertex-imagen', 'no_output', 'editImage não devolveu imagem.')
  }

  const mime = image.mimeType && image.mimeType.startsWith('image/') ? image.mimeType : 'image/png'
  return {
    imageDataUrl: `data:${mime};base64,${image.imageBytes}`,
    provider: 'vertex-imagen',
    model: VERTEX_IMAGEN_MODEL_V2,
    durationMs: Date.now() - startedAt,
    costUsdEstimated: MODEL_COST_USD[VERTEX_IMAGEN_MODEL_V2]['1K'],
    requestId: null, // editImage não expõe request id no SDK atual
  }
}
