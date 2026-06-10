// Prompt composition helpers for Retocar (both standalone and embedded routes).
//
// The client sends `prompt` already enriched with chips/presets ("trocar parede
// por concreto. Manter geometria. Resultado fotorrealista."). The server is
// still responsible for:
//   1. The non-negotiable mask constraint (do not touch pixels outside the
//      painted area).
//   2. The fidelity clause (how strictly to preserve geometry/lighting/scale).
//   3. Mode-specific guard rails (handled separately in guard-policy.ts when
//      a retry is triggered).
//
// Keeping this server-side means a malicious or buggy client can't downgrade
// the constraints by sending a hand-crafted prompt.

import type { EditMode } from './engines'
import type { EditReferenceImage } from './edit-router'

// ── FidelityMode ──────────────────────────────────────────────────────────────

export type FidelityMode = 'max' | 'balanced' | 'creative'

export const VALID_FIDELITY_MODES: FidelityMode[] = ['max', 'balanced', 'creative']

export function isFidelityMode(v: unknown): v is FidelityMode {
  return typeof v === 'string' && (VALID_FIDELITY_MODES as string[]).includes(v)
}

export interface FidelityMeta {
  label:       string
  description: string
}

export const FIDELITY_LABELS: Record<FidelityMode, FidelityMeta> = {
  max: {
    label:       'Máxima fidelidade',
    description: 'Recomendado para projetos reais. Preserva geometria, escala e composição.',
  },
  balanced: {
    label:       'Equilibrado',
    description: 'Permite pequenas adaptações para melhorar o resultado.',
  },
  creative: {
    label:       'Mais criativo',
    description: 'Permite alterações mais livres na área selecionada.',
  },
}

// ── Fidelity clause ───────────────────────────────────────────────────────────
// Injected into the final prompt sent to the model. Shapes how strictly the
// model preserves architecture outside the mask AND how literally it follows
// the user's intent inside.

function buildFidelityClause(mode: FidelityMode): string {
  switch (mode) {
    case 'max':
      return (
        'Preserve strictly the original architecture, geometry, perspective, ' +
        'scale, camera angle, lighting direction, and overall composition. ' +
        'Modify only the masked area.'
      )
    case 'balanced':
      return (
        'Preserve the original architecture, geometry, and perspective. ' +
        'Small adaptations to scale or lighting are allowed only inside the ' +
        'masked area to improve the final result.'
      )
    case 'creative':
      return (
        'You may freely reinterpret the masked area while preserving the ' +
        'overall composition, perspective, and camera angle. The unmasked ' +
        'context still defines style and atmosphere.'
      )
  }
}

// ── Standalone prompt composer ────────────────────────────────────────────────
// Used by /api/edits (modo standalone). No DNA context — the source image can
// be anything the user uploaded.

export function composeStandaloneFinalPrompt(args: {
  userPrompt: string
  mode:       EditMode
  fidelity:   FidelityMode
}): string {
  const { userPrompt, mode, fidelity } = args
  if (mode === 'remove') {
    // The removal model ignores the prompt entirely. We still return an empty
    // string so callers don't need to special-case it.
    return ''
  }
  return [
    'Edit only the masked area of this image. Do not modify any pixels outside the mask.',
    '',
    `USER REQUEST: ${userPrompt}`,
    '',
    buildFidelityClause(fidelity),
    '',
    'Maintain visual coherence with the rest of the image. Match lighting, perspective, scale, and material rendering style of unmasked areas.',
    '',
    'IMPORTANT: do not modify anything outside the masked area. The output must be pixel-identical to the input outside the mask boundaries.',
    '',
    'Output: photorealistic edit.',
  ].join('\n')
}

// ── Embedded prompt composer ──────────────────────────────────────────────────
// Used by /api/spaces/.../edit (modo embebido). Receives the Space's visual
// DNA as additional context so edits stay coherent with the project's style.

export interface EmbeddedDnaContext {
  estiloNome:    string
  materiais:     Array<{ nome: string; hex: string }>
  paleta:        string[]
  contexto:      string[]
}

export function composeEmbeddedFinalPrompt(args: {
  userPrompt: string
  mode:       EditMode
  fidelity:   FidelityMode
  dna:        EmbeddedDnaContext | null
}): string {
  const { userPrompt, mode, fidelity, dna } = args
  if (mode === 'remove') return ''

  const dnaLines: string[] = []
  if (dna) {
    dnaLines.push(`- Style: ${dna.estiloNome}`)
    if (dna.materiais.length > 0) {
      dnaLines.push(
        `- Materials present: ${dna.materiais.map(m => `${m.nome} (${m.hex})`).join(', ')}`,
      )
    }
    if (dna.paleta.length > 0) {
      dnaLines.push(`- Color palette: ${dna.paleta.join(', ')}`)
    }
    if (dna.contexto.length > 0) {
      dnaLines.push(`- Mood/context: ${dna.contexto.join(', ')}`)
    }
  }
  const dnaBlock = dnaLines.length > 0
    ? `PROJECT CONTEXT (preserve consistency with these):\n${dnaLines.join('\n')}\n\n`
    : ''

  return [
    'Edit only the masked area of this architectural image. Do not modify any pixels outside the mask.',
    '',
    `USER REQUEST: ${userPrompt}`,
    '',
    buildFidelityClause(fidelity),
    '',
    dnaBlock +
    'Maintain visual coherence with the rest of the image. Match lighting, perspective, scale, and material rendering style of unmasked areas.',
    '',
    'IMPORTANT: do not modify anything outside the masked area. The output must be pixel-identical to the input outside the mask boundaries.',
    '',
    'Output: photorealistic architectural rendering.',
  ].join('\n')
}

