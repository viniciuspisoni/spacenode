// Helpers de prompt para engines que recebem a máscara (e referências) como
// imagens adicionais (família Nano Banana / Gemini Image).
//
// A máscara é o PNG B/W padrão do RetocarCanvas: WHITE = editar, BLACK = preservar.
// Referências entram como Image 3+ (textura, objeto, imagem do projeto…).

import type { RetouchReference } from './types'

function describeReferenceRole(role: string): string {
  switch (role) {
    case 'material_texture':      return 'material/texture reference — apply this material inside the masked area'
    case 'object_reference':      return 'object/design reference — the masked object should resemble this'
    case 'person_reference':      return 'person reference for the masked area'
    case 'style_reference':       return 'style reference'
    case 'lighting_reference':    return 'lighting/atmosphere reference'
    case 'landscape_reference':   return 'landscaping/vegetation reference'
    case 'project_render':
    case 'consistency_reference': return 'reference of the target object/element — recreate the masked region to match THIS object'
    case 'original_image':
    case 'restore_reference':     return 'original reference — restore the masked region to match it'
    default:                      return 'visual reference'
  }
}

/** Envolve o prompt do usuário com a explicação das imagens (origem + máscara +
 *  referências) e as regras de preservação. */
export function buildTwoImageMaskPrompt(userPrompt: string, references?: RetouchReference[]): string {
  const refs = references ?? []
  const lines = [
    'Multi-image edit request.',
    'Image 1: source architectural photo.',
    'Image 2: binary mask — WHITE area = edit here, BLACK area = do NOT touch.',
  ]
  refs.forEach((r, i) => {
    lines.push(`Image ${i + 3}: ${describeReferenceRole(r.role)}.`)
  })
  lines.push(
    '',
    `Apply the following change ONLY inside the white-masked area: ${userPrompt}`,
    '',
    'Mandatory preservation rules:',
    '- Do not change any pixel outside the white masked area.',
    '- Match the lighting, perspective, scale and photorealistic material quality of the surrounding context.',
    '- Maintain photorealistic architectural rendering quality throughout the entire image.',
    '- The output must be pixel-identical to the source image outside the mask boundaries.',
  )
  if (refs.length > 0) {
    lines.push('- Use the reference image(s) ONLY as guidance for the masked area; do not copy their framing or background.')
  }
  return lines.join('\n')
}
