import { createHash } from 'node:crypto'
import type { ServerAdapter, ServerAdapterEvent } from '../server-adapters'

export interface MetaPurchase {
  event_name: 'Purchase'
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url: string
  user_data: { external_id: string[]; fbc?: string; fbp?: string }
  custom_data: { currency: string; value: number; content_type: 'product'; content_ids: string[] }
}

export interface MetaRegistration {
  event_name: 'CompleteRegistration'
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url: string
  user_data: MetaPurchase['user_data'] & { client_user_agent?: string }
  custom_data: { status: true }
}

/** Only called with a persisted signup and the authenticated account's creation time. */
export function buildMetaRegistration(input: {
  userId: string
  createdAt: string
  consent: string
  fbc?: string | null
  fbp?: string | null
  userAgent?: string | null
}, now = Date.now()): MetaRegistration | null {
  const at = Date.parse(input.createdAt)
  if (input.consent !== 'granted' || !input.userId || !Number.isFinite(at)
    || at > now || at <= now - 7 * 86400000) return null
  const userData: MetaRegistration['user_data'] = {
    external_id: [createHash('sha256').update(input.userId).digest('hex')],
  }
  const fbc = validMetaBrowserId(input.fbc)
  const fbp = validMetaBrowserId(input.fbp)
  if (fbc) userData.fbc = fbc
  if (fbp) userData.fbp = fbp
  if (input.userAgent) userData.client_user_agent = input.userAgent.slice(0, 1000)
  return {
    event_name: 'CompleteRegistration', event_time: Math.floor(at / 1000),
    event_id: `signup:${input.userId}`, action_source: 'website',
    event_source_url: 'https://spacenode.app/app', user_data: userData,
    custom_data: { status: true },
  }
}

/** Stripe supplies the paid fact; browser collectors cannot create this event. */
export function buildMetaPurchase(event: ServerAdapterEvent, now = Date.now()): MetaPurchase | null {
  if (event.event !== 'subscription_started' || event.consent !== 'granted') return null
  if (!Number.isSafeInteger(event.valueCents) || (event.valueCents ?? 0) <= 0) return null
  if (!event.userId || !event.dedupeKey?.startsWith('subscription:') || !event.planId) return null
  const currency = typeof event.props.currency === 'string' ? event.props.currency.toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(currency)) return null
  const at = event.occurredAt ? Date.parse(event.occurredAt) : now
  if (!Number.isFinite(at) || at > now + 60000 || at < now - 7 * 86400000) return null
  const userData: MetaPurchase['user_data'] = {
    external_id: [createHash('sha256').update(event.userId).digest('hex')],
  }
  const fbc = validMetaBrowserId(event.fbc)
  const fbp = validMetaBrowserId(event.fbp)
  if (fbc) userData.fbc = fbc
  if (fbp) userData.fbp = fbp
  return {
    event_name: 'Purchase', event_time: Math.floor(at / 1000),
    event_id: event.dedupeKey, action_source: 'website',
    event_source_url: 'https://spacenode.app/app/billing',
    user_data: userData,
    custom_data: { currency, value: event.valueCents! / 100, content_type: 'product', content_ids: [event.planId] },
  }
}

export function validMetaBrowserId(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 500 && /^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]+$/.test(value) ? value : null
}

export function metaConversionsConfigured(): boolean {
  return process.env.META_CAPI_ENABLED === 'true'
    && Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim())
    && /^\d+$/.test(process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '')
}

export const metaConversionsAdapter: ServerAdapter = {
  name: 'meta-conversions', requiresConsent: true,
  accepts: new Set(['subscription_started']),
  async send(event) {
    if (!metaConversionsConfigured()) return
    const purchase = buildMetaPurchase(event)
    if (!purchase) return
    await sendMetaConversion(purchase)
  },
}

/** A successful response means Meta acknowledged reception, not attribution. */
export async function sendMetaConversion(event: MetaPurchase | MetaRegistration): Promise<void> {
  if (!metaConversionsConfigured()) throw new Error('Meta conversions not configured')
  const token = process.env.META_CAPI_ACCESS_TOKEN!.trim()
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID!
  // No test code in the production pipeline. Test requests are separate.
  const url = `https://graph.facebook.com/v23.0/${pixel}/events`
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: [event] }),
        signal: AbortSignal.timeout(4000),
      })
    } catch {
      if (attempt === 0) continue
      throw new Error(`Meta ${event.event_name} transport failed`)
    }
    if ((response.status === 429 || response.status >= 500) && attempt === 0) continue
    if (!response.ok) throw new Error(`Meta ${event.event_name} rejected (HTTP ${response.status})`)
    const result = await response.json() as { events_received?: number }
    if (result.events_received !== 1) throw new Error(`Meta ${event.event_name} was not acknowledged`)
    console.info(`[analytics] Meta ${event.event_name} accepted`)
    return
  }
}

