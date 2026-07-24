// lib/marketing/ads/naming.ts
//
// Identificadores únicos de campanha/anúncio + UTMs padronizados.
//
// Convenção de identificador (matriz de experimentação):
//   Campanha:  SN_{CANAL}_{OBJETIVO}_{PERSONA}
//   Conjunto:  SN_{CANAL}_{OBJETIVO}_{PERSONA}_{PUBLICO}
//   Anúncio:   SN_{CANAL}_{OBJETIVO}_{PERSONA}_{PROMESSA}_{CRIATIVO}_{COPY}
//   Ex.: SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY02
//
// O identificador do anúncio vira utm_content (minúsculo) — é a chave que
// liga clique → cadastro → assinatura em marketing.acquisition_events.
// Módulo puro (zero imports) — testável em tests/marketing-ads/.

export const IDENTIFIER_PREFIX = 'SN'

/** Normaliza um segmento: maiúsculas ASCII, sem acento, [A-Z0-9] apenas. */
export function sanitizeSegment(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

export interface AdIdentifierParts {
  channel: string    // META | GOOGLE | IG …
  objective: string  // PROSPECCAO | REMARKETING | CONVERSAO | DEMONSTRACAO …
  persona: string    // ARQUITETO | DESIGNER | ESCRITORIO …
  promise?: string   // FIDELIDADE | PRAZO | APRESENTACAO …
  creative?: string  // VIDEO01 | IMG03 …
  copy?: string      // COPY01 | COPY02 …
}

/** Monta o identificador. Segmentos vazios são omitidos (campanha usa só os 3
 *  primeiros). Lança se canal/objetivo/persona faltarem. */
export function buildIdentifier(parts: AdIdentifierParts): string {
  const required = [parts.channel, parts.objective, parts.persona].map(s => sanitizeSegment(s ?? ''))
  if (required.some(s => !s)) {
    throw new Error('Identificador exige canal, objetivo e persona')
  }
  const optional = [parts.promise, parts.creative, parts.copy]
    .map(s => (s ? sanitizeSegment(s) : ''))
    .filter(Boolean)
  return [IDENTIFIER_PREFIX, ...required, ...optional].join('_')
}

/** Interpreta um identificador SN_*. Retorna null se não seguir a convenção. */
export function parseIdentifier(identifier: string): AdIdentifierParts | null {
  const segments = identifier.trim().toUpperCase().split('_').filter(Boolean)
  if (segments.length < 4 || segments[0] !== IDENTIFIER_PREFIX) return null
  const [, channel, objective, persona, promise, creative, copy] = segments
  if (!channel || !objective || !persona) return null
  return { channel, objective, persona, promise, creative, copy }
}

export function isValidIdentifier(identifier: string): boolean {
  return parseIdentifier(identifier) !== null
}

// ── UTMs padronizados ──────────────────────────────────────────────────────────
//
// utm_source  = canal (meta | google | instagram …)
// utm_medium  = paid_social | cpc | remarketing (derivado de canal+objetivo)
// utm_campaign= identificador da CAMPANHA em minúsculas
// utm_content = identificador do ANÚNCIO em minúsculas (chave de atribuição)
// utm_term    = persona/público (opcional)

export interface UtmParams {
  source: string
  medium: string
  campaign: string
  content?: string
  term?: string
}

/** utm_source por slug de canal (marketing.ad_channels.slug). */
const CHANNEL_UTM_SOURCE: Record<string, string> = {
  meta: 'meta',
  google_ads: 'google',
  instagram: 'instagram',
  linkedin_ads: 'linkedin',
  tiktok_ads: 'tiktok',
}

/** utm_medium por canal, com remarketing sobrepondo. */
function utmMedium(channelSlug: string, objective?: string | null): string {
  if (objective && objective.toLowerCase().includes('remarketing')) return 'remarketing'
  if (channelSlug === 'google_ads') return 'cpc'
  return 'paid_social'
}

export interface BuildUtmInput {
  channelSlug: string
  campaignIdentifier: string
  adIdentifier?: string | null
  objective?: string | null
  persona?: string | null
}

export function buildUtmParams(input: BuildUtmInput): UtmParams {
  const source = CHANNEL_UTM_SOURCE[input.channelSlug] ?? sanitizeSegment(input.channelSlug).toLowerCase()
  const utm: UtmParams = {
    source: source || 'other',
    medium: utmMedium(input.channelSlug, input.objective),
    campaign: input.campaignIdentifier.trim().toLowerCase(),
  }
  if (input.adIdentifier) utm.content = input.adIdentifier.trim().toLowerCase()
  if (input.persona) utm.term = sanitizeSegment(input.persona).toLowerCase()
  return utm
}

/** Acrescenta os UTMs a uma URL (preservando query existente). URLs relativas
 *  são resolvidas contra https://spacenode.app. */
export function appendUtmToUrl(url: string, utm: UtmParams): string {
  const base = 'https://spacenode.app'
  const u = new URL(url, base)
  u.searchParams.set('utm_source', utm.source)
  u.searchParams.set('utm_medium', utm.medium)
  u.searchParams.set('utm_campaign', utm.campaign)
  if (utm.content) u.searchParams.set('utm_content', utm.content)
  if (utm.term) u.searchParams.set('utm_term', utm.term)
  return u.toString()
}

// ── Atribuição first-party (cookie sn_attribution) ─────────────────────────────

export const ATTRIBUTION_COOKIE = 'sn_attribution'
export const ATTRIBUTION_COOKIE_MAX_AGE_DAYS = 90

/** Shape persistido no cookie first-party (sem qualquer dado pessoal —
 *  apenas parâmetros da URL de chegada + timestamps). */
export interface AttributionSnapshot {
  /** Último toque (sempre atualizado quando chegam UTMs novos). */
  last: AttributionTouch
  /** Primeiro toque (gravado uma vez, nunca sobrescrito). */
  first?: AttributionTouch
}

export interface AttributionTouch {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  /** Click ids das plataformas (first-party: só armazenamos o valor que veio na URL). */
  gclid?: string
  fbclid?: string
  referrer?: string
  landing_path?: string
  at: string  // ISO
}

const TOUCH_KEYS = [
  'source', 'medium', 'campaign', 'content', 'term',
  'gclid', 'fbclid', 'referrer', 'landing_path', 'at',
] as const

const MAX_FIELD_LEN = 300

function cleanTouch(raw: unknown): AttributionTouch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const touch: Partial<Record<(typeof TOUCH_KEYS)[number], string>> = {}
  for (const k of TOUCH_KEYS) {
    const v = o[k]
    if (typeof v === 'string' && v.length > 0) touch[k] = v.slice(0, MAX_FIELD_LEN)
  }
  if (!touch.at) return null
  return touch as AttributionTouch
}

