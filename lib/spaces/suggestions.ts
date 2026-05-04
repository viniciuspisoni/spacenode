import type { Vista, VistaType, Suggestion, SuggestionPreset } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mk(
  label:      string,
  vistaType:  Exclude<VistaType, 'mestre'>,
  preset:     SuggestionPreset,
  reason:     string,
  parentId?:  string,
): Suggestion {
  return {
    label,
    vista_type: vistaType,
    preset,
    reason,
    ...(parentId ? { parent_id: parentId } : {}),
  }
}

// ── buildSuggestions ──────────────────────────────────────────────────────────
// Rule-based, deterministic. Input = non-mestre completed vistas sorted
// by created_at DESC (most recent first). Returns at most 3 suggestions.

export function buildSuggestions(vistas: Vista[]): Suggestion[] {
  const suggestions: Suggestion[] = []

  // Partition by type (vistas already sorted desc, so [0] = most recent)
  const byType: Record<Exclude<VistaType, 'mestre'>, Vista[]> = {
    iluminacao: [],
    material:   [],
    angulo:     [],
    detalhe:    [],
    interior:   [],
  }
  for (const v of vistas) {
    const t = v.vista_type as Exclude<VistaType, 'mestre'>
    if (t in byType) byType[t].push(v)
  }

  const total = vistas.length

  // ── Rule 0: Onboarding (space without any evolutions) ─────────────────────
  if (total === 0) {
    return [
      mk(
        'Golden Hour',
        'iluminacao',
        'lighting_change',
        'Comece pela atmosfera clássica — luz dourada do fim do dia.',
      ),
      mk(
        'Vista aérea drone',
        'angulo',
        'aerial_drone',
        'Mostre o projeto em perspectiva aérea para revelar implantação e volumetria.',
      ),
      mk(
        'Hero diagonal 45°',
        'angulo',
        'hero_diagonal',
        'Ângulo diagonal revela dois planos da fachada com mais dinamismo.',
      ),
    ]
  }

  // ── Rule 1: Sem Ângulo — sugerir aérea ────────────────────────────────────
  if (byType.angulo.length === 0) {
    suggestions.push(mk(
      'Vista aérea drone',
      'angulo',
      'aerial_drone',
      'Nenhum ângulo alternativo ainda. Explore a implantação do projeto de cima.',
    ))
  }

  // ── Rule 2: Tem iluminação e menos de 3 — continuar evoluindo ─────────────
  const lastLighting = byType.iluminacao[0]
  if (lastLighting && byType.iluminacao.length < 3) {
    suggestions.push(mk(
      'Blue hour',
      'iluminacao',
      'lighting_change',
      'Continue evoluindo sua última Vista de iluminação — experimente o crepúsculo azulado.',
      lastLighting.id,
    ))
  }

  // ── Rule 3: Sem Detalhe e total >= 4 ──────────────────────────────────────
  if (byType.detalhe.length === 0 && total >= 4) {
    suggestions.push(mk(
      'Detalhe construtivo',
      'detalhe',
      'detail_close',
      'O projeto já tem identidade visual. Mostre um close-up de material ou junção.',
    ))
  }

  // ── Rule 4: Sem Interior e total >= 5 ─────────────────────────────────────
  if (byType.interior.length === 0 && total >= 5) {
    suggestions.push(mk(
      'Interior coerente com fachada',
      'interior',
      'interior',
      'Complete o projeto com uma vista interior que respeita o DNA da fachada.',
    ))
  }

  return suggestions.slice(0, 3)
}
