// Catálogo central de modelos de vídeo. Fonte única de verdade — UI,
// route, billing e histórico devem ler daqui. Quando precisar adicionar
// um modelo novo (ou trocar custo, duração suportada, descrição), edita
// só este arquivo.
//
// Convenção de IDs:
//   - Modelos via Fal usam o endpoint Fal como id ('fal-ai/...').
//   - Modelos via outros providers usam id próprio prefixado ('google/flow', 'gemini/omni').
//
// IMPORTANTE: este módulo é importado tanto no server quanto no client.
// Não use variáveis de ambiente sem prefixo NEXT_PUBLIC_ aqui — elas
// não existem no client e causam mismatch de hidratação. A presença
// real da API key é validada nos adapters (server-only).

import { VIDEO_FLAGS } from './flags'

export type VideoProviderId = 'fal' | 'google' | 'omni'

export type VideoInputKind =
  | 'image'        // imagem inicial obrigatória
  | 'imageEnd'     // suporta frame final
  | 'text'         // suporta prompt textual
  | 'video'        // suporta vídeo como referência
  | 'audio'        // suporta áudio

export type VideoRecommendation =
  | 'interior'
  | 'exterior'
  | 'facade'
  | 'commercial'
  | 'social'
  | 'highFidelity'
  | 'motion'

export interface VideoModel {
  id:                     string
  provider:               VideoProviderId
  label:                  string                       // nome curto exibido no card
  tag:                    string                       // tag técnica ("Veo 3.1", "Seedance 2.0")
  description:            string                       // copy de uma frase para o card
  strengths:              string[]                     // 2-4 pontos fortes
  weaknesses:             string[]                     // 1-3 limitações honestas
  supportedInputs:        VideoInputKind[]
  supportedDurations:     string[]                     // ex: ['4', '6', '8'] em segundos
  supportedAspectRatios:  string[]                     // ex: ['auto', '16:9', '9:16', '1:1']
  supportedResolutions:   string[]                     // ex: ['1080p']
  costInNodes:            Record<string, number>       // duration → nodes
  estimatedGenerationMs:  number                       // estimativa para UI de loading
  recommendedFor:         VideoRecommendation[]
  safetyNotes?:           string                       // alerta interno (ex: "não aceita negative_prompt")
  isAvailable:            boolean                      // computado: env + flag
  isBeta:                 boolean
  badge?:                 { label: string; tone: 'green' | 'blue' | 'muted' }
}

// ── Modelos via Fal ──────────────────────────────────────────────────────────

const KLING_25_TURBO_PRO: VideoModel = {
  id:                    'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  provider:              'fal',
  label:                 'Rápido',
  tag:                   'Kling 2.5 Turbo Pro',
  description:           'Geração veloz para iteração e revisão interna de movimento.',
  strengths:             ['Geração rápida (~60-90s)', 'Movimento natural', 'Bom custo-benefício'],
  weaknesses:            ['Detalhamento de materiais inferior aos modelos premium'],
  supportedInputs:       ['image', 'text'],
  supportedDurations:    ['5', '10'],
  supportedAspectRatios: ['auto'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '5': 30, '10': 55 },
  estimatedGenerationMs: 90_000,
  recommendedFor:        ['interior', 'social', 'motion'],
  isAvailable:           true,
  isBeta:                false,
}

const VEO_31: VideoModel = {
  id:                    'fal-ai/veo3.1/image-to-video',
  provider:              'fal',
  label:                 'Cinemático',
  tag:                   'Veo 3.1',
  description:           'Qualidade cinematográfica de ponta com controle de câmera premium.',
  strengths:             ['Movimento de câmera elegante', 'Iluminação coerente', 'Alto fotorrealismo'],
  weaknesses:            ['Custo elevado', 'Tempo de geração 2-4 min'],
  supportedInputs:       ['image', 'text'],
  supportedDurations:    ['4', '6', '8'],
  supportedAspectRatios: ['auto', '16:9', '9:16'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '4': 70, '6': 100, '8': 135 },
  estimatedGenerationMs: 180_000,
  recommendedFor:        ['interior', 'exterior', 'facade', 'commercial', 'highFidelity'],
  isAvailable:           true,
  isBeta:                false,
  badge:                 { label: 'RECOMENDADO', tone: 'green' },
}

const SEEDANCE_20: VideoModel = {
  id:                    'bytedance/seedance-2.0/image-to-video',
  provider:              'fal',
  label:                 'Arquitetônico',
  tag:                   'Seedance 2.0',
  description:           'Máxima fidelidade de geometria e materiais — ideal para fachadas e interiores.',
  strengths:             ['Preserva geometria com rigor', 'Materiais estáveis', 'Movimento contido'],
  weaknesses:            ['Não aceita negative_prompt', 'Custo mais alto que Kling'],
  supportedInputs:       ['image', 'text'],
  supportedDurations:    ['5', '10'],
  supportedAspectRatios: ['auto'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '5': 101, '10': 202 },
  estimatedGenerationMs: 150_000,
  recommendedFor:        ['facade', 'exterior', 'highFidelity'],
  safetyNotes:           'Seedance 2.0 não expõe negative_prompt nem camera_fixed — tudo via prompt.',
  isAvailable:           true,
  isBeta:                false,
  badge:                 { label: 'FIDELIDADE', tone: 'blue' },
}

