// lib/ai/fidelity/render-only.ts
//
// Modo estrutural RENDER_ONLY — fonte ÚNICA do contrato de fidelidade do
// Renderizar (norte do produto: visualização fotorrealista do projeto
// EXISTENTE, nunca redesign). Este módulo centraliza:
//
//   1. O system prompt de fidelidade (intent + contrato + geometry lock +
//      texture lock + negativos + direção fotográfica) que lib/prompts.ts
//      aplica ANTES de qualquer bloco derivado de escolha do usuário
//      (refinamento, materiais, luz, cena).
//   2. O ladder de parâmetros por tentativa (temperatura GCP + condicionamento
//      estrutural por edge map) usado pelo retry do /api/generate quando o
//      geometry score fica abaixo do limite.
//   3. A config do gate de fidelidade (envs com defaults).
//
// CLIENT-SAFE: só strings/números — este arquivo entra no grafo client via
// lib/prompts.ts (GenerateClient importa listas de lá). NUNCA importar sharp,
// fs ou supabase aqui; análise de imagem vive em ./geometry-score.ts
// (server-only).

import {
  inputMediaResolutionDefault,
  nb2ThinkingLevel,
  type InputMediaResolution,
  type Nb2ThinkingLevel,
} from '@/lib/ai/gemini-knobs'
//
// Regra do modo (contrato de produto): a imagem original é a base obrigatória;
// a IA só pode alterar materiais, texturas, iluminação, sombras, reflexos e
// realismo. Geometria, câmera/perspectiva, paredes, portas, janelas,
// marcenaria, mobiliário, bancadas, equipamentos, proporções, layout e
// composição são invioláveis — nada é adicionado, removido, movido ou
// redimensionado.

export const RENDER_ONLY_MODE = 'render_only' as const

// ── Negativos (compartilhados com balanced/creative via lib/prompts.ts) ───────
//
// 17 itens esparsos consolidados em itens densos — modelo de difusão presta
// menos atenção quando há muitos itens repetitivos competindo. (Histórico:
// revisão 2026-07-22, movido de lib/prompts.ts pra cá em 2026-07-31.)

export const NEGATIVE_BASE = [
  'no architectural changes (no added, removed, repositioned or resized walls, partitions, columns, beams, doors, windows, arches, niches, openings, ceiling line, roofline, stories or room boundaries)',
  'no transformed openings (a door stays a door, a window stays a window, an arch stays an arch)',
  'no different camera angle, perspective, framing, zoom, rotation or altered silhouette',
  'no warped proportions',
  'no removed neighboring buildings',
  'no fantasy, surreal or impossibly-shaped additions',
]

// Vetores extras do render_only — drift de cor/material/fixture e, novo, o
// vetor de mobiliário/equipamento (sintoma reportado: sofá/mesa/bancada
// trocados de lugar ou de modelo).
export const RENDER_ONLY_EXTRA_NEGATIVES = [
  'no recoloring, restaining, repainting or replaced finishes on any wall, ceiling, floor, door, window frame, ceiling fan, light fixture or furniture (no concrete texture replacing painted walls, no industrial finish replacing flat paint)',
  'no altered geometry, hardware or proportions on doors, windows, fans or fixtures',
  'no altered texture pattern, plank/tile layout, stone veining, wood grain direction, fabric weave or joint/grout alignment on any surface that was not explicitly overridden',
  'no added, removed, relocated, rotated, rescaled or redesigned furniture, cabinetry, millwork, countertops, appliances or equipment — every piece keeps its exact position, size, model and orientation',
]

export function buildRenderOnlyNegatives(): string {
  const all = [...NEGATIVE_BASE, ...RENDER_ONLY_EXTRA_NEGATIVES]
  return `STRICTLY AVOID: ${all.join(', ')}, no reframe, no zoom, no rotation, no altered silhouette.`
}

// ── Blocos positivos do system prompt ─────────────────────────────────────────

// Intent depende de ter âncora (ver comentários históricos em lib/prompts.ts):
// com âncora a entrada já é um render fotorealista (push fotográfico = drift);
// sem âncora a entrada é CGI chapado e converter pra foto É o objetivo.
function buildIntent(projectNoun: 'building' | 'space', hasAnchor: boolean): string {
  if (hasAnchor) {
    return 'Render this reference faithfully — photograph the EXACT scene shown, no magazine-style upgrades. '
  }
  return (
    `This reference is a raw 3D / CAD / SketchUp model. Re-render it into a real photograph of the SAME ${projectNoun}: ` +
    'convert the flat CGI shading into real-world photographic materials and light, while keeping the exact design, ' +
    'geometry, layout, materials, colors and finishes shown. Photorealism of surfaces and light ONLY — never a redesign. '
  )
}

