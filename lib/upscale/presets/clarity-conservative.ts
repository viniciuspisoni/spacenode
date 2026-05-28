// Clarity Upscaler — preset CONSERVADOR.
//
// Reproduz fielmente o preset descrito no brief de "Ampliar v2": creativity
// baixa, resemblance alta, poucas inferências. Esse preset é compartilhado
// entre dois modos:
//   - aba Resolução / "Recuperar Imagem Baixa"
//   - aba Aprimorar  / "Melhoria Inteligente"
//
// O `upscale_factor` é injetado dinamicamente em runtime, conforme a escala
// escolhida (1, 2, 4, 8). Em "Melhoria Inteligente" o factor mínimo é 2 — o
// Clarity sempre amplia algo, então o usuário escolhe 2x ou 4x na UI.

export const CLARITY_CONSERVATIVE_PROMPT =
  'high-end architectural visualization, preserve original geometry, ' +
  'preserve materials, preserve lighting, sharp details, realistic textures'

export const CLARITY_CONSERVATIVE_NEGATIVE =
  'changed geometry, distorted architecture, extra objects, warped lines, ' +
  'different materials, blurry, artifacts'

export interface ClarityConservativeOverrides {
  upscaleFactor: number
}

export function buildClarityConservativeParams(
  overrides: ClarityConservativeOverrides,
): Record<string, unknown> {
  return {
    upscale_factor:       overrides.upscaleFactor,
    creativity:           0.15,
    resemblance:          0.85,
    guidance_scale:       3,
    num_inference_steps:  18,
    prompt:               CLARITY_CONSERVATIVE_PROMPT,
    negative_prompt:      CLARITY_CONSERVATIVE_NEGATIVE,
  }
}