// ── Placeholders futuros ─────────────────────────────────────────────────────
// Mantidos como não-disponíveis até a env existir E a flag estar ligada.
// O adapter correspondente lança erro se chamado sem credencial.

const GOOGLE_FLOW_PLACEHOLDER: VideoModel = {
  id:                    'google/flow/v1',
  provider:              'google',
  label:                 'Flow',
  tag:                   'Google Flow',
  description:           'Criação cinematográfica por cenas, clips e iteração — integração futura.',
  strengths:             ['Direção por cenas múltiplas', 'Storyboard interativo', 'Controle fino de câmera'],
  weaknesses:            ['Em integração — sem disponibilidade no momento'],
  supportedInputs:       ['image', 'imageEnd', 'text'],
  supportedDurations:    ['5', '10'],
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '5': 120, '10': 220 },
  estimatedGenerationMs: 180_000,
  recommendedFor:        ['commercial', 'highFidelity'],
  isAvailable:           VIDEO_FLAGS.enableGoogleFlow,
  isBeta:                true,
  badge:                 { label: 'EM BREVE', tone: 'muted' },
}

const GEMINI_OMNI_PLACEHOLDER: VideoModel = {
  id:                    'gemini/omni/v1',
  provider:              'omni',
  label:                 'Omni',
  tag:                   'Gemini Omni',
  description:           'Edição conversacional multimodal (texto + imagem + vídeo + áudio).',
  strengths:             ['Edição conversacional', 'Multimodal nativo', 'Iteração contínua'],
  weaknesses:            ['Em integração — sem disponibilidade no momento'],
  supportedInputs:       ['image', 'imageEnd', 'text', 'video', 'audio'],
  supportedDurations:    ['5', '8', '10'],
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '5': 140, '8': 220, '10': 280 },
  estimatedGenerationMs: 200_000,
  recommendedFor:        ['commercial', 'social'],
  isAvailable:           VIDEO_FLAGS.enableGeminiOmni,
  isBeta:                true,
  badge:                 { label: 'EM BREVE', tone: 'muted' },
}

// ── Registro ─────────────────────────────────────────────────────────────────

export const VIDEO_MODELS: Record<string, VideoModel> = {
  [KLING_25_TURBO_PRO.id]:      KLING_25_TURBO_PRO,
  [VEO_31.id]:                  VEO_31,
  [SEEDANCE_20.id]:             SEEDANCE_20,
  [GOOGLE_FLOW_PLACEHOLDER.id]: GOOGLE_FLOW_PLACEHOLDER,
  [GEMINI_OMNI_PLACEHOLDER.id]: GEMINI_OMNI_PLACEHOLDER,
}

export const DEFAULT_VIDEO_MODEL_ID = VEO_31.id

// Ordem de exibição. Disponíveis primeiro, placeholders depois.
export const VIDEO_MODEL_ORDER: string[] = [
  VEO_31.id,
  SEEDANCE_20.id,
  KLING_25_TURBO_PRO.id,
  GOOGLE_FLOW_PLACEHOLDER.id,
  GEMINI_OMNI_PLACEHOLDER.id,
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getVideoModel(id: string): VideoModel | undefined {
  return VIDEO_MODELS[id]
}

export function requireVideoModel(id: string): VideoModel {
  const m = VIDEO_MODELS[id]
  if (!m) throw new Error(`Modelo de vídeo desconhecido: ${id}`)
  return m
}

export function listAvailableVideoModels(): VideoModel[] {
  return VIDEO_MODEL_ORDER
    .map(id => VIDEO_MODELS[id])
    .filter((m): m is VideoModel => !!m && m.isAvailable)
}

export function listAllVideoModels(): VideoModel[] {
  return VIDEO_MODEL_ORDER
    .map(id => VIDEO_MODELS[id])
    .filter((m): m is VideoModel => !!m)
}

export function getNodeCost(modelId: string, duration: string): number {
  const m = requireVideoModel(modelId)
  const cost = m.costInNodes[duration]
  if (cost === undefined) {
    throw new Error(`Duração ${duration}s não suportada por ${m.label}`)
  }
  return cost
}

// Sugestão de modelo dado o arquétipo da cena detectada.
// Heurística simples — pode evoluir com ML posteriormente.
export function recommendModelFor(archetype: VideoRecommendation): VideoModel {
  const available = listAvailableVideoModels()
  const match = available.find(m => m.recommendedFor.includes(archetype))
  return match ?? available[0] ?? requireVideoModel(DEFAULT_VIDEO_MODEL_ID)
}
