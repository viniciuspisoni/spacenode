export interface TextureEvidence {
  original: 'smooth' | 'patterned' | 'unclear'
  generated: 'smooth' | 'patterned' | 'unclear'
  change: 'none' | 'added' | 'removed' | 'changed' | 'uncertain'
}

export function normalizeTextureEvidence(value: unknown): TextureEvidence | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as TextureEvidence
  if (!['smooth', 'patterned', 'unclear'].includes(item.original) ||
      !['smooth', 'patterned', 'unclear'].includes(item.generated) ||
      !['none', 'added', 'removed', 'changed', 'uncertain'].includes(item.change)) return undefined
  return { original: item.original, generated: item.generated, change: item.change }
}

// This is a contradiction guard, not an image classifier. Only an explicit
// smooth source plus affirmative added pattern warrants uncertainty. Lighting,
// tile joints and panel grooves alone are not material texture evidence.
export function hasTextureDescriptionConflict(original: string, generated: string): boolean {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const source = normalize(original)
  const result = normalize(generated)
  const smoothSource = /\b(?:sem textura(?: aparente)?|sem (?:veios|granulacao)|no (?:visible )?(?:texture|grain)|untextured|textureless)\b/.test(source)
  // Inspect clauses individually so an explicit negative cannot be read as
  // positive texture. Ambiguous prose is left to structured evidence.
  const addedPattern = result.split(/[,.;]/).some(clause =>
    !/\b(?:sem|nao|no|not|without|unchanged|same|mesm[oa]|preservad[oa])\b/.test(clause) &&
    /\b(?:veios|granulacao|wood grain|stone vein(?:s|ing)?|(?:textura|texture) (?:de |of )?(?:concreto|cimento|pedra|madeira|concrete|cement|stone|wood))\b/.test(clause))
  return smoothSource && addedPattern
}

export function textureEvidenceVerdict(evidence: TextureEvidence): 'changed' | 'uncertain' | 'preserved' {
  if (['added', 'removed', 'changed'].includes(evidence.change)) return 'changed'
  if (evidence.original !== 'unclear' && evidence.generated !== 'unclear' && evidence.original !== evidence.generated) return 'changed'
  if (evidence.change === 'uncertain' || evidence.original === 'unclear' || evidence.generated === 'unclear') return 'uncertain'
  return 'preserved'
}
