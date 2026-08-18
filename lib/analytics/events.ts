// lib/analytics/events.ts
//
// Catálogo central e tipado dos eventos do funil de conversão. Fonte única de
// verdade para: o client (`lib/analytics/client.ts`), o servidor
// (`lib/analytics/server.ts`), o coletor público (`/api/analytics/track`) e os
// adapters de marketing. Catálogo completo em docs/ANALYTICS.md.
//
// PERSISTÊNCIA: todos os eventos caem em `marketing.acquisition_events`
// (first-party, RLS deny-all, service_role). Dois nomes públicos têm ALIAS de
// storage porque o banco/painel de ads já nasceram com o nome legado e há
// dados/índices em produção — o alias preserva o histórico e o funil do
// /admin/marketing/ads sem migrar dados:
//   signup_completed       → signup                (índice único por usuário)
//   subscription_cancelled → subscription_canceled
//
// ANTI-SPOOF: o coletor público só aceita eventos de CLIENT_EVENTS. Eventos de
// dinheiro/servidor (generation_*, checkout_*, subscription_*, signup) são
// gravados exclusivamente por rotas server-side ou pelo webhook do Stripe —
// um POST forjado no coletor não consegue inflar conversão.

/** Nomes públicos do catálogo — o que `track()`/`trackServerEvent()` aceitam. */
export const ANALYTICS_EVENTS = [
  // Aquisição (landing/campanha)
  'landing_view',
  'cta_clicked',
  'plans_viewed',
  // Cadastro
  'signup_started',
  'signup_completed',
  'onboarding_completed',
  // Produto
  'project_created',
  'image_uploaded',
  'generation_started',
  'generation_completed',
  'generation_failed',
  'result_approved',
  'result_rejected',
  'result_downloaded',
  // Dinheiro (só servidor/webhook)
  'checkout_started',
  'checkout_completed',
  'subscription_started',
  'subscription_cancelled',
] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/** Aliases público → event_type persistido (legado do schema marketing). */
const STORAGE_ALIAS: Partial<Record<AnalyticsEvent, string>> = {
  signup_completed:       'signup',
  subscription_cancelled: 'subscription_canceled',
}

/** event_type efetivamente gravado em marketing.acquisition_events. */
export function storageEventType(event: AnalyticsEvent): string {
  return STORAGE_ALIAS[event] ?? event
}

/** Eventos que o coletor público (/api/analytics/track) aceita do browser.
 *  Tudo que envolve dinheiro, cadastro ou consumo de nodes fica de fora —
 *  esses nascem no servidor, onde o fato realmente acontece. */
export const CLIENT_EVENTS: ReadonlySet<AnalyticsEvent> = new Set([
  'landing_view',
  'cta_clicked',
  'plans_viewed',
  'signup_started',
  'onboarding_completed',
  'image_uploaded',
  'result_approved',
  'result_rejected',
  'result_downloaded', // só o Editar V3 baixa client-side (blob); o resto passa por /api/download
])

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value)
}

/** Módulo de produto que originou o evento — vira `properties.feature`. */
export type AnalyticsFeature =
  | 'renderizar'
  | 'spaces'
  | 'editar'
  | 'ampliar'
  | 'animar'
  | 'apresentar'
  | 'finalizar'

/** Propriedades de evento: mapa raso de escalares. Nada de PII (email,
 *  telefone, prompt, imagem) — validado/truncado no coletor e no server. */
export type AnalyticsProps = Record<string, string | number | boolean | null>

export const MAX_PROP_KEYS = 20
export const MAX_PROP_STRING = 300

/** Sanitiza props vindas de qualquer origem: só chaves string, valores
 *  escalares, strings truncadas, no máximo MAX_PROP_KEYS entradas. */
export function sanitizeProps(raw: unknown): AnalyticsProps {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: AnalyticsProps = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_PROP_KEYS) break
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) continue
    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_PROP_STRING)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value
    } else if (typeof value === 'boolean' || value === null) {
      out[key] = value
    } else {
      continue
    }
    count++
  }
  return out
}