/** Faz o parse defensivo do valor do cookie (conteúdo controlado pelo browser —
 *  nunca confiar). Retorna null para qualquer coisa fora do shape. */
export function parseAttributionCookie(value: string | undefined | null): AttributionSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>
    const last = cleanTouch(parsed.last)
    if (!last) return null
    const first = cleanTouch(parsed.first)
    return first ? { last, first } : { last }
  } catch {
    return null
  }
}

/** Extrai um toque de atribuição dos parâmetros da URL atual. Retorna null se
 *  não houver nenhum parâmetro de campanha (não gravamos cookie à toa). */
export function touchFromSearchParams(
  params: URLSearchParams,
  ctx: { referrer?: string; path?: string; now: string },
): AttributionTouch | null {
  const get = (k: string) => {
    const v = params.get(k)
    return v ? v.slice(0, MAX_FIELD_LEN) : undefined
  }
  const touch: AttributionTouch = {
    source: get('utm_source'),
    medium: get('utm_medium'),
    campaign: get('utm_campaign'),
    content: get('utm_content'),
    term: get('utm_term'),
    gclid: get('gclid'),
    fbclid: get('fbclid'),
    at: ctx.now,
  }
  const hasSignal = Boolean(
    touch.source || touch.medium || touch.campaign || touch.content || touch.gclid || touch.fbclid,
  )
  if (!hasSignal) return null
  if (ctx.referrer) touch.referrer = ctx.referrer.slice(0, MAX_FIELD_LEN)
  if (ctx.path) touch.landing_path = ctx.path.slice(0, MAX_FIELD_LEN)
  return touch
}

/** Combina o snapshot existente com um novo toque (last-touch, preservando o
 *  primeiro). */
export function mergeAttribution(
  existing: AttributionSnapshot | null,
  touch: AttributionTouch,
): AttributionSnapshot {
  return {
    last: touch,
    first: existing?.first ?? existing?.last ?? touch,
  }
}

export function serializeAttributionCookie(snapshot: AttributionSnapshot): string {
  return encodeURIComponent(JSON.stringify(snapshot))
}
