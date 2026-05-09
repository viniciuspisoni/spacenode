// Prompt builder para variações de Vista — DNA travado + axis modifier.
// O DNA entra como bloco "non-negotiable constraints" no início; o eixo,
// como instrução de variação. Modelo recebe Vista Mestre como image_urls[0].

import type { ProjectDNA, Axis } from './types'
import { findAxisOption } from './axes'

export function buildVistaPrompt(
  dna:        ProjectDNA,
  axis:       Axis,
  axisValue:  string,
): string {
  const opt = findAxisOption(axis, axisValue)
  if (!opt) throw new Error(`Axis option não encontrada: ${axis}/${axisValue}`)

  const dnaLines = [
    `Architectural style: ${dna.estilo.nome}`,
    `Materials: ${dna.materiais.map(m => m.nome).join(', ')}`,
    `Color palette: ${dna.paleta.join(', ')}`,
    `Context: ${dna.contexto.join(', ')}`,
  ].join('\n')

  return [
    '[LOCKED PROJECT DNA — NON-NEGOTIABLE CONSTRAINTS]',
    dnaLines,
    '',
    'All locked traits listed above are FIXED. They must appear in the output EXACTLY as specified. Do NOT substitute, blend, alter or remove any of them.',
    '',
    `[VARIATION TO APPLY: ${axis.toUpperCase()} — ${opt.label}]`,
    opt.promptModifier,
    '',
    'Same architectural composition, framing, geometry and camera angle as the reference image. Only the variation above changes.',
  ].join('\n')
}