function buildContract(): string {
  return (
    'RENDER-ONLY MODE — faithful photorealistic re-render of the reference. ' +
    'The reference image is the mandatory base: you may change ONLY materials, textures, lighting, shadows, ' +
    'reflections and photographic realism. ' +
    'Preserve every visible element exactly: architecture, walls, doors, windows, cabinetry and millwork, ' +
    'furniture, countertops, appliances and equipment, materials, colors, finishes, fixtures, props, ' +
    'proportions, layout and composition. ' +
    'Never add, remove, move or resize any element. ' +
    'Context and mood descriptors below are ATMOSPHERE ONLY, never license to alter anything visible. ' +
    'Apply ONLY changes explicitly requested in the lighting, scene, material or refinement blocks. '
  )
}

function buildGeometryLock(hasAnchor: boolean): string {
  const ref = hasAnchor ? 'image #2, the geometry source' : 'the reference image'
  return (
    `GEOMETRY LOCK (relative to ${ref}): preserve exactly the camera position, ` +
    'perspective, framing and horizon; the building/space silhouette; every ' +
    'wall, slab and ceiling plane; the count, size, shape and position of ' +
    'every door and window; all proportions; stairs, columns, beams and ' +
    'built-in volumes; the surrounding context. OVERLAY RULE: the output must ' +
    'overlay the geometry reference — every edge, opening contour and object ' +
    'silhouette in the same position, at the same size, seen from the same ' +
    'camera. '
  )
}

function buildTextureLock(hasAnchor: boolean): string {
  if (hasAnchor) {
    // Âncora = render fotorealista anterior do MESMO projeto: as texturas dela
    // são evidência fotográfica pronta — copiar, nunca regenerar.
    return (
      'MATERIAL & TEXTURE FIDELITY: materials and textures come from image #1 ' +
      'and are photographic evidence, not suggestions — reproduce the same ' +
      'physical materials with the same texture pattern and scale, the same ' +
      'wood grain direction, the same stone/marble veining layout, the same ' +
      'fabric weave, the same plank/tile layout and joint/grout alignment, the ' +
      'same finish (matte/gloss). Never substitute a material for a ' +
      'similar-looking one, never regenerate a texture with a new random ' +
      'pattern. '
    )
  }
  // Sem âncora = modelo 3D/SketchUp: as texturas mapeadas são DECISÕES DE
  // PROJETO. O realismo é bem-vindo (é o objetivo), mas a identidade do
  // material — cor, padrão, paginação — não muda.
  return (
    'MATERIAL IDENTITY LOCK: the materials mapped in the model are design ' +
    'decisions, not placeholders. Render each surface as the SAME material ' +
    'with the SAME color and the SAME pattern layout shown in the reference — ' +
    'wood keeps its tone and plank layout, stone keeps its color and cut, ' +
    'painted surfaces keep their exact paint color, tiles keep their size and ' +
    'grid. Add ONLY photographic realism: real micro-texture, grain, ' +
    'reflectance and light response. Never swap a material for a similar one, ' +
    'never recolor, never invent veining or patterns that contradict the ' +
    'reference, never "upgrade" a finish. '
  )
}

// Bloco de escalada — só em retries (attempt >= 2), quando o geometry score da
// tentativa anterior ficou abaixo do limite. Reforça o modo "trace, not
// inspiration" sem revelar ao modelo que houve uma tentativa anterior ruim
// (ele não a vê — o frame é de prioridade absoluta, não de correção).
export function buildRenderOnlyEscalation(attempt: number): string {
  if (attempt <= 1) return ''
  return (
    'ABSOLUTE STRUCTURAL PRIORITY: treat the reference as a fixed template that you TRACE, never as inspiration. ' +
    'This pass is a pure re-texturing and relighting of the existing geometry — as if projecting new materials ' +
    'and light onto the exact scene. Reproduce the position, size and outline of every wall, opening, cabinet, ' +
    'counter, furniture piece and equipment with zero deviation. When in doubt between beauty and accuracy, ' +
    'always choose accuracy to the reference. '
  )
}

// Condicionamento estrutural: quando o retry anexa o edge map (lineart
// extraído do original) como imagem extra, este bloco explica o papel dela.
// imageIndex é 1-based, na ordem de image_urls.
export function buildEdgeMapBlock(imageIndex: number | null | undefined): string {
  if (!imageIndex) return ''
  return (
    `STRUCTURAL CONSTRAINT MAP: image #${imageIndex} is an automatically extracted edge/line map of the ` +
    'reference geometry. It is a CONSTRAINT, not content: every architectural edge, opening contour and object ' +
    'silhouette of your output must align with this map exactly — same positions, same sizes, same perspective ' +
    'and vanishing points. Do NOT imitate its graphic style: the output is a photograph whose underlying ' +
    'structure matches these lines. '
  )
}

