// Facade dos adapters. A API/UI consome só este módulo — quem cuida
// de saber qual adapter usar para qual modelo é aqui.
//
// O preço do Animar V1 é auditado contra a tarifa da fal. A seleção automática
// do Vertex para o Veo completo fica suspensa até que seu custo seja medido e
// incluído no guarda de margem; ele permanece exportado para uso interno.

import { requireVideoModel } from '../models'
import { falAdapter }         from './falAdapter'
import { googleFlowAdapter }  from './googleFlowAdapter'
import { omniAdapter }        from './omniAdapter'
import { vertexVeoAdapter }   from './vertexVeoAdapter'
import type { VideoAdapter }  from './types'

export { falAdapter, googleFlowAdapter, omniAdapter, vertexVeoAdapter }
export type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export function getAdapterForModel(modelId: string): VideoAdapter {
  const model = requireVideoModel(modelId)

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
