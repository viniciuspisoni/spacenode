// lib/finalizar/composition.ts — fábrica, defaults, migração v1→v2 e
// (de)serialização do documento do Finalizar.
//
// Sem dependências de DOM: roda no servidor (validação) e no cliente.

import {
  HSL_BANDS,
  MAX_ELEMENTS,
  MAX_LOCAL_ADJUSTMENTS,
  MAX_SNAPSHOTS,
  type Adjustments,
  type BlendMode,
  type ColorGrading,
  type ColorMatch,
  type CurvePoint,
  type ElementCategory,
  type ElementLayer,
  type ElementTransform,
  type FinalizeDoc,
  type Geometry,
  type GradeWheel,
  type HslAdjust,
  type HslMap,
  type LegacyCompositionV1,
  type LocalAdjustValues,
  type LocalAdjustment,
  type MaskShape,
  type MaskStroke,
  type ProjectVersion,
  type Vignette,
} from './types'

/** id curto e estável o suficiente para chaves (sem libs externas). */
export function makeId(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 7)}`
}

// ── Defaults (0 = identidade em tudo) ────────────────────────────────────────

export function defaultAdjustments(): Adjustments {
  return {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temperature: 0, tint: 0, saturation: 0, vibrance: 0,
    clarity: 0, sharpen: 0, noiseReduction: 0,
  }
}

export function defaultLocalValues(): LocalAdjustValues {
  return {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, saturation: 0, clarity: 0, sharpness: 0,
  }
}

export function defaultVignette(): Vignette {
  return { amount: 0, size: 50, feather: 60 }
}

export function defaultCurve(): CurvePoint[] {
  return [{ x: 0, y: 0 }, { x: 1, y: 1 }]
}

export function defaultHsl(): HslMap {
  const map = {} as HslMap
  for (const band of HSL_BANDS) map[band] = { hue: 0, sat: 0, lum: 0 }
  return map
}

export function defaultGrading(): ColorGrading {
  return {
    shadows: { hue: 220, sat: 0, lum: 0 },
    midtones: { hue: 0, sat: 0, lum: 0 },
    highlights: { hue: 45, sat: 0, lum: 0 },
    blending: 50,
    balance: 0,
  }
}

export function defaultGeometry(): Geometry {
  return { rotate: 0, perspV: 0, perspH: 0, lens: 0, crop: null, aspect: null }
}

export function newLocalAdjustment(shape: MaskShape, name: string): LocalAdjustment {
  return {
    id: makeId('m'),
    name,
    enabled: true,
    invert: false,
    shape,
    strokes: [],
    values: defaultLocalValues(),
    feather: 0,
    density: 100,
  }
}

interface NewElementInput {
  url: string
  name: string
  category?: ElementCategory
  /** Largura inicial como fração do canvas (1 = largura toda). */
  width?: number
}

export function newElementLayer({ url, name, category = 'imagem', width = 1 }: NewElementInput): ElementLayer {
  return {
    id: makeId('e'),
    name,
    url,
    category,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0.5, y: 0.5, width, rotation: 0, flipH: false, flipV: false },
    feather: 0,
    maskFill: 'full',
    maskStrokes: [],
    maskUrl: null,
    colorMatch: null,
  }
}

/** Cria um documento novo a partir da imagem base e suas dimensões naturais. */
export function createDocument(baseUrl: string, width: number, height: number): FinalizeDoc {
  return {
    version: 2,
    width,
    height,
    baseUrl,
    originalBaseUrl: baseUrl,
    geometry: defaultGeometry(),
    adjust: defaultAdjustments(),
    vignette: defaultVignette(),
    curve: defaultCurve(),
    hsl: defaultHsl(),
    grading: defaultGrading(),
    colorMatch: null,
    locals: [],
    elements: [],
    versions: [],
    treatmentAmount: 100,
    snapshots: [],
  }
}

// ── Identidade (para saber se há algo a renderizar/exibir) ──────────────────

export function isAdjustIdentity(a: Adjustments): boolean {
  return Object.values(a).every((v) => v === 0)
}

export function isCurveIdentity(curve: CurvePoint[]): boolean {
  return curve.length === 2
    && curve[0].x === 0 && curve[0].y === 0
    && curve[1].x === 1 && curve[1].y === 1
}

export function isGeometryIdentity(g: Geometry): boolean {
  return g.rotate === 0 && g.perspV === 0 && g.perspH === 0 && g.lens === 0
}

// ── Sanitização / migração ───────────────────────────────────────────────────

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(min, Math.min(max, n))
}
const clamp01 = (v: unknown, fallback = 0) => num(v, fallback, 0, 1)

const BLEND_IDS: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'lighten', 'darken']
const sanitizeBlend = (v: unknown): BlendMode => (BLEND_IDS.includes(v as BlendMode) ? (v as BlendMode) : 'normal')

function sanitizeAdjustments(raw: unknown): Adjustments {
  const a = (raw ?? {}) as Partial<Adjustments>
  return {
    exposure: num(a.exposure, 0, -100, 100),
    contrast: num(a.contrast, 0, -100, 100),
    highlights: num(a.highlights, 0, -100, 100),
    shadows: num(a.shadows, 0, -100, 100),
    whites: num(a.whites, 0, -100, 100),
    blacks: num(a.blacks, 0, -100, 100),
    temperature: num(a.temperature, 0, -100, 100),
    tint: num(a.tint, 0, -100, 100),
    saturation: num(a.saturation, 0, -100, 100),
    vibrance: num(a.vibrance, 0, -100, 100),
    clarity: num(a.clarity, 0, -100, 100),
    sharpen: num(a.sharpen, 0, 0, 100),
    noiseReduction: num(a.noiseReduction, 0, 0, 100),
  }
}

function sanitizeLocalValues(raw: unknown): LocalAdjustValues {
  const a = (raw ?? {}) as Partial<LocalAdjustValues>
  return {
    exposure: num(a.exposure, 0, -100, 100),
    contrast: num(a.contrast, 0, -100, 100),
    highlights: num(a.highlights, 0, -100, 100),
    shadows: num(a.shadows, 0, -100, 100),
    temperature: num(a.temperature, 0, -100, 100),
    tint: num(a.tint, 0, -100, 100),
    saturation: num(a.saturation, 0, -100, 100),
    clarity: num(a.clarity, 0, -100, 100),
    sharpness: num(a.sharpness, 0, -100, 100),
  }
}

const MAX_STROKES_PER_MASK = 240
const MAX_POINTS_PER_STROKE = 1500

function sanitizeStrokes(raw: unknown): MaskStroke[] {
  if (!Array.isArray(raw)) return []
  const out: MaskStroke[] = []
  for (const s of raw.slice(-MAX_STROKES_PER_MASK)) {
    if (!s || !Array.isArray((s as MaskStroke).points)) continue
    const points = (s as MaskStroke).points
      .slice(0, MAX_POINTS_PER_STROKE)
      .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
      .map((p) => ({ x: num(p.x, 0, -0.5, 1.5), y: num(p.y, 0, -0.5, 1.5) }))
    if (points.length === 0) continue
    out.push({
      points,
      sizeImagePx: num((s as MaskStroke).sizeImagePx, 80, 1, 4000),
      hardness: clamp01((s as MaskStroke).hardness, 0.5),
      flow: clamp01((s as MaskStroke).flow, 1),
      erase: Boolean((s as MaskStroke).erase),
    })
  }
  return out
}

/** Enxuga um traço recém-desenhado para persistência: arredonda a 4 casas e
 *  descarta pontos praticamente coincidentes (jsonb enxuto sem perda visual). */
export function compactStroke(stroke: MaskStroke): MaskStroke {
  const minDist = 0.0015
  const pts: { x: number; y: number }[] = []
  for (const p of stroke.points) {
    const last = pts[pts.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) continue
    pts.push({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 })
  }
  if (pts.length === 0 && stroke.points.length > 0) {
    const p = stroke.points[0]
    pts.push({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 })
  }
  return { ...stroke, points: pts.slice(0, MAX_POINTS_PER_STROKE) }
}

function sanitizeShape(raw: unknown): MaskShape {
  const s = (raw ?? {}) as { kind?: string } & Record<string, unknown>
  switch (s.kind) {
    case 'linear':
      return {
        kind: 'linear',
        x0: num(s.x0, 0.5, -1, 2), y0: num(s.y0, 0, -1, 2),
        x1: num(s.x1, 0.5, -1, 2), y1: num(s.y1, 0.5, -1, 2),
      }
    case 'radial':
      return {
        kind: 'radial',
        cx: num(s.cx, 0.5, -1, 2), cy: num(s.cy, 0.5, -1, 2),
        rx: num(s.rx, 0.25, 0.01, 2), ry: num(s.ry, 0.25, 0.01, 2),
        feather: clamp01(s.feather, 0.5),
      }
    case 'luminosity':
      return {
        kind: 'luminosity',
        min: clamp01(s.min, 0.7), max: clamp01(s.max, 1),
        smooth: clamp01(s.smooth, 0.15),
      }
    case 'sky':
      return { kind: 'sky', bakedUrl: typeof s.bakedUrl === 'string' ? s.bakedUrl : null }
    default:
      return { kind: 'brush' }
  }
}

function sanitizeLocal(raw: unknown, i: number): LocalAdjustment {
  const l = (raw ?? {}) as Partial<LocalAdjustment>
  return {
    id: typeof l.id === 'string' ? l.id : makeId('m'),
    name: typeof l.name === 'string' && l.name.trim() ? l.name : `Máscara ${i + 1}`,
    enabled: l.enabled !== false,
    invert: Boolean(l.invert),
    shape: sanitizeShape(l.shape),
    strokes: sanitizeStrokes(l.strokes),
    values: sanitizeLocalValues(l.values),
    feather: num(l.feather, 0, 0, 250),
    density: num(l.density, 100, 0, 100),
  }
}

function sanitizeTransform(raw: unknown): ElementTransform {
  const t = (raw ?? {}) as Partial<ElementTransform>
  return {
    x: num(t.x, 0.5, -1, 2),
    y: num(t.y, 0.5, -1, 2),
    width: num(t.width, 1, 0.01, 4),
    rotation: num(t.rotation, 0, -360, 360),
    flipH: Boolean(t.flipH),
    flipV: Boolean(t.flipV),
  }
}

const ELEMENT_CATEGORY_IDS: ElementCategory[] = ['imagem', 'ceu', 'vegetacao', 'pessoas', 'veiculos', 'logo']

function sanitizeElement(raw: unknown, i: number): ElementLayer | null {
  const e = (raw ?? {}) as Partial<ElementLayer>
  if (typeof e.url !== 'string' || !e.url) return null
  const cm = e.colorMatch
  const tri = (arr: unknown, fb: number, lo: number, hi: number): [number, number, number] => {
    const a = Array.isArray(arr) ? arr : []
    return [num(a[0], fb, lo, hi), num(a[1], fb, lo, hi), num(a[2], fb, lo, hi)]
  }
  return {
    id: typeof e.id === 'string' ? e.id : makeId('e'),
    name: typeof e.name === 'string' && e.name.trim() ? e.name : `Elemento ${i + 1}`,
    url: e.url,
    category: ELEMENT_CATEGORY_IDS.includes(e.category as ElementCategory) ? (e.category as ElementCategory) : 'imagem',
    visible: e.visible !== false,
    opacity: clamp01(e.opacity, 1),
    blendMode: sanitizeBlend(e.blendMode),
    transform: sanitizeTransform(e.transform),
    feather: num(e.feather, 0, 0, 200),
    maskFill: e.maskFill === 'empty' ? 'empty' : 'full',
    maskStrokes: sanitizeStrokes(e.maskStrokes),
    maskUrl: typeof e.maskUrl === 'string' ? e.maskUrl : null,
    colorMatch: cm && typeof cm === 'object' && Array.isArray((cm as { gain?: unknown }).gain)
      ? {
          gain: tri((cm as { gain: unknown }).gain, 1, 0.25, 4),
          offset: tri((cm as { offset?: unknown }).offset, 0, -0.5, 0.5),
          amount: num((cm as { amount?: unknown }).amount, 70, 0, 100),
        }
      : null,
  }
}

function sanitizeCurve(raw: unknown): CurvePoint[] {
  if (!Array.isArray(raw)) return defaultCurve()
  const pts = raw
    .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x)
  if (pts.length < 2) return defaultCurve()
  return pts.slice(0, 16)
}

function sanitizeWheel(raw: unknown, fallbackHue: number): GradeWheel {
  const w = (raw ?? {}) as Partial<GradeWheel>
  return {
    hue: num(w.hue, fallbackHue, 0, 360),
    sat: num(w.sat, 0, 0, 100),
    lum: num(w.lum, 0, -100, 100),
  }
}

function sanitizeGrading(raw: unknown): ColorGrading {
  const g = (raw ?? {}) as Partial<ColorGrading>
  return {
    shadows: sanitizeWheel(g.shadows, 220),
    midtones: sanitizeWheel(g.midtones, 0),
    highlights: sanitizeWheel(g.highlights, 45),
    blending: num(g.blending, 50, 0, 100),
    balance: num(g.balance, 0, -100, 100),
  }
}

function sanitizeHsl(raw: unknown): HslMap {
  const src = (raw ?? {}) as Partial<Record<string, Partial<HslAdjust>>>
  const map = {} as HslMap
  for (const band of HSL_BANDS) {
    const b = src[band] ?? {}
    map[band] = {
      hue: num(b.hue, 0, -100, 100),
      sat: num(b.sat, 0, -100, 100),
      lum: num(b.lum, 0, -100, 100),
    }
  }
  return map
}

function sanitizeGeometry(raw: unknown): Geometry {
  const g = (raw ?? {}) as Partial<Geometry>
  const c = g.crop as Partial<Geometry['crop']> | null | undefined
  const crop = c && typeof c === 'object'
    ? {
        x: clamp01(c.x), y: clamp01(c.y),
        w: num(c.w, 1, 0.02, 1), h: num(c.h, 1, 0.02, 1),
      }
    : null
  return {
    rotate: num(g.rotate, 0, -45, 45),
    perspV: num(g.perspV, 0, -100, 100),
    perspH: num(g.perspH, 0, -100, 100),
    lens: num(g.lens, 0, -100, 100),
    crop,
    aspect: typeof g.aspect === 'string' ? g.aspect : null,
  }
}

function sanitizeColorMatch(raw: unknown): ColorMatch | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<ColorMatch>
  if (!Array.isArray(m.gain) || !Array.isArray(m.offset)) return null
  const tri = (arr: unknown[], fb: number, lo: number, hi: number): [number, number, number] => [
    num(arr[0], fb, lo, hi), num(arr[1], fb, lo, hi), num(arr[2], fb, lo, hi),
  ]
  return {
    gain: tri(m.gain, 1, 0.25, 4),
    offset: tri(m.offset, 0, -0.5, 0.5),
    amount: num(m.amount, 60, 0, 100),
    refThumbUrl: typeof m.refThumbUrl === 'string' ? m.refThumbUrl : null,
  }
}

function sanitizeVersions(raw: unknown): ProjectVersion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is ProjectVersion => Boolean(v && typeof (v as ProjectVersion).url === 'string'))
    .map((v) => ({
      url: v.url,
      name: typeof v.name === 'string' ? v.name : 'Versão',
      format: (v.format === 'jpg' || v.format === 'webp' ? v.format : 'png') as ProjectVersion['format'],
      width: num(v.width, 0, 0, 100000),
      height: num(v.height, 0, 0, 100000),
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date(0).toISOString(),
      summary: typeof v.summary === 'string' ? v.summary : '',
    }))
    .slice(-100) // mantém as MAIS RECENTES (novas entram no fim)
}

/** Migra um documento v1 (composição por camadas) para o modelo v2. */
export function migrateV1(v1: LegacyCompositionV1): FinalizeDoc {
  const base = v1.layers.find((l) => l.isBase) ?? v1.layers[0]
  const doc = createDocument(base?.url ?? '', v1.width || 1024, v1.height || 1024)
  doc.elements = v1.layers
    .filter((l) => l !== base && typeof l.url === 'string')
    .map((l, i) => ({
      id: typeof l.id === 'string' ? l.id : makeId('e'),
      name: typeof l.name === 'string' ? l.name : `Camada ${i + 1}`,
      url: l.url,
      category: 'imagem' as ElementCategory,
      visible: l.visible !== false,
      opacity: clamp01(l.opacity, 1),
      blendMode: sanitizeBlend(l.blendMode),
      // Camada v1 cobre o canvas inteiro.
      transform: { x: 0.5, y: 0.5, width: 1, rotation: 0, flipH: false, flipV: false },
      feather: num(l.feather, 0, 0, 200),
      maskFill: l.maskFill === 'empty' ? 'empty' : 'full',
      maskStrokes: [],
      maskUrl: typeof l.maskUrl === 'string' ? l.maskUrl : null,
      colorMatch: null,
    }))
  return doc
}

/** Normaliza/valida um document vindo do banco para o formato corrente.
 *  Aceita v1 (migra) e v2. Retorna null se irrecuperável. */
export function deserializeDocument(raw: unknown): FinalizeDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as { version?: number; layers?: unknown; baseUrl?: unknown }

  if (doc.version === 1 || (Array.isArray(doc.layers) && typeof doc.baseUrl !== 'string')) {
    const v1 = doc as unknown as LegacyCompositionV1
    if (!Array.isArray(v1.layers) || v1.layers.length === 0) return null
    const withUrl = v1.layers.filter((l) => l && typeof l.url === 'string' && l.url.length > 0)
    if (withUrl.length === 0) return null
    const migrated = migrateV1({ ...v1, layers: withUrl })
    // Base sem URL utilizável → irrecuperável (o editor cai no base_image_url).
    if (!migrated.baseUrl) return null
    return migrated
  }

  const d = doc as Partial<FinalizeDoc>
  if (typeof d.baseUrl !== 'string' || !d.baseUrl) return null

  return {
    version: 2,
    width: num(d.width, 1024, 1, 100000),
    height: num(d.height, 1024, 1, 100000),
    baseUrl: d.baseUrl,
    originalBaseUrl: typeof d.originalBaseUrl === 'string' && d.originalBaseUrl ? d.originalBaseUrl : d.baseUrl,
    geometry: sanitizeGeometry(d.geometry),
    adjust: sanitizeAdjustments(d.adjust),
    vignette: {
      amount: num((d.vignette as Partial<Vignette> | undefined)?.amount, 0, -100, 100),
      size: num((d.vignette as Partial<Vignette> | undefined)?.size, 50, 0, 100),
      feather: num((d.vignette as Partial<Vignette> | undefined)?.feather, 60, 0, 100),
    },
    curve: sanitizeCurve(d.curve),
    hsl: sanitizeHsl(d.hsl),
    grading: sanitizeGrading(d.grading),
    colorMatch: sanitizeColorMatch(d.colorMatch),
    locals: Array.isArray(d.locals) ? d.locals.slice(0, MAX_LOCAL_ADJUSTMENTS).map(sanitizeLocal) : [],
    elements: Array.isArray(d.elements)
      ? d.elements.map(sanitizeElement).filter((e): e is ElementLayer => e !== null).slice(0, MAX_ELEMENTS)
      : [],
    versions: sanitizeVersions(d.versions),
    treatmentAmount: num(d.treatmentAmount, 100, 0, 100),
    snapshots: sanitizeSnapshots(d.snapshots),
  }
}

/** Snapshots: cada um carrega um doc completo com snapshots INTERNOS zerados
 *  (sem recursão). Inválidos são descartados. */
function sanitizeSnapshots(raw: unknown): FinalizeDoc['snapshots'] {
  if (!Array.isArray(raw)) return []
  const out: FinalizeDoc['snapshots'] = []
  for (const s of raw.slice(0, MAX_SNAPSHOTS)) {
    if (!s || typeof s !== 'object') continue
    const snap = s as { id?: unknown; name?: unknown; createdAt?: unknown; doc?: unknown }
    if (typeof snap.name !== 'string' || !snap.doc || typeof snap.doc !== 'object') continue
    const innerRaw = { ...(snap.doc as Record<string, unknown>), snapshots: [] }
    const inner = deserializeDocument(innerRaw)
    if (!inner) continue
    out.push({
      id: typeof snap.id === 'string' ? snap.id : makeId('s'),
      name: snap.name.slice(0, 60),
      createdAt: typeof snap.createdAt === 'string' ? snap.createdAt : new Date(0).toISOString(),
      doc: inner,
    })
  }
  return out
}

/** Documento para gravar — passa pelo sanitizador (garante shape canônico). */
export function serializeDocument(doc: FinalizeDoc): FinalizeDoc {
  const clean = deserializeDocument(doc)
  if (!clean) throw new Error('Documento inválido')
  return clean
}