// ── Router prompt composer (editRouter v1) ──────────────────────────────────────
// O editRouter pode mandar a edição para endpoints COM máscara (inpaint /
// 2-imagens) ou SEM máscara (Flux Pro Kontext, edição por instrução). A
// linguagem do prompt precisa casar com isso, e 'remove' precisa de uma
// instrução de remoção real (o endpoint de inpaint USA o prompt).

const REMOVAL_INSTRUCTION = [
  'Completely remove the selected object or artifact inside the masked area.',
  'Fill the removed area naturally using the surrounding architecture, materials,',
  'lighting, shadows, perspective, and texture. Preserve all unmasked regions exactly.',
  'Do not leave traces, ghosting, blur, duplicated objects, or visible seams.',
].join(' ')

function buildMaterialInstruction(userPrompt: string): string {
  return [
    `Change the material of the SELECTED (masked) surface to: ${userPrompt}.`,
    'The selection marks the exact surface to edit. Apply the new material uniformly across the WHOLE selected region, following its plane, perspective, texture scale, direction and lighting, so it reads as one continuous real surface.',
    'CRITICAL — preserve the surface EXISTING lighting exactly: keep the sunlit areas bright, the shadowed corners shadowed, and every highlight, reflection and light gradient already on the surface. The new material must INHERIT the scene light, never a flat or even illumination.',
    'Edit ONLY the surface inside the selection. Do NOT apply the material to any other surface, even if a similar-looking floor, wall, ceiling or facade appears elsewhere in the image.',
    'Keep everything else identical: do not change furniture, rugs, windows, walls, lighting, structure, camera or any other surface.',
    'The result must clearly show the new material with realistic, high-resolution architectural texture.',
  ].join(' ')
}

// ── Cláusula de referência (por papel) ──────────────────────────────────────────
// Anexada ao prompt quando há imagens de referência. Prioriza o caso central da
// feature: consistência entre imagens do mesmo projeto (vista mestre, etc.).
function buildReferenceClause(references: EditReferenceImage[]): string {
  if (references.length === 0) return ''
  const roles = new Set(references.map(r => r.role))

  if (roles.has('consistency_reference') || roles.has('project_render')) {
    return 'Use the attached reference image as the visual source for the selected object. Focus specifically on the object/element shown in the reference image. Recreate the selected masked region in the current image so it matches the reference object’s species, size, shape, density, color, and visual character. Preserve the current image perspective, lighting, scale, and all unmasked regions.'
  }
  if (roles.has('restore_reference') || roles.has('original_image')) {
    return 'Use the attached image as the original reference. Restore the selected region so it matches the reference. Preserve the architecture, perspective, lighting and all unmasked regions.'
  }
  if (roles.has('material_texture')) {
    return 'Use the attached image only as a material/texture reference. Apply this material uniformly across the WHOLE selected (masked) surface, following its plane, perspective and texture scale. PRESERVE the surface existing lighting exactly — bright where the scene is bright, shadowed in the corners, keeping every highlight and gradient; the material inherits the scene light, never a flat illumination. Edit ONLY the surface inside the selection — do NOT apply it to any other similar-looking surface elsewhere in the image. Keep everything else identical (furniture, rugs, windows, walls, lighting, other surfaces).'
  }
  if (roles.has('object_reference')) {
    return 'Use the attached image as the object design reference. Replace only the selected object with one similar to the reference. Preserve perspective, lighting, scale and all unmasked areas.'
  }
  if (roles.has('person_reference')) {
    return 'Use the attached image as a reference for the person in the masked area. Preserve perspective, lighting, scale and all unmasked areas.'
  }
  if (roles.has('lighting_reference')) {
    return 'Use the attached image as a lighting/atmosphere reference for the masked area. Preserve geometry and all unmasked regions.'
  }
  if (roles.has('landscape_reference')) {
    return 'Use the attached image as a landscaping/vegetation reference for the masked area. Preserve architecture, perspective and all unmasked regions.'
  }
  if (roles.has('style_reference')) {
    return 'Use the attached image as a style reference for the masked area. Preserve geometry, perspective and all unmasked regions.'
  }
  return 'Use the attached image(s) as visual reference for the masked area. Preserve perspective, lighting and all unmasked regions.'
}

