// lib/analytics/adapters/meta-capi.ts
//
// Adapter OPCIONAL da Meta Conversions API (server-side). Desligado por
// padrão: só age com META_CAPI_ACCESS_TOKEN + NEXT_PUBLIC_META_PIXEL_ID
// definidos E lib/analytics/consent.ts permitindo.
//
// Recebe SÓ eventos confirmados no servidor (webhook do Stripe) — nunca o
// browser. PII: NENHUMA — nada de e-mail/telefone/IP/user-agent; o único
// user_data é external_id = SHA-256 do user_id interno (pseudônimo exigido
// pela API para matching mínimo). event_id determinístico (dedupe com o Pixel
// quando os dois estiverem ligados).
//
// ANTES de definir as envs em produção: atualizar a cláusula 7 da política de
// privacidade (hoje promete "sem rastreadores de terceiros").

import { createHash } from 'crypto'
import { marketingConsentServer } from '../consent'
import type { AnalyticsEvent } from '../events'

const GRAPH_VERSION = 'v21.0'

function pixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID
}
function accessToken(): string | undefined {
  return process.env.META_CAPI_ACCESS_TOKEN
}

export function metaCapiEnabled(): boolean {
  return Boolean(pixelId() && accessToken()) && marketingConsentServer()
}

/** Catálogo → evento padrão do Meta (só os de dinheiro têm equivalente). */
const STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  checkout_completed: 'Purchase',
  subscription_started: 'Subscribe',
  signup_completed: 'CompleteRegistration',
}

export interface MetaCapiInput {
  event: AnalyticsEvent
  /** Chave estável do fato (ex.: id da session do Stripe) — vira event_id. */
  eventId: string
  userId?: string | null
  valueCents?: number | null
  currency?: string
  sourceUrl?: string | null
}

/** Envia 1 evento à CAPI. Best-effort: falha vira console.warn. */
export async function metaCapiTrack(input: MetaCapiInput): Promise<void> {
  if (!metaCapiEnabled()) return
  const eventName = STANDARD[input.event] ?? input.event
  try {
    const body = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: 'website',
          ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
          user_data: {
            ...(input.userId
              ? { external_id: [createHash('sha256').update(input.userId).digest('hex')] }
              : {}),
          },
          ...(input.valueCents != null
            ? {
                custom_data: {
                  currency: input.currency ?? 'BRL',
                  value: Math.round(input.valueCents) / 100,
                },
              }
            : {}),
        },
      ],
    }
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId()}/events?access_token=${accessToken()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      console.warn(`[analytics/meta-capi] envio falhou (${res.status}):`, (await res.text()).slice(0, 300))
    }
  } catch (err) {
    console.warn('[analytics/meta-capi] envio falhou:', err instanceof Error ? err.message : err)
  }
}
