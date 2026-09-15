// lib/analytics/server.ts
//
// API de rastreamento do SERVIDOR — rotas de produto, handlers de auth e o
// webhook do Stripe usam APENAS isto (nunca o coletor público).
//
//   await trackServerEvent(admin, {
//     event: 'generation_completed',
//     userId: user.id,
//     req,                       // NextRequest → anon id + atribuição via cookies
//     feature: 'renderizar',
//     props: { engine, resolution },
//   })
//
// Persiste em marketing.acquisition_events via recordAcquisitionEvent
// (best-effort, nunca lança — contrato herdado: rastreamento jamais derruba
// fluxo de produto). Eventos com `dedupeKey` são idempotentes (índice único
// parcial; retry de webhook do Stripe não duplica). Em rotas quentes, chame
// dentro de after() (next/server) para não taxar a latência da resposta.
//
// PII: nada de e-mail/telefone/prompt/imagem — só ids, slugs e números.

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ATTRIBUTION_COOKIE,
  parseAttributionCookie,
  type AttributionSnapshot,
} from '@/lib/marketing/ads/naming'
import { recordAcquisitionEvent } from '@/lib/marketing/ads/service'
import type { AcquisitionEventType } from '@/lib/marketing/ads/types'
import {
  sanitizeProps,
  storageEventType,
  type AnalyticsEvent,
  type AnalyticsFeature,
  type AnalyticsProps,
} from './events'
import { ANON_COOKIE, parseAnonymousId } from './attribution'

export interface ServerEventInput {
  event: AnalyticsEvent
  /** Usuário autenticado, quando houver. */
  userId?: string | null
  /** Request de origem — fonte dos cookies sn_aid/sn_attribution. */
  req?: NextRequest | Request | null
  /** Id anônimo já resolvido (ex.: metadata do Stripe no webhook). */
  anonymousId?: string | null
  /** Snapshot de atribuição já resolvido (ex.: metadata do Stripe). */
  attribution?: AttributionSnapshot | null
  /** Módulo de produto (vira properties.feature). */
  feature?: AnalyticsFeature
  planId?: string | null
  offerId?: string | null
  valueCents?: number | null
  /** Página em que o evento aconteceu (path interno). */
  page?: string | null
  /** Chave de idempotência (ex.: `checkout:{session.id}`). */
  dedupeKey?: string | null
  props?: AnalyticsProps
}

/** Valor de um cookie da request — cobre NextRequest (req.cookies) e Request
 *  puro (algumas rotas tipam `req: Request`; aí o header é a fonte). */
function cookieValue(req: NextRequest | Request, name: string): string | undefined {
  const jar = (req as NextRequest).cookies
  if (jar && typeof jar.get === 'function') return jar.get(name)?.value
  const header = req.headers.get('cookie') ?? ''
  const found = header.split('; ').find(c => c.startsWith(`${name}=`))
  return found ? found.slice(name.length + 1) : undefined
}

/** Lê identidade/atribuição dos cookies de uma request (first-party). */
export function identityFromRequest(req: NextRequest | Request): {
  anonymousId: string | null
  attribution: AttributionSnapshot | null
} {
  return {
    anonymousId: parseAnonymousId(cookieValue(req, ANON_COOKIE)),
    attribution: parseAttributionCookie(cookieValue(req, ATTRIBUTION_COOKIE)),
  }
}

/** Grava um evento do funil a partir do servidor. Nunca lança. */
export async function trackServerEvent(
  admin: SupabaseClient,
  input: ServerEventInput,
): Promise<void> {
  try {
    const fromReq = input.req ? identityFromRequest(input.req) : null
    const anonymousId = input.anonymousId ?? fromReq?.anonymousId ?? null
    const attribution = input.attribution ?? fromReq?.attribution ?? null
    const last = attribution?.last

    const props = sanitizeProps(input.props ?? {})
    if (input.feature) props.feature = input.feature

    await recordAcquisitionEvent(admin, {
      user_id: input.userId ?? null,
      // O alias de storage devolve sempre um nome presente no union — o cast
      // só encurta o caminho entre os dois catálogos (testado em tests/).
      event_type: storageEventType(input.event) as AcquisitionEventType,
      utm: attribution ? ({ ...attribution } as unknown as Record<string, unknown>) : {},
      ad_identifier: last?.content ?? null,
      campaign_identifier: last?.campaign ?? null,
      referrer: last?.referrer ?? null,
      plan_id: input.planId ?? null,
      value_cents: input.valueCents ?? null,
      anonymous_id: anonymousId,
      page: input.page ?? null,
      offer_id: input.offerId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      metadata: props,
    })
  } catch (err) {
    console.warn('[analytics] trackServerEvent falhou:', err instanceof Error ? err.message : err)
  }
}