function buildDnaContextBlock(dna: EmbeddedDnaContext): string {
  const lines: string[] = [`- Style: ${dna.estiloNome}`]
  if (dna.materiais.length > 0) lines.push(`- Materials: ${dna.materiais.map(m => m.nome).join(', ')}`)
  if (dna.paleta.length > 0)    lines.push(`- Color palette: ${dna.paleta.join(', ')}`)
  if (dna.contexto.length > 0)  lines.push(`- Mood/context: ${dna.contexto.join(', ')}`)
  return `PROJECT CONTEXT (preserve consistency with these):\n${lines.join('\n')}\n\n`
}

// ── Normalização universal (spec Google-first) ──────────────────────────────────
// Cláusulas SEMPRE presentes, em qualquer rota/modo — o coração do
// "normalizedPrompt" da spec. Mantidas curtas e absolutas: os modelos Google
// respondem melhor a regras diretas do que a parágrafos.

const UNIVERSAL_PRESERVATION_CLAUSES = [
  'NON-NEGOTIABLE RULES:',
  '- Preserve the existing architectural geometry.',
  '- Preserve the camera, perspective, proportions and layout.',
  '- Change ONLY what was explicitly requested.',
  '- Maintain photorealistic architectural realism.',
  '- Do not modify unselected areas.',
  '- Do not add elements that were not requested.',
].join('\n')

/** Introdução específica das intenções conversacionais novas. */
function instructIntro(mode: EditMode): string {
  if (mode === 'variation') {
    return 'Create a CONTROLLED VARIATION of this architectural image. Keep the structure, camera and layout identical; vary only what the instruction asks.'
  }
  if (mode === 'style') {
    return 'Refine the STYLE and atmosphere of this architectural image. The architecture itself must remain identical.'
  }
  return 'Edit this architectural image following the instruction below.'
}

export function composeRouterPrompt(args: {
  userPrompt:  string
  mode:        EditMode
  fidelity:    FidelityMode
  /** true = endpoint consome a máscara; false = edita por instrução (Kontext). */
  usesMask:    boolean
  /** Modo embebido (Spaces): contexto de DNA do projeto, se houver. */
  dna?:        EmbeddedDnaContext | null
  /** Referências visuais anexadas (cláusula por papel é apensada ao final). */
  references?: EditReferenceImage[]
}): string {
  const { userPrompt, mode, fidelity, usesMask, dna, references } = args
  const refClause = buildReferenceClause(references ?? [])

  let base: string
  if (mode === 'remove') {
    base = [REMOVAL_INSTRUCTION, '', buildFidelityClause(fidelity)].join('\n')
  } else if (mode === 'material') {
    base = [buildMaterialInstruction(userPrompt), '', buildFidelityClause(fidelity)].join('\n')
  } else if (usesMask) {
    // Reusa os composers existentes: embebido (com DNA) ou standalone.
    base = dna
      ? composeEmbeddedFinalPrompt({ userPrompt, mode, fidelity, dna })
      : composeStandaloneFinalPrompt({ userPrompt, mode, fidelity })
  } else {
    // Endpoint por instrução (edição conversacional) — sem linguagem de máscara.
    const dnaBlock = dna ? buildDnaContextBlock(dna) : ''
    base = [
      instructIntro(mode),
      '',
      `INSTRUCTION: ${userPrompt}`,
      '',
      buildFidelityClause(fidelity),
      '',
      dnaBlock +
      'Preserve the overall composition, perspective, camera angle, and architectural geometry. Output: photorealistic architectural rendering.',
    ].join('\n')
  }

  const withRefs = refClause ? `${base}\n\n${refClause}` : base
  return `${withRefs}\n\n${UNIVERSAL_PRESERVATION_CLAUSES}`
}

/** Alias da spec: o "normalizedPrompt" do edit-router É o composeRouterPrompt
 *  (composto no SERVIDOR — o cliente não consegue rebaixar as cláusulas). */
export const normalizeEditPrompt = composeRouterPrompt

// ── Retry automático do quality gate ───────────────────────────────────────────
// Prompt mais restritivo para a 2ª tentativa (grátis). Prefixa restrições com
// prioridade máxima sem perder a intenção original do usuário.

export function buildStrictRetryPrompt(finalPrompt: string, gateReason: string | null): string {
  const constraint = [
    `STRICT RETRY — the previous attempt failed automatic validation${gateReason ? ` (${gateReason})` : ''}.`,
    'Follow these constraints with MAXIMUM priority:',
    '- Apply the requested change CLEARLY and COMPLETELY inside the selected area.',
    '- Do NOT change a single pixel outside the selected area.',
    '- Preserve geometry, camera, perspective, proportions, lighting direction and layout exactly.',
    '- No artifacts, no added objects, no style drift.',
  ].join('\n')
  return `${constraint}\n\n${finalPrompt}`
}
