// Placeholder para integração futura com Gemini Omni (input multimodal:
// texto + imagem + vídeo + áudio + edição conversacional). Não faz call
// real — só lança erro descritivo se alguém tentar usar sem a flag e a
// env configuradas.
//
// Quando for hora de implementar:
//   1. Confirmar o endpoint/SDK oficial do Omni (não inventar).
//   2. Ligar NEXT_PUBLIC_ENABLE_GEMINI_OMNI=1 e GEMINI_API_KEY=...
//   3. Implementar generate() — provavelmente vai querer estender o
//      VideoGenerationRequest para aceitar áudio e vídeo de entrada.

import { VIDEO_FLAGS } from '../flags'
import type { VideoAdapter, VideoGenerationRequest, VideoGenerationResult } from './types'

export const omniAdapter: VideoAdapter = {
  id:          'omni',
  isAvailable: () =>
    VIDEO_FLAGS.enableGeminiOmni && !!process.env.GEMINI_API_KEY,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    if (!VIDEO_FLAGS.enableGeminiOmni) {
      throw new Error(
        'Gemini Omni não está habilitado neste ambiente ' +
        '(NEXT_PUBLIC_ENABLE_GEMINI_OMNI=0).'
      )
    }
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        'Gemini Omni habilitado mas GEMINI_API_KEY não configurada.'
      )
    }
    throw new Error(
      'Gemini Omni ainda não implementado. ' +
      'Etapa futura: integração multimodal com @google/genai.'
    )
  },
}
