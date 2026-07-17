// lib/blocos3d/types.ts
//
// Tipos compartilhados do módulo Blocos 3D (imagem → modelo 3D).
// Importado tanto no server (rotas/providers) quanto no client (UI).

/** Nível de qualidade exposto na UI — cada um mapeia pra um motor no catálogo
 *  (lib/blocos3d/config.ts), com provider, parâmetros e custo próprios. */
export type Blocos3DQuality = 'draft' | 'standard' | 'high'

export type Blocos3DProvider = 'fal' | 'meshy'

export type Blocos3DJobStatus = 'processing' | 'completed' | 'failed'

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
