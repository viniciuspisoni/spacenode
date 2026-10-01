// lib/analytics/signup-attribution.ts
//
// Origem do cadastro guardada NA CONTA, para sobreviver à troca de navegador.
//
// O caso que motivou (anúncio da Meta, 01/10/26): o clique abre o navegador
// interno do Instagram/Facebook, a pessoa se cadastra por e-mail ali e abre o
// link de confirmação pelo app de e-mail — outro navegador, outra caixa de
// cookies. Sem isto, o cadastro era vinculado SEM campanha (o vínculo é
// imutável), o CompleteRegistration não saía e o checkout ia ao Stripe sem
// origem: a venda do anúncio virava "origem desconhecida".
//
// No signUp por e-mail, o browser copia para `options.data` (user_metadata)
// o que os cookies first-party já guardam: campanha (sn_attribution, sem
// referrer nem click ids), o id anônimo (sn_aid) e o destino pós-cadastro
// (`next`, que carrega a retomada do checkout). Nada pessoal — os mesmos
// parâmetros de campanha que o evento de cadastro já associa ao usuário.
//
// CONFIANÇA: user_metadata é editável pelo próprio usuário (supabase-js
// updateUser), o mesmo nível de confiança do cookie. Por isso só serve para
// atribuição, sempre passa pelos parsers defensivos e o `next` só aceita
// caminho interno (sem open redirect).

import {
  attributionSnapshotFromObject,
  type AttributionSnapshot,
  type AttributionTouch,
} from '@/lib/marketing/ads/naming'
import { internalNextPath } from '@/lib/auth/safe-next-path'
import { parseAnonymousId } from './attribution'

export const SIGNUP_ATTRIBUTION_KEY = 'sn_signup'

export interface SignupAttribution {
  attribution: AttributionSnapshot | null
  anonymousId: string | null
  /** Destino interno pós-cadastro (ex.: retomada do checkout do plano). */
  next: string | null
}

const EMPTY: SignupAttribution = { attribution: null, anonymousId: null, next: null }

// O user_metadata viaja dentro do JWT da sessão (e portanto nos cookies de
// auth): só os campos que a atribuição usa, sem referrer nem click ids.
function compactTouch(touch: AttributionTouch): AttributionTouch {
  const { source, medium, campaign, content, term, landing_path, at } = touch
  return Object.fromEntries(
    Object.entries({ source, medium, campaign, content, term, landing_path, at }).filter(([, v]) => v),
  ) as unknown as AttributionTouch
}

/** `options.data` do signUp: o que os cookies sabem sobre a origem, já
 *  validado. Retorna `{}` quando não há nada a guardar. */
export function signupAttributionMetadata(input: {
  attribution: AttributionSnapshot | null
  anonymousId: string | null
  next: string | null
}): Record<string, unknown> {
  const value: Record<string, unknown> = {}
  if (input.attribution) {
    value.attr = {
      last: compactTouch(input.attribution.last),
      ...(input.attribution.first ? { first: compactTouch(input.attribution.first) } : {}),
    }
  }
  const anonymousId = parseAnonymousId(input.anonymousId)
  if (anonymousId) value.aid = anonymousId
  const next = internalNextPath(input.next)
  if (next) value.next = next
  return Object.keys(value).length > 0 ? { [SIGNUP_ATTRIBUTION_KEY]: { v: 1, ...value } } : {}
}

/** Lê de volta, defensivamente, o que o signUp guardou na conta. */
export function signupAttributionFromMetadata(metadata: unknown): SignupAttribution {
  if (typeof metadata !== 'object' || metadata === null) return EMPTY
  const raw = (metadata as Record<string, unknown>)[SIGNUP_ATTRIBUTION_KEY]
  if (typeof raw !== 'object' || raw === null) return EMPTY
  const stored = raw as Record<string, unknown>
  return {
    attribution: attributionSnapshotFromObject(stored.attr),
    anonymousId: parseAnonymousId(typeof stored.aid === 'string' ? stored.aid : null),
    next: internalNextPath(typeof stored.next === 'string' ? stored.next : null),
  }
}
