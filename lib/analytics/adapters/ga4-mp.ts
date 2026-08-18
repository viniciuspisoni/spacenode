// lib/analytics/adapters/ga4-mp.ts
//
// Adapter OPCIONAL do GA4 Measurement Protocol (server-side). Desligado por
// padrão: só age com NEXT_PUBLIC_GA4_ID + GA4_API_SECRET definidos E
// lib/analytics/consent.ts permitindo. Usado pelos eventos confirmados no
// servidor (webhook do Stripe) — o client_id é o id anônimo first-party
// (sn_aid) quando conhecido, senão um id derivado do usuário (pseudônimo).
// PII: nenhuma.
//
// ANTES de definir as envs em produção: atualizar a cláusula 7 da política de
// privacidade (hoje promete "sem rastreadores de terceiros").

import { createHash } from 'crypto'
import { marketingConsentServer } from '../consent'
import type { AnalyticsEvent } from '../events'

export function ga4MpEnabled(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_GA4_ID && process.env.GA4_API_SECRET) &&
    marketingConsentServer()
  )
}

export interface Ga4MpInput {
  event: AnalyticsEvent
  anonymousId?: string | null
  userId?: string | null
  valueCents?: number | null
  currency?: string
  params?: Record<string, string | number>
}

export async function ga4MpTrack(input: Ga4MpInput): Promise<void> {
  if (!ga4MpEnabled()) return
  try {
    // GA4 exige um client_id; sem sn_aid usamos hash do user_id (estável e
    // pseudônimo — nunca o uuid cru).
    const clientId =
      input.anonymousId ??
      (input.userId ? createHash('sha256').update(input.userId).digest('hex').slice(0, 32) : null)
    if (!clientId) return

    const url =
      'https://www.google-analytics.com/mp/collect' +
      `?measurement_id=${process.env.NEXT_PUBLIC_GA4_ID}&api_secret=${process.env.GA4_API_SECRET}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [
          {
            name: input.event,
            params: {
              ...(input.params ?? {}),
              ...(input.valueCents != null
                ? { value: Math.round(input.valueCents) / 100, currency: input.currency ?? 'BRL' }
                : {}),
            },
          },
        ],
      }),
    })
    // O MP devolve 2xx mesmo para payload inválido — só rede/5xx viram warn.
    if (!res.ok) console.warn(`[analytics/ga4-mp] envio falhou (${res.status})`)
  } catch (err) {
    console.warn('[analytics/ga4-mp] envio falhou:', err instanceof Error ? err.message : err)
  }
}
