// lib/blocos3d/types.ts
//
// Tipos compartilhados do módulo Blocos 3D (imagem → modelo 3D).
// Importado tanto no server (rotas/providers) quanto no client (UI).

/** Tier exposto na UI — cada um mapeia pra um motor no catálogo
 *  (lib/blocos3d/config.ts), com provider, parâmetros e custo próprios.
 *  ('draft' saiu do catálogo em 2026-07-17 mas segue válido no banco pra
 *  linhas históricas.) */
export type Blocos3DQuality = 'standard' | 'high' | 'premium'

export type Blocos3DProvider = 'fal' | 'meshy'

export type Blocos3DJobStatus = 'processing' | 'completed' | 'failed'

/** Posições do multiview. 'front' é obrigatória; as demais refinam o modelo.
 *  Posicional porque o Tripo multiview exige saber qual ângulo é qual —
 *  Rodin/Meshy recebem como lista e ignoram a semântica. */
export type ViewPosition = 'front' | 'left' | 'back' | 'right'

/** Conjunto de imagens por posição (File no client, key/URL no server). */
export type PositionedImages<T = string> = {
  front:  T
  left?:  T
  back?:  T
  right?: T
}

/** Opções da geração (validadas na rota; guardadas no jsonb `options`). */
export interface Blocos3DOptions {
  quality:        Blocos3DQuality
  /** Prompt opcional que guia a texturização (inglês; só em motores que suportam). */
  texturePrompt?: string
}

/** Formatos de modelo entregues ao usuário. */
export type ModelFormat = 'glb' | 'fbx' | 'obj' | 'usdz'

/** Estado normalizado de uma task nos providers (fal queue / Meshy task). */
export interface ProviderTaskState {
  status:       'processing' | 'succeeded' | 'failed'
  /** 0–100; null quando o provider não reporta (fal) — a UI sintetiza. */
  progress:     number | null
  modelUrls:    Partial<Record<ModelFormat, string>>
  thumbnailUrl: string | null
  errorMessage: string | null
}

/** Shape do job na resposta das rotas (URLs já assinadas na emissão). */
export interface Blocos3DJobView {
  id:           string
  status:       Blocos3DJobStatus
  progress:     number
  quality:      Blocos3DQuality
  inputUrl:     string | null
  thumbnailUrl: string | null
  modelUrls:    Partial<Record<ModelFormat, string>>
  nodesCost:    number
  errorMessage: string | null
  createdAt:    string
  completedAt:  string | null
}
