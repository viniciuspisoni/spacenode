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
import type { VideoEngineId } from './engines'

// 'vertex' não tem modelo próprio no catálogo: é um provider alternativo do
// MESMO Veo "Cinemático" (conta GCP do dono), selecionado pelo facade dos
// adapters quando VERTEX_VEO_ENABLED=1. Catálogo, presets e preço não mudam.
export type VideoProviderId = 'fal' | 'google' | 'omni' | 'vertex' | 'byteplus' | 'luma'

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
  engineId?:              VideoEngineId
  variant?:               string
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
//
// Política de preço proposta em 2026-10-10: contribuição >80%, incluindo
// o Office anual legado. USD/BRL=6, reserva=20%, tentativas extras=25%,
// R$0,50/resultado e deduções de receita=10%. Valores arredondados em
// centenas de Nodes. Preços são por variante, resolução fixa e duração.
// Publicar o novo catálogo exige revisar também a disponibilidade real.
// Referências: fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video,
// fal.ai/models/fal-ai/kling-video/o3/pro/image-to-video,
// fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/image-to-video,
// ai.google.dev/gemini-api/docs/pricing e cloud.google.com/vertex-ai/generative-ai/pricing.
// Google Lite usa a tarifa conservadora Gemini; Vertex sem áudio pode
// custar menos. Nenhuma opção pode fazer fallback para outro modelo.

const KLING_25_TURBO_PRO: VideoModel = {
  id:                    'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  provider:              'fal',
  label:                 'Orbit',
  engineId:              'orbit',
  variant:               'Original',
  tag:                   'Kling 2.5 Turbo Pro',
  description:           'Geração veloz para iteração e revisão interna de movimento.',
  strengths:             ['Geração rápida (~60-90s)', 'Movimento natural', 'Bom custo-benefício'],
  weaknesses:            ['Detalhamento de materiais inferior aos modelos premium'],
  supportedInputs:       ['image', 'imageEnd', 'text'],
  supportedDurations:    ['5', '10'],
  supportedAspectRatios: ['auto'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '5': 300, '10': 600 },
  estimatedGenerationMs: 90_000,
  recommendedFor:        ['interior', 'social', 'motion'],
  isAvailable:           true,
  isBeta:                false,
}

const VEO_31: VideoModel = {
  id:                    'fal-ai/veo3.1/image-to-video',
  provider:              'fal',
  label:                 'Lyra Pro',
  engineId:              'lyra',
  variant:               'Pro',
  tag:                   'Veo 3.1',
  description:           'Qualidade cinematográfica de ponta com controle de câmera premium.',
  strengths:             ['Movimento de câmera elegante', 'Iluminação coerente', 'Alto fotorrealismo'],
  weaknesses:            ['Custo elevado', 'Tempo de geração 2-4 min'],
  supportedInputs:       ['image', 'text'],
  supportedDurations:    ['8'],
  supportedAspectRatios: ['auto', '16:9', '9:16'],
  supportedResolutions:  ['1080p'],
  costInNodes:           { '8': 1200 },
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
  // OCULTO (2026-06-01): a 1080p o fal.ai cobra US$ 0,682/s — 3,4× o Veo — o que
  // deixa a margem negativa em qualquer plano. Mantido no registro (histórico de
  // renders antigos resolve o label), mas fora do VIDEO_MODEL_ORDER e com
  // isAvailable=false (a rota /api/video também recusa). Reativar só com o tier
  // Fast/720p (US$ 0,2419/s) ou reprecificando como ultra-premium (~320 nodes/5s).
  isAvailable:           false,
  isBeta:                false,
  badge:                 { label: 'FIDELIDADE', tone: 'blue' },
}

// Preços propostos em 2026-10-10: contribuição >80% no Office anual,
// USD/BRL=6, 20% de reserva, 25% de tentativas extras, R$0,50/resultado e
// 10% de deduções de receita. Novas variantes exigem liberação explícita;
// isso não afirma equivalência visual entre gerações dos modelos.
const ORBIT_LITE: VideoModel = {
  ...KLING_25_TURBO_PRO,
  id: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video',
  label: 'Orbit Lite', engineId: 'orbit', variant: 'Lite',
  tag: 'Kling 2.5 Turbo Standard',
  description: 'A opção econômica da família Orbit.',
  supportedInputs: ['image', 'text'], supportedResolutions: ['720p'],
  costInNodes: { '5': 200, '10': 400 },
  isAvailable: VIDEO_FLAGS.enableNewVariants, isBeta: true,
}

const ORBIT_PRO: VideoModel = {
  ...KLING_25_TURBO_PRO,
  id: 'fal-ai/kling-video/o3/pro/image-to-video',
  label: 'Orbit Pro', engineId: 'orbit', variant: 'Pro', tag: 'Kling O3 Pro',
  description: 'A versão O3 da família Orbit, com frame final opcional.',
  strengths: ['Frame inicial e final', 'Vídeos de 5 ou 10 segundos'],
  weaknesses: ['Custo maior que Orbit e Orbit Lite'],
  costInNodes: { '5': 500, '10': 900 },
  isAvailable: VIDEO_FLAGS.enableNewVariants, isBeta: true,
}

