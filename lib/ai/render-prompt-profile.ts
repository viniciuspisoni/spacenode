import type { RenderEngineId } from '@/lib/orion/config'

/** Client-safe. Provider guidance and evaluation procedure:
 * docs/RENDER-PROMPTS-2026-10-30.md. These are prompt profiles, not model upgrades. */
export const RENDER_PROMPT_VERSION = 'render-model-fidelity-v1'
export const RENDER_PROMPT_PROFILES = {
  vega: { id: 'gemini-pro', recommendedWords: null },
  pulsar: { id: 'gemini-flash', recommendedWords: null },
  quasar: { id: 'seedream-pro', recommendedWords: 600 },
  orion: { id: 'gpt-image', recommendedWords: null },
} as const satisfies Record<RenderEngineId, { id: string; recommendedWords: number | null }>

export function promptWordCount(prompt: string): number {
  return prompt.trim().split(/\s+/u).filter(Boolean).length
}

export function renderPromptMetadata(engine: RenderEngineId, prompt: string) {
  const profile = RENDER_PROMPT_PROFILES[engine]
  const words = promptWordCount(prompt)
  return {
    version: RENDER_PROMPT_VERSION,
    profile: profile.id,
    words,
    recommended_words: profile.recommendedWords,
    exceeds_recommended_words: profile.recommendedWords !== null && words > profile.recommendedWords,
  }
}

export interface RenderPromptSections {
  engine: RenderEngineId
  projectType: 'interior' | 'exterior'
  hasAnchor: boolean
  attempt: number
  context: string
  changes: string
  lighting: string
  references: string
  modelFacts: string
  /** Inferred vision descriptions are expendable; user instructions are not. */
  observations: string
  canvas: string
}

export function compileRenderPrompt(s: RenderPromptSections): string {
  const geometry = s.hasAnchor ? 'image #2' : 'image #1'
  const roles = s.hasAnchor
    ? 'Image #2 is the geometry and camera source. Image #1 is the previous render of this project: use its materials, colors and finish only where they correspond to surfaces in image #2. In a conflict, image #2 determines geometry, framing and object placement.'
    : 'Image #1 is the source for geometry, camera, object placement, materials and colors.'
  const task = `Create one photorealistic architectural ${s.projectType} image of the exact project in ${geometry}. ` +
    (s.hasAnchor
      ? 'Apply the requested rendering changes while retaining the established appearance.'
      : 'Translate schematic shading into photographic light where needed; retain detail that is already photographic.')
  const keep = 'PRESERVATION CONTRACT: Keep the source camera, perspective, framing, horizon, proportions and silhouette. ' +
    'Keep every wall, ceiling, slab, stair, column, door and window in its original count, position, shape and size. ' +
    'Keep furniture, cabinetry, countertops, appliances, fixtures, props, vegetation and neighboring buildings in their original positions, sizes and orientations. ' +
    'Retain thin window mullions, slab thickness, joinery, panel seams and existing text. ' +
    'Geometry and camera stay fixed even when a user direction requests a structural change. ' +
    'Except on explicitly requested surfaces, retain material identity, base color, finish, wood grain direction, stone veining, tile size, joints and pattern scale. ' +
    'Plain or ambiguous surfaces stay plain with their visible color; grooves and joints do not imply wood or stone. ' +
    'Material samples affect only their named surfaces. Mood and scene labels never authorize redesign.'
  const photo = 'Improve light transport, contact shadows and reflections on existing surfaces. ' +
    'Preserve the existing content reflected in mirrors and glass. ' +
    'Where CAD outlines exist, translate their physical boundaries into material edges and depth, without drawn strokes. ' +
    'Keep fine architectural details in focus with natural sharpness and clean surfaces, without invented grain, veins or edge halos.'
  const output = `Return one continuous full-frame photograph aligned with ${geometry}. ` +
    'Auxiliary images are evidence only, never output panels, collages or alternative views. ' + s.canvas
  const retry = s.attempt > 1
    ? 'Prioritize source alignment over embellishment: match opening contours, object silhouettes and surface boundaries at their original positions.'
    : ''
  const evidence = [roles, s.references, s.modelFacts].filter(Boolean).join('\n')
  const changes = s.changes || 'Only improve the photographic rendering; retain the source design and finishes.'
  const section = (title: string, value: string) => value.trim() ? `${title}\n${value.trim()}` : ''
  const compose = (observations: string): string => {
    let blocks: string[]
    switch (s.engine) {
      case 'quasar':
        // Seedream: direct edit + named targets + explicit fixed elements.
        // Natural language, without the legacy negative-keyword catalogue.
        blocks = [task, evidence, keep, changes, s.lighting, photo, s.context, observations, retry, output]
        break
      case 'pulsar':
        // Gemini Flash: a short ordered workflow for a complex edit.
        blocks = [task, section('1. Read the references', evidence),
          section('2. Preserve the project', keep),
          section('3. Apply only these directions', [changes, s.lighting, photo, s.context].filter(Boolean).join('\n')),
          observations, retry, section('4. Deliver the image', output)]
        break
      case 'vega':
        // Gemini Pro: intent and positive constraints in descriptive language.
        blocks = [task, section('Reference roles', evidence), keep,
          section('Requested rendering', [changes, s.lighting, photo].join('\n')),
          s.context, observations, retry, output]
        break
      case 'orion':
        // GPT Image: separate edit scope, invariants and reference roles.
        blocks = [section('Task', task), section('Inputs and roles', evidence),
          section('Keep unchanged', keep), section('Requested edits', changes),
          section('Rendering and lighting', [s.lighting, photo].join('\n')),
          s.context, observations, retry, section('Output', output)]
        break
    }
    return blocks.map(block => block.trim()).filter(Boolean).join('\n\n')
  }
  const full = compose(s.observations)
  const budget = RENDER_PROMPT_PROFILES[s.engine].recommendedWords
  // Drop only optional inferred observations, as a whole. Never truncate an
  // instruction, a measured fact, an image role or the preservation contract.
  return budget !== null && promptWordCount(full) > budget ? compose('') : full
}
