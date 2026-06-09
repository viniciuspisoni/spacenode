// Pontes entre o vocabulário PÚBLICO do editRouter (spec de produto) e o
// vocabulário INTERNO já existente no código.
//
// O editRouter (edit-router.ts) é a fonte da verdade da spec e usa:
//   tool: 'fix_detail' | 'landscaping' | ...   resolução: 'current' | '2K' | '4K'
//
// O resto do código (engines/types.ts, types.ts) usa:
//   EditMode: 'fix' | 'landscape' | ...         Quality: 'hd' | '2k' | '4k'
//
// Estes adapters convertem nos dois sentidos no ponto de integração (a rota
// /api/edits), sem forçar um rename global agora.

import type { EditMode } from './engines'
import type { Quality } from './types'
import type { EditTool, OutputResolution } from './edit-router'

// ── EditMode (interno) ↔ EditTool (spec) ───────────────────────────────────────

export function editToolFromMode(mode: EditMode): EditTool {
  switch (mode) {
    case 'fix':       return 'fix_detail'
    case 'landscape': return 'landscaping'
    default:          return mode // remove | material | replace | add | lighting
  }
}

export function modeFromEditTool(tool: EditTool): EditMode {
  switch (tool) {
    case 'fix_detail':  return 'fix'
    case 'landscaping': return 'landscape'
    default:            return tool // remove | material | replace | add | lighting
  }
}

// ── Quality (interno) ↔ OutputResolution (spec) ────────────────────────────────
// 'current' não tem equivalente direto em Quality (Quality é sempre concreto);
// mapeamos 'current' → 'hd' por padrão. Quem chama pode sobrepor se souber a
// resolução real da origem.

export function resolutionFromQuality(quality: Quality): OutputResolution {
  switch (quality) {
    case '2k': return '2K'
    case '4k': return '4K'
    case 'hd': return 'current'
  }
}

export function qualityFromResolution(resolution: OutputResolution): Quality {
  switch (resolution) {
    case '2K':      return '2k'
    case '4K':      return '4k'
    case 'current': return 'hd'
  }
}

// NOTA: o mapeamento PlanId → UserPlan (spec) e o teto mensal de correções
// grátis vivem CENTRALIZADOS em edit-free-fix.ts (política de plano em um único
// arquivo). 'office'→'beta' é placeholder temporário documentado lá.