const LYRA_LITE: VideoModel = {
  ...VEO_31,
  id: 'vertex/veo-3.1-lite-generate-001', provider: 'vertex',
  label: 'Lyra Lite', engineId: 'lyra', variant: 'Lite', tag: 'Veo 3.1 Lite',
  description: 'Clipes curtos em 720p com menor consumo de Nodes.',
  strengths: ['4, 6 ou 8 segundos', 'Frame inicial e final'],
  weaknesses: ['Variante em avaliação visual'],
  supportedInputs: ['image', 'imageEnd', 'text'],
  supportedDurations: ['4', '6', '8'], supportedResolutions: ['720p'],
  costInNodes: { '4': 200, '6': 300, '8': 400 },
  isAvailable: VIDEO_FLAGS.enableNewVariants, isBeta: true, badge: undefined,
}

const LYRA_FAST: VideoModel = {
  ...VEO_31,
  id: 'vertex/veo-3.1-fast-generate-001', provider: 'vertex',
  label: 'Lyra Fast', engineId: 'lyra', variant: 'Fast', tag: 'Veo 3.1 Fast',
  description: 'A variante Fast para vídeos de 8 segundos em 1080p.',
  strengths: ['1080p', 'Frame inicial e final'],
  weaknesses: ['Disponibilidade depende da integração Google'],
  supportedInputs: ['image', 'imageEnd', 'text'],
  costInNodes: { '8': 700 },
  isAvailable: VIDEO_FLAGS.enableNewVariants, isBeta: true, badge: undefined,
}

const NEBULA_LITE: VideoModel = {
  ...SEEDANCE_20,
  id: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
  label: 'Nebula Lite', engineId: 'nebula', variant: 'Lite', tag: 'Seedance 1.5 Pro',
  description: 'Vídeos em 720p sem áudio, com menor consumo de Nodes.',
  strengths: ['Frame inicial e final', '5 ou 10 segundos'],
  weaknesses: ['Geração anterior ao Seedance 2.5'],
  supportedInputs: ['image', 'imageEnd', 'text'],
  supportedAspectRatios: ['auto', '16:9', '9:16'], supportedResolutions: ['720p'],
  costInNodes: { '5': 200, '10': 300 },
  isAvailable: VIDEO_FLAGS.enableNewVariants, isBeta: true, badge: undefined,
}

const NEBULA_PRO: VideoModel = {
  ...NEBULA_LITE,
  id: 'byteplus/seedance-2.5/image-to-video', provider: 'byteplus',
  label: 'Nebula Pro', variant: 'Pro', tag: 'Seedance 2.5',
  description: 'A versão Seedance 2.5. Em preparação.',
  weaknesses: ['Integração BytePlus ainda não liberada'],
  costInNodes: { '5': 1000, '10': 2000 },
  isAvailable: false,
}

const ASTRA: VideoModel = {
  ...NEBULA_LITE,
  id: 'luma/ray-3.2/720p', provider: 'luma',
  label: 'Astra', engineId: 'astra', variant: '720p', tag: 'Luma Ray3.2',
  description: 'Vídeo em 720p. Em preparação.',
  strengths: ['720p'], weaknesses: ['Integração Luma ainda não liberada'],
  supportedInputs: ['image', 'text'], supportedDurations: ['5'],
  costInNodes: { '5': 300 }, isAvailable: false,
}

const ASTRA_HD: VideoModel = {
  ...ASTRA,
  id: 'luma/ray-3.2/1080p', label: 'Astra 1080p', variant: '1080p',
  description: 'Vídeo em 1080p. Em preparação.',
  supportedResolutions: ['1080p'], costInNodes: { '5': 900 },
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
  [ORBIT_LITE.id]: ORBIT_LITE,
  [ORBIT_PRO.id]: ORBIT_PRO,
  [LYRA_LITE.id]: LYRA_LITE,
  [LYRA_FAST.id]: LYRA_FAST,
  [NEBULA_LITE.id]: NEBULA_LITE,
  [NEBULA_PRO.id]: NEBULA_PRO,
  [ASTRA.id]: ASTRA,
  [ASTRA_HD.id]: ASTRA_HD,
  [KLING_25_TURBO_PRO.id]:      KLING_25_TURBO_PRO,
  [VEO_31.id]:                  VEO_31,
  [SEEDANCE_20.id]:             SEEDANCE_20,
  [GOOGLE_FLOW_PLACEHOLDER.id]: GOOGLE_FLOW_PLACEHOLDER,
  [GEMINI_OMNI_PLACEHOLDER.id]: GEMINI_OMNI_PLACEHOLDER,
}

export const DEFAULT_VIDEO_MODEL_ID = KLING_25_TURBO_PRO.id

// Ordem de exibição. Disponíveis primeiro, placeholders depois.
export const VIDEO_MODEL_ORDER: string[] = [
  ORBIT_LITE.id, KLING_25_TURBO_PRO.id, ORBIT_PRO.id,
  LYRA_LITE.id, LYRA_FAST.id, VEO_31.id,
  NEBULA_LITE.id, NEBULA_PRO.id, ASTRA.id, ASTRA_HD.id,
]

export function listVideoVariants(engineId: VideoEngineId): VideoModel[] {
  return listAllVideoModels().filter(model => model.engineId === engineId)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getVideoModel(id: string): VideoModel | undefined {
  return Object.hasOwn(VIDEO_MODELS, id) ? VIDEO_MODELS[id] : undefined
}

export function requireVideoModel(id: string): VideoModel {
  const m = getVideoModel(id)
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
  if (!m.supportedDurations.includes(duration) || !Number.isFinite(cost) || cost <= 0) {
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