// Direção fotográfica (fecho do prompt). Mesma lógica histórica do
// buildCameraBlock nível maximum.
export function buildRenderOnlyCameraBlock(hasAnchor: boolean): string {
  if (hasAnchor) {
    return ', high quality photorealistic image, sharp focus, no compression artifacts'
  }
  return ', photorealistic architectural photograph of this exact scene — render the surfaces with real-world physically-based materials and natural micro-texture, realistic light transport with soft natural shadows, ambient occlusion and global illumination, accurate reflections and refraction on glass and water, true-to-life sky and vegetation, subtle depth of field, sharp focus. It must read as a real DSLR photograph, NOT a flat CGI / 3D / SketchUp render. Keep every material, color and finish exactly as shown — only their real-world rendering and lighting become photographic, never the design.'
}

// ── Cabeça do system prompt (aplicada ANTES dos blocos do usuário) ────────────

export interface RenderOnlyHeadOpts {
  projectNoun: 'building' | 'space'
  hasAnchor: boolean
  /** 1-based; >= 2 liga o bloco de escalada do retry. */
  attempt?: number
}

export function buildRenderOnlySystemHead(opts: RenderOnlyHeadOpts): string {
  const attempt = opts.attempt ?? 1
  return (
    buildIntent(opts.projectNoun, opts.hasAnchor) +
    buildContract() +
    buildRenderOnlyEscalation(attempt) +
    buildGeometryLock(opts.hasAnchor) +
    buildTextureLock(opts.hasAnchor)
  )
}

// ── Ladder de parâmetros por tentativa ────────────────────────────────────────
//
// "Menor força de edição + mais guidance" traduzido pros providers reais
// (revisado 2026-08-17 contra os docs do Gemini 3 + telemetria de prod):
//   - GCP/Vertex (Gemini 3 Image): a escalada é por CONDICIONAMENTO — edge
//     map, mediaResolution dos inputs (high → ultra_high) e thinking do NB2.
//     A temperatura fica FIXA em 0.2: o guia do Gemini 3 desaconselha
//     temperatura muito baixa (looping/comportamento degradado) e a telemetria
//     (35 retries até ago/2026: Δscore médio +0.04, 20/35 sem melhora) mostrou
//     que 0.05/0 não recuperava o score.
//   - FAL nano-banana-2 (fallback do Pulsar): o schema ganhou thinking_level e
//     seed (conferido 2026-08-17) — ambos vão no falInput, então o fallback
//     acompanha. Sem knobs de guidance/strength.
//   - FAL nano-banana-pro: seed no schema; thinking é sempre-ligado (sem knob).
//   - FAL seedream/v5/pro/edit (Quasar): sem knobs (schema verificado 2026-09-04) — o
//     reforço é prompt de escalada + edge map.

export interface FidelityAttemptParams {
  /** Temperatura do caminho GCP/Vertex (ignorada pela FAL). Fixa em 0.2 em
   *  todas as tentativas — ver nota do ladder acima. */
  temperature: number
  /** Anexa o edge map do original como imagem de condicionamento estrutural. */
  useEdgeMap: boolean
  /** NB2: thinking 'high' planeja a cena antes de gerar e adere melhor ao
   *  contrato de preservação (default de fábrica do modelo é 'minimal').
   *  Vai nos DOIS caminhos (falInput.thinking_level + thinkingConfig no GCP).
   *  null = kill-switch IMAGE_NB2_THINKING_LEVEL=off. */
  thinkingLevel: Nb2ThinkingLevel | null
  /** Tokenização dos INPUTS no caminho GCP: 'high' na 1ª tentativa,
   *  'ultra_high' nos retries (mais tokens = o modelo enxerga mais detalhe
   *  fino da referência). null = IMAGE_INPUT_MEDIA_RESOLUTION=off. */
  mediaResolution: InputMediaResolution | null
  /** Offset determinístico da seed. Tentativa 3+ desloca a amostra (mantendo
   *  reprodutibilidade): se dois passes de condicionamento não corrigiram o
   *  drift, a amostra é a variável que resta. */
  seedOffset: number
}

export interface FidelityAttemptOpts {
  /** Edge map já na 1ª tentativa (Fase 3): pra input CGI sem âncora, ancorar a
   *  estrutura desde o primeiro shot evita gastar o retry com drift previsível.
   *  Custo zero (sharp local + 1 upload). A telemetria (edge_map_used por
   *  tentativa em generation_log.fidelity.attempts) permite A/B por período. */
  edgeFromFirstAttempt?: boolean
}

