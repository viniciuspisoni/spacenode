// lib/spaces/fidelity.ts
//
// Gate de fidelidade do Spaces — validação estrutural pós-geração + retry
// ladder, espelhando o modo render_only do Renderizar (lib/ai/fidelity/
// render-only.ts, PR #132) sobre o pipeline único do Spaces.
//
// Motivação (feedback de prod, 2026-08): em gerações com DUAS imagens
// (print do usuário como geometria + Vista Mestre como identidade), o modelo
// às vezes ancora na Vista Mestre — a imagem mais "acabada" — e devolve uma
// variação DELA em vez de transformar o print. O gate compara o resultado com
// a REFERÊNCIA GEOMÉTRICA via geometry score (Sobel/edge recall); score baixo
// significa exatamente esse tipo de troca de âncora (ou drift grosseiro de
// geometria) e dispara um retry com temperatura menor, prompt escalado e edge
// map da referência anexado. A MELHOR tentativa é entregue.
//
// O gate só se aplica quando o output deve fazer OVERLAY da referência
// geométrica (comparação borda-sobre-borda faz sentido):
//   - nova_vista + print       → o print é o enquadramento; overlay exato.
//   - luz                      → mesma cena, só a iluminação muda.
//   - material                 → mesma cena com troca local (limite relaxado).
//   - detalhe                  → NÃO (crop fecha o enquadramento por design).
//   - nova_vista + mestre/hist → NÃO (a câmera se move por design).
//
// CLIENT-SAFE: só strings/números/env + import type (apagado no build).
// Análise de imagem (sharp) vive em lib/ai/fidelity/geometry-score.ts
// (server-only, importado apenas pelo executor lib/spaces/generation.ts).

import type { GeometryScoreBreakdown } from '@/lib/ai/fidelity/geometry-score'
import type { GenerationAction, ReferenceKind } from './types'
import { modeForAction, modeAllowsCloserCrop } from './preservation'

export { getFidelityAttemptParams } from '@/lib/ai/fidelity/render-only'

// ── Aplicabilidade ────────────────────────────────────────────────────────────

/** O geometry score compara bordas 1:1 — válido só quando o enquadramento da
 *  referência geométrica deve sobreviver exatamente (regra OVERLAY). */
export function fidelityGateApplies(action: GenerationAction, refKind: ReferenceKind): boolean {
  const cropExpected = modeAllowsCloserCrop(modeForAction(action))
  const cameraMoves  = action === 'nova_vista' && refKind !== 'print'
  return !cropExpected && !cameraMoves
}

// ── Config (envs com defaults — mesmos nomes/semântica do render_only) ────────
//
//   SPACES_FIDELITY_GATE          '0' desliga validação+retry (rollback rápido)
//   SPACES_FIDELITY_MIN_SCORE     limite do geometry score (default 0.50 —
//                                 conservador: pega troca de âncora e drift
//                                 grosseiro sem re-gerar vistas saudáveis)
//   SPACES_FIDELITY_MAX_ATTEMPTS  total de tentativas (default 2, cap 3)

export interface SpacesFidelityConfig {
  enabled: boolean
  minScore: number
  maxAttempts: number
  /** Ação material muda a cena de propósito (localmente) — relaxa o limite pra
   *  validação não brigar com o pedido do usuário. */
  materialRelaxFactor: number
}

export function getSpacesFidelityConfig(): SpacesFidelityConfig {
  const rawScore    = Number(process.env.SPACES_FIDELITY_MIN_SCORE)
  const rawAttempts = Number(process.env.SPACES_FIDELITY_MAX_ATTEMPTS)
  return {
    enabled: process.env.SPACES_FIDELITY_GATE !== '0',
    minScore: Number.isFinite(rawScore) && rawScore > 0 && rawScore < 1 ? rawScore : 0.5,
    maxAttempts: Number.isFinite(rawAttempts) && rawAttempts >= 1 ? Math.min(Math.floor(rawAttempts), 3) : 2,
    materialRelaxFactor: 0.85,
  }
}

/** Limite efetivo por ação (material relaxa; demais usam o limite cheio). */
export function minScoreForAction(cfg: SpacesFidelityConfig, action: GenerationAction): number {
  return action === 'material' ? cfg.minScore * cfg.materialRelaxFactor : cfg.minScore
}

// ── Rótulo do edge map (parte de texto no caminho GCP) ────────────────────────

export const EDGE_MAP_PART_LABEL =
  'STRUCTURAL CONSTRAINT MAP (edge/line map extracted from the geometric ' +
  'reference — a constraint to align with, not content to imitate):'

// ── Telemetria (vistas.generation_log.fidelity) ───────────────────────────────

export interface SpacesFidelityAttemptLog {
  attempt:        number
  provider:       string
  provider_model: string
  request_id:     string | null
  temperature:    number
  edge_map_used:  boolean
  fallback_used:  boolean
  duration_ms:    number
  geometry:       GeometryScoreBreakdown | null
  score_error?:   string
}

export interface SpacesFidelityLog {
  mode:        'spaces_overlay'
  min_score:   number
  final_score: number | null
  attempts:    SpacesFidelityAttemptLog[]
}
