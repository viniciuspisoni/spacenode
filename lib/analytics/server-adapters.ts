// lib/analytics/server-adapters.ts
//
// Ponto único de saída SERVER-SIDE para plataformas de marketing. Hoje o
// registro está VAZIO de propósito: nenhum evento sai do servidor para
// terceiros. A estrutura existe para o Meta Conversions API (e equivalentes)
// entrar sem tocar em rota, webhook ou coletor — só um adapter novo aqui.
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

// Meta CAPI entra aqui quando for implementado. Vazio = nada sai do servidor.
const REGISTRY: ReadonlyArray<ServerAdapter> = []

export function registeredServerAdapters(): ReadonlyArray<ServerAdapter> {
  return REGISTRY
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
  adapters: ReadonlyArray<ServerAdapter> = REGISTRY,
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
