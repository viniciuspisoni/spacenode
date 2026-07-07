// Interface comum dos providers de vídeo. Cada adapter aceita o mesmo
// VideoGenerationRequest e devolve VideoGenerationResult — a UI não
// precisa saber qual provider está rodando.

import type { VideoProviderId } from '../models'

export interface VideoGenerationRequest {
  modelId:         string
  imageUrl:        string                // URL pública (fal.storage, supabase storage, etc.)
  endImageUrl?:    string                // opcional — frame final
  prompt:          string
  negativePrompt?: string
  duration:        string                // segundos como string ('5', '8')
  aspectRatio?:    string                // 'auto', '16:9', '9:16', '1:1'
  resolution?:     string                // '1080p'
  generateAudio?:  boolean               // default false
  userId?:         string                // p/ adapters que re-hospedam output no Storage
}

export interface VideoGenerationResult {
  outputUrl:    string
  thumbnailUrl?: string
  provider?:   string                    // quem gerou de fato ('fal' | 'vertex') — log/telemetria
  metadata?:   Record<string, unknown>   // payload bruto do provider, para debug
  requestId?:  string | null             // id do request/operation — rastreabilidade
}

export interface VideoAdapter {
  id:           VideoProviderId
  isAvailable: () => boolean
  generate:    (req: VideoGenerationRequest) => Promise<VideoGenerationResult>
}