export function getFidelityAttemptParams(
  attempt: number,
  opts?: FidelityAttemptOpts,
): FidelityAttemptParams {
  const thinkingLevel = nb2ThinkingLevel()
  const mediaDefault = inputMediaResolutionDefault()
  // Retries escalam a tokenização pra ULTRA_HIGH (só por parte existe esse
  // nível); 'off' desliga tudo, inclusive a escalada.
  const mediaResolution: InputMediaResolution | null =
    mediaDefault === null ? null : attempt >= 2 ? 'ultra_high' : mediaDefault
  if (attempt <= 1) {
    return { temperature: 0.2, useEdgeMap: opts?.edgeFromFirstAttempt ?? false, thinkingLevel, mediaResolution, seedOffset: 0 }
  }
  if (attempt === 2) {
    return { temperature: 0.2, useEdgeMap: true, thinkingLevel, mediaResolution, seedOffset: 0 }
  }
  return { temperature: 0.2, useEdgeMap: true, thinkingLevel, mediaResolution, seedOffset: 1 }
}

// Condicionamento por DEPTH MAP (Fase 3, experimental — default OFF): edges
// seguram contornos; depth segura VOLUMES e perspectiva (o vetor "pontos de
// fuga" pontua 0.564 e passa no gate default). Liga com
// RENDER_FIDELITY_DEPTH_MAP=1; endpoint FAL configurável por env.
export function depthMapConditioningEnabled(): boolean {
  return process.env.RENDER_FIDELITY_DEPTH_MAP === '1'
}

export function depthMapEndpoint(): string {
  return process.env.RENDER_DEPTH_ENDPOINT?.trim() || 'fal-ai/image-preprocessors/depth-anything/v2'
}

/** Bloco de prompt do depth map (imageIndex 1-based em image_urls). */
export function buildDepthMapBlock(imageIndex: number | null | undefined): string {
  if (!imageIndex) return ''
  return (
    `DEPTH CONSTRAINT MAP: image #${imageIndex} is the monocular depth map of the reference ` +
    '(bright = near, dark = far). It is a CONSTRAINT, not content: the spatial layout, volume ' +
    'placement, perspective and vanishing points of your output must match this depth structure ' +
    'exactly. Do NOT render the map itself — the output is a photograph whose 3D structure matches it. '
  )
}

// ── Config do gate (envs com defaults) ────────────────────────────────────────
//
//   RENDER_FIDELITY_GATE         '0' desliga validação+retry (rollback rápido)
//   RENDER_FIDELITY_MIN_SCORE    limite do geometry score (default 0.50 —
//                                conservador: pega drift grosseiro de câmera/
//                                layout sem re-gerar renders saudáveis; subir
//                                gradualmente com dados reais de produção)
//   RENDER_FIDELITY_MAX_ATTEMPTS total de tentativas (default 2, cap 3)

export interface RenderFidelityConfig {
  enabled: boolean
  minScore: number
  maxAttempts: number
  /** Fator de relaxamento do limite quando há refinementText (mudança local
   *  legítima pedida pelo usuário reduz o score sem ser drift). */
  refinementRelaxFactor: number
  /** Edge map já na 1ª tentativa para input sem âncora (kill-switch:
   *  RENDER_FIDELITY_EDGE_FIRST=0). */
  edgeFirst: boolean
  /** Gate opcional de drift de cor/material (ΔE Lab da pior célula da grade).
   *  null = só telemetria. Setar RENDER_FIDELITY_MAX_COLOR_DELTA (ex. 18) pra
   *  reprovar recolor localizado; só se aplica quando o usuário NÃO pediu
   *  mudança de luz/material/refinamento (a rota decide). */
  maxColorDelta: number | null
}

export function getRenderFidelityConfig(): RenderFidelityConfig {
  const rawScore = Number(process.env.RENDER_FIDELITY_MIN_SCORE)
  const rawAttempts = Number(process.env.RENDER_FIDELITY_MAX_ATTEMPTS)
  const rawColor = Number(process.env.RENDER_FIDELITY_MAX_COLOR_DELTA)
  return {
    enabled: process.env.RENDER_FIDELITY_GATE !== '0',
    minScore: Number.isFinite(rawScore) && rawScore > 0 && rawScore < 1 ? rawScore : 0.5,
    maxAttempts: Number.isFinite(rawAttempts) && rawAttempts >= 1 ? Math.min(Math.floor(rawAttempts), 3) : 2,
    refinementRelaxFactor: 0.85,
    edgeFirst: process.env.RENDER_FIDELITY_EDGE_FIRST !== '0',
    maxColorDelta: Number.isFinite(rawColor) && rawColor > 0 ? rawColor : null,
  }
}
