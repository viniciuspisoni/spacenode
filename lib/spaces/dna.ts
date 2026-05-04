import type { ProjectDNA, DnaOverrides, DnaTrait, VistaType, GenerationMode } from './types'

// ── default: tudo travado ──────────────────────────────────────
export const ALL_LOCKED: DnaOverrides = {
  style:     { locked: true },
  materials: { locked: true },
  palette:   { locked: true },
  context:   { locked: true },
  lighting:  { locked: true },
}

// ── auto-unlock contextual baseado no tipo de Vista ────────────
export function getDefaultDnaOverrides(t: VistaType): DnaOverrides {
  switch (t) {
    case 'iluminacao':
      return { ...ALL_LOCKED, lighting: { locked: false } }
    case 'material':
      return { ...ALL_LOCKED, materials: { locked: false } }
    case 'angulo':
      return { ...ALL_LOCKED, lighting: { locked: false } }
    case 'detalhe':
      return ALL_LOCKED
    case 'interior':
      return {
        ...ALL_LOCKED,
        lighting: { locked: false },
        context:  { locked: false },
      }
    case 'mestre':
    default:
      return ALL_LOCKED
  }
}

// ── builder do prefixo de prompt ───────────────────────────────
export function buildDnaPrefix(
  dna: ProjectDNA,
  overrides: DnaOverrides,
): string {
  const lines: string[] = []

  if (overrides.style.locked) {
    lines.push(`Architectural style: ${overrides.style.override ?? dna.style}`)
  }
  if (overrides.materials.locked) {
    lines.push(`Facade materials: ${overrides.materials.override ?? dna.materials}`)
  }
  if (overrides.palette.locked) {
    const palette = overrides.palette.override ?? dna.palette.join(', ')
    lines.push(`Color palette: ${palette}`)
  }
  if (overrides.context.locked) {
    lines.push(`Site context: ${overrides.context.override ?? dna.context}`)
  }
  if (overrides.lighting.locked) {
    lines.push(`Lighting profile: ${overrides.lighting.override ?? dna.lighting}`)
  }

  if (lines.length === 0) return ''

  return (
    `[LOCKED PROJECT DNA — NON-NEGOTIABLE CONSTRAINTS]\n` +
    lines.join('\n') +
    `\nAll locked traits listed above are FIXED. They must appear in the output EXACTLY as specified. ` +
    `Do NOT substitute, blend, alter or remove any of them.\n\n`
  )
}

// ── helper de UI: contagem de travas ───────────────────────────
export function countLocked(o: DnaOverrides): { locked: number; unlocked: number } {
  const traits: DnaTrait[] = ['style', 'materials', 'palette', 'context', 'lighting']
  const locked = traits.filter(t => o[t].locked).length
  return { locked, unlocked: traits.length - locked }
}

// ── Mode presets ────────────────────────────────────────────────
// Defines geometry_lock default and which traits to auto-unlock per mode.

export interface ModePreset {
  geometryLock: number
  autoUnlock:   DnaTrait[]
}

export function getModePreset(mode: GenerationMode): ModePreset {
  if (mode === 'explorar') {
    return { geometryLock: 50, autoUnlock: ['materials', 'lighting'] }
  }
  // coerente
  return { geometryLock: 90, autoUnlock: [] }
}

// Apply a mode's auto-unlocks on top of an existing overrides object.
// Returns a new object; does not mutate.
export function applyModeUnlocks(overrides: DnaOverrides, mode: GenerationMode): DnaOverrides {
  const { autoUnlock } = getModePreset(mode)
  if (autoUnlock.length === 0) return overrides
  const next = { ...overrides } as DnaOverrides
  for (const trait of autoUnlock) {
    next[trait] = { ...next[trait], locked: false }
  }
  return next
}
