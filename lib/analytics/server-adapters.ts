// lib/analytics/server-adapters.ts
//
// Saída SERVER-SIDE de marketing. Meta recebe apenas a primeira assinatura
// paga, com configuração explícita e consentimento. Falhas não impedem
// o registro first-party nem a entrega do produto.
//
// Regra que todo adapter herda e não pode contornar: um evento só é
// encaminhado a um adapter que exige consentimento quando a escolha do
// visitante, capturada no cookie sn_consent (ou espelhada no metadata do
// Stripe, no caso do webhook), for 'granted'. 'unknown' e 'denied' não
// enviam. É a mesma postura dos scripts no browser (lib/analytics/consent.ts).
//
// Chamado por trackServerEvent DEPOIS de persistir o evento first-party:
// falha de adapter nunca impede o registro nem derruba a rota.

import type { AnalyticsEvent, AnalyticsProps } from './events'
import { metaConversionsAdapter, metaConversionsConfigured } from './adapters/meta-conversions'
import type { MarketingConsentSnapshot } from './stripe-metadata'

export interface ServerAdapterEvent {
  event: AnalyticsEvent
  userId: string | null
  anonymousId: string | null
  planId: string | null
  valueCents: number | null
  page: string | null
  occurredAt: string | null
  /** Chave de idempotência do evento first-party — serve de event_id para
   *  deduplicar com o Pixel do browser quando a CAPI entrar. */
  dedupeKey: string | null
  consent: MarketingConsentSnapshot
  fbc?: string | null
  fbp?: string | null
  props: AnalyticsProps
}

export interface ServerAdapter {
  name: string
  /** true = só recebe eventos com consent === 'granted'. */
  requiresConsent: boolean
  /** Eventos que este adapter conhece; os demais são ignorados. */
  accepts: ReadonlySet<AnalyticsEvent>
  send(event: ServerAdapterEvent): Promise<void>
}

// O adapter só é elegível com configuração explícita em produção.
const REGISTRY: ReadonlyArray<ServerAdapter> = [metaConversionsAdapter]

export function registeredServerAdapters(): ReadonlyArray<ServerAdapter> {
  return metaConversionsConfigured() ? REGISTRY : []
}

/** Decide se um adapter pode receber o evento. Puro, para teste. */
export function adapterMayReceive(adapter: ServerAdapter, event: ServerAdapterEvent): boolean {
  if (!adapter.accepts.has(event.event)) return false
  if (adapter.requiresConsent && event.consent !== 'granted') return false
  return true
}

/** Encaminha a cada adapter elegível. Nunca lança. */
export async function forwardServerEvent(
  event: ServerAdapterEvent,
  adapters: ReadonlyArray<ServerAdapter> = registeredServerAdapters(),
): Promise<void> {
  for (const adapter of adapters) {
    if (!adapterMayReceive(adapter, event)) continue
    try {
      await adapter.send(event)
    } catch (err) {
      console.warn(
        `[analytics] adapter ${adapter.name} falhou em ${event.event}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }
}
