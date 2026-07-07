// Facade dos adapters. A API/UI consome só este módulo — quem cuida
// de saber qual adapter usar para qual modelo é aqui.
//
// Veo "Cinemático" tem DOIS caminhos possíveis para o mesmo produto:
//   - fal.ai (default de produção)
//   - Vertex AI na conta GCP do dono (VERTEX_VEO_ENABLED=1 + credenciais)
// Quando o Vertex está ligado e configurado, ele assume o Veo; se o submit
// falhar, o próprio adapter cai de volta pro fal. Catálogo/preço não mudam.

import { requireVideoModel } from '../models'
import { falAdapter }         from './falAdapter'
import { googleFlowAdapter }  from './googleFlowAdapter'
import { omniAdapter }        from './omniAdapter'
import { vertexVeoAdapter }   from './vertexVeoAdapter'
import type { VideoAdapter }  from './types'

export { falAdapter, googleFlowAdapter, omniAdapter, vertexVeoAdapter }
export type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

const VEO_MODEL_ID = 'fal-ai/veo3.1/image-to-video'

export function getAdapterForModel(modelId: string): VideoAdapter {
  const model = requireVideoModel(modelId)

  // Override por engine: Veo via Vertex quando o gate estiver ligado.
  if (model.id === VEO_MODEL_ID && vertexVeoAdapter.isAvailable()) {
    return vertexVeoAdapter
  }

  switch (model.provider) {
    case 'fal':    return falAdapter
    case 'google': return googleFlowAdapter
    case 'omni':   return omniAdapter
    case 'vertex': return vertexVeoAdapter
    default: {
      const _exhaustive: never = model.provider
      throw new Error(`Provider sem adapter: ${_exhaustive}`)
    }
  }
}
