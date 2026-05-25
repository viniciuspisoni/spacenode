// Facade dos adapters. A API/UI consome só este módulo — quem cuida
// de saber qual adapter usar para qual modelo é aqui.

import { requireVideoModel } from '../models'
import { falAdapter }         from './falAdapter'
import { googleFlowAdapter }  from './googleFlowAdapter'
import { omniAdapter }        from './omniAdapter'
import type { VideoAdapter }  from './types'

export { falAdapter, googleFlowAdapter, omniAdapter }
export type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export function getAdapterForModel(modelId: string): VideoAdapter {
  const model = requireVideoModel(modelId)
  switch (model.provider) {
    case 'fal':    return falAdapter
    case 'google': return googleFlowAdapter
    case 'omni':   return omniAdapter
    default: {
      const _exhaustive: never = model.provider
      throw new Error(`Provider sem adapter: ${_exhaustive}`)
    }
  }
}
