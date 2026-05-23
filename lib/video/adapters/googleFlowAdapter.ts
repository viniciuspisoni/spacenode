// Placeholder para integração futura com Google Flow / Veo via API direta
// (não passando pela Fal). Não faz call real — só lança erro descritivo se
// alguém tentar usar sem a flag e a env configuradas.
//
// Quando for hora de implementar:
//   1. Adicionar GOOGLE_FLOW_API_KEY ao .env
//   2. Ligar NEXT_PUBLIC_ENABLE_GOOGLE_FLOW=1
//   3. Implementar generate() chamando @google/genai (já em deps).
//   4. Confirmar o nome do endpoint e o schema de input com a doc oficial
//      *antes* de codar — não inventar endpoints.

import { VIDEO_FLAGS } from '../flags'
import type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export const googleFlowAdapter: VideoAdapter = {
  id:          'google',
  isAvailable: () =>
    VIDEO_FLAGS.enableGoogleFlow && !!process.env.GOOGLE_FLOW_API_KEY,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    if (!VIDEO_FLAGS.enableGoogleFlow) {
      throw new Error(
        'Google Flow não está habilitado neste ambiente ' +
        '(NEXT_PUBLIC_ENABLE_GOOGLE_FLOW=0).'
      )
    }
    if (!process.env.GOOGLE_FLOW_API_KEY) {
      throw new Error(
        'Google Flow habilitado mas GOOGLE_FLOW_API_KEY não configurada.'
      )
    }
    throw new Error(
      'Google Flow ainda não implementado. ' +
      'Etapa futura: chamar a API oficial via @google/genai.'
    )
  },
}
