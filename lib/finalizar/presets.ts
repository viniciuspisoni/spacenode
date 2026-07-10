// lib/finalizar/presets.ts — presets de ajustes (embutidos + do usuário).
//
// Presets embutidos: discretos e arquitetônicos — nada de filtro exagerado.
// Presets do usuário: localStorage (sem migração de banco; se um dia virar
// tabela, este módulo é o único ponto a trocar).

import type { Adjustments, ColorGrading, CurvePoint, HslMap, Vignette } from './types'
import { defaultAdjustments, defaultCurve, defaultGrading, defaultHsl, defaultVignette } from './composition'

export interface AdjustPreset {
  id: string
  name: string
  builtin: boolean
  adjust: Partial<Adjustments>
  vignette?: Partial<Vignette>
  curve?: CurvePoint[]
  hsl?: Partial<HslMap>
  grading?: Partial<ColorGrading>
}

/** Presets embutidos — sutis por princípio (o render é a estrela). */
export const BUILTIN_PRESETS: AdjustPreset[] = [
  {
    id: 'neutro-pro',
    name: 'Neutro Pro',
    builtin: true,
    adjust: { contrast: 8, clarity: 8, vibrance: 6, sharpen: 18 },
  },
  {
    id: 'exterior-nitido',
    name: 'Exterior nítido',
    builtin: true,
    adjust: { contrast: 12, highlights: -18, shadows: 10, clarity: 16, vibrance: 10, sharpen: 24 },
    grading: { shadows: { hue: 220, sat: 6, lum: 0 }, highlights: { hue: 45, sat: 4, lum: 0 }, midtones: { hue: 0, sat: 0, lum: 0 }, blending: 50, balance: 0 },
  },
  {
    id: 'interior-quente',
    name: 'Interior acolhedor',
    builtin: true,
    adjust: { temperature: 10, exposure: 4, highlights: -14, shadows: 14, contrast: 6, vibrance: 8 },
    grading: { highlights: { hue: 40, sat: 8, lum: 2 }, shadows: { hue: 220, sat: 4, lum: 0 }, midtones: { hue: 0, sat: 0, lum: 0 }, blending: 60, balance: 6 },
  },
  {
    id: 'concreto-aco',
    name: 'Concreto & aço',
    builtin: true,
    adjust: { temperature: -8, contrast: 14, saturation: -14, clarity: 20, sharpen: 22 },
  },
  {
    id: 'fim-de-tarde',
    name: 'Fim de tarde',
    builtin: true,
    adjust: { temperature: 16, exposure: -3, highlights: -20, shadows: 8, vibrance: 12, contrast: 8 },
    vignette: { amount: -12, size: 40, feather: 75 },
    grading: { highlights: { hue: 35, sat: 12, lum: 2 }, shadows: { hue: 235, sat: 8, lum: -2 }, midtones: { hue: 0, sat: 0, lum: 0 }, blending: 55, balance: 8 },
  },
  {
    id: 'pb-arquitetonico',
    name: 'P&B arquitetônico',
    builtin: true,
    adjust: { saturation: -100, contrast: 18, clarity: 22, highlights: -10, shadows: 6, sharpen: 24 },
  },
]

// ── Presets do usuário (localStorage) ────────────────────────────────────────

const LS_KEY = 'spn-finalizar-presets-v1'

export function loadUserPresets(): AdjustPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p): p is AdjustPreset => Boolean(p && typeof p.id === 'string' && typeof p.name === 'string' && p.adjust))
      .map((p) => ({ ...p, builtin: false }))
      .slice(0, 40)
  } catch {
    return []
  }
}

export function saveUserPreset(preset: Omit<AdjustPreset, 'builtin'>): AdjustPreset[] {
  const list = loadUserPresets().filter((p) => p.id !== preset.id)
  list.push({ ...preset, builtin: false })
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch { /* localStorage cheio/indisponível — preset vale só na sessão */ }
  return list
}

export function deleteUserPreset(id: string): AdjustPreset[] {
  const list = loadUserPresets().filter((p) => p.id !== id)
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch { /* idem */ }
  return list
}

/** Aplica um preset devolvendo os blocos completos (identidade + preset). */
export function materializePreset(p: AdjustPreset): {
  adjust: Adjustments
  vignette: Vignette
  curve: CurvePoint[]
  hsl: HslMap
  grading: ColorGrading
} {
  const hsl = defaultHsl()
  if (p.hsl) {
    for (const k of Object.keys(p.hsl) as (keyof HslMap)[]) {
      if (p.hsl[k]) hsl[k] = { ...hsl[k], ...p.hsl[k] }
    }
  }
  return {
    adjust: { ...defaultAdjustments(), ...p.adjust },
    vignette: { ...defaultVignette(), ...p.vignette },
    curve: p.curve && p.curve.length >= 2 ? p.curve : defaultCurve(),
    hsl,
    grading: { ...defaultGrading(), ...p.grading },
  }
}
