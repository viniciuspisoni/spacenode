// Branding helpers — derivação de cor de acento + defaults.
// Usado na renderização de Pack e link compartilhável (Sprints 5-6).

import type { ProjectDNA, ArchitectIdentity } from './types'

export const DEFAULT_ACCENT = '#1D9E75'

// Heurística: dado um array de hex codes, escolhe a cor com maior peso
// percebido — saturação alta, longe de cinza-neutro, levemente tons quentes.
// Não é perceptualmente perfeito, mas estável e simples.
export function deriveAccentFromDna(dna: ProjectDNA): string {
  if (!dna.paleta || dna.paleta.length === 0) return DEFAULT_ACCENT

  let bestHex   = dna.paleta[0]
  let bestScore = -Infinity

  for (const hex of dna.paleta) {
    const hsl = hexToHsl(hex)
    if (!hsl) continue
    const [h, s, l] = hsl

    // Penaliza extremos de luminosidade — muito escuro/claro é pouco usável.
    const lightnessPenalty = Math.abs(l - 50)
    const saturationBonus  = s
    // Privilegia tons quentes (vermelho-laranja-amarelo) sobre frios.
    const warmth = (h <= 60 || h >= 330) ? 1.2
                  : (h > 60 && h <= 180)  ? 1.0
                  :                         0.8

    const score = saturationBonus * warmth - lightnessPenalty
    if (score > bestScore) {
      bestScore = score
      bestHex   = hex
    }
  }

  return bestHex
}

export function getAccentColor(
  identity: Pick<ArchitectIdentity, 'accent_color_mode' | 'accent_color_fixed'> | null,
  dna:      ProjectDNA | null,
): string {
  if (identity?.accent_color_mode === 'fixed' && identity.accent_color_fixed) {
    return identity.accent_color_fixed
  }
  if (dna) return deriveAccentFromDna(dna)
  return DEFAULT_ACCENT
}

// hex (#RRGGBB) → [hue 0-360, sat 0-100, lightness 0-100]
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let raw = m[1]
  if (raw.length === 3) raw = raw.split('').map(c => c + c).join('')

  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l   = (max + min) / 2
  const d   = max - min

  let h = 0
  let s = 0

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2);               break
      case b: h = ((r - g) / d + 4);               break
    }
    h *= 60
  }

  return [h, s * 100, l * 100]
}
