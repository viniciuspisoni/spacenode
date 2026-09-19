// lib/analytics/consent.ts
//
// Ponto único de decisão sobre scripts/envios de terceiros, agora por
// CATEGORIA. O rastreamento first-party (cookies sn_* +
// marketing.acquisition_events) NÃO passa por aqui — é infraestrutura própria,
// sem terceiros, coberta pela cláusula 7 da política de privacidade.
//
// MECANISMO: escolha explícita do visitante, guardada no cookie sn_consent.
//   • ausente → ainda não escolheu; NADA de terceiro carrega (opt-in)
//   • 'a0m0'  → recusou as opcionais
//   • 'a1m1'  → aceitou todas
//   • 'a1m0' / 'a0m1' → escolha por categoria
//
// COMPATIBILIDADE: os valores do gate binário anterior continuam válidos na
// LEITURA — 'granted' vira todas as categorias ligadas, 'denied' todas
// desligadas. Quem já escolheu antes desta versão não vê o aviso de novo e
// mantém exatamente o que tinha. A escrita usa sempre o formato novo.
//
// São DUAS categorias opcionais porque são as duas que existem de verdade no
// código — nada aqui antecipa integração futura:
//   • analytics → GA4 (lib/analytics/adapters/ga4.ts)
//   • marketing → tag do Google Ads (components/GoogleTag.tsx) e Meta Pixel
//     (components/analytics/MetaPixel.tsx)
// A categoria "Necessários" do aviso não é estado aqui: ela é justamente o que
// roda sem terceiros (sessão, tema, atribuição first-party) e por isso não tem
// gate a consultar.
//
// Continua não sendo uma CMP: sem vendor list negociável, sem TCF. É uma
// escolha por categoria, persistida e revogável.
//
// O ambiente continua sendo responsabilidade de quem injeta o script: o
// GoogleTag só carrega em produção (o ID é fixo no código) e os adapters de
// GA4/Meta só agem com a env var presente.

export const CONSENT_COOKIE = 'sn_consent'
export const CONSENT_MAX_AGE_DAYS = 180

/** Evento disparado no window quando a escolha muda, para os componentes
 *  montados reagirem sem recarregar a página. */
export const CONSENT_EVENT = 'sn:consent'

/** Categorias opcionais — as que o visitante liga e desliga. */
export type ConsentCategory = 'analytics' | 'marketing'

/** Estado completo da escolha. Sem "necessários": não há o que decidir lá. */
export type ConsentState = Record<ConsentCategory, boolean>

/** Leitura binária derivada, preservada para quem só pergunta "pode marketing?" */
export type ConsentChoice = 'granted' | 'denied'

export const CONSENT_ALL: ConsentState = { analytics: true, marketing: true }
export const CONSENT_NONE: ConsentState = { analytics: false, marketing: false }

const LEGACY_VALUE: Record<string, ConsentState> = {
  granted: CONSENT_ALL,
  denied: CONSENT_NONE,
}

/** Formato do cookie novo: 'a1m0'. Compacto, sem caractere que precise de
 *  encode e trivial de validar. */
const COOKIE_FORMAT = /^a([01])m([01])$/

/** Parse defensivo: o valor vem de cookie, que é entrada hostil. Aceita o
 *  formato novo e os dois valores legados; qualquer outra coisa é `null`
 *  ("ainda não escolheu"), que é o lado seguro. */
export function parseConsentCookie(value: string | undefined | null): ConsentState | null {
  if (typeof value !== 'string') return null

  const legacy = LEGACY_VALUE[value]
  if (legacy) return { ...legacy }

  const match = COOKIE_FORMAT.exec(value)
  if (!match) return null
  return { analytics: match[1] === '1', marketing: match[2] === '1' }
}

export function serializeConsentState(state: ConsentState): string {
  return `a${state.analytics ? 1 : 0}m${state.marketing ? 1 : 0}`
}

function cookieFrom(header: string | undefined | null, name: string): string | undefined {
  if (!header) return undefined
  const prefix = `${name}=`
  const found = header.split('; ').find((c) => c.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

// Cache do último parse, indexado pelo valor CRU do cookie.
//
// Não é otimização: readConsentState é o getSnapshot de um
// useSyncExternalStore (components/analytics/useMarketingConsent.ts), e o React
// compara snapshots por Object.is. Devolver um objeto novo a cada chamada — que
// é o que o parse faz — colocava o app em laço infinito de render ("The result
// of getSnapshot should be cached", seguido de "Maximum update depth
// exceeded"). Enquanto o cookie for a mesma string, a MESMA referência volta.
let cache: { raw: string | undefined; state: ConsentState | null } | null = null

/** Escolha atual no browser. `null` = ainda não escolheu. */
export function readConsentState(): ConsentState | null {
  if (typeof document === 'undefined') return null

  const raw = cookieFrom(document.cookie, CONSENT_COOKIE)
  if (!cache || cache.raw !== raw) cache = { raw, state: parseConsentCookie(raw) }
  return cache.state
}

/** Grava a escolha e avisa quem estiver ouvindo. Best-effort: sem cookie
 *  disponível, o visitante segue sem terceiros — o lado seguro. */
export function writeConsentState(state: ConsentState): void {
  try {
    const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const value = serializeConsentState(state)
    document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
    window.dispatchEvent(new Event(CONSENT_EVENT))
  } catch {
    // Sem persistência a escolha não vale; nada de terceiro carrega.
  }
}

/** Assina mudanças de escolha. Devolve o cancelador. */
export function subscribeConsent(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CONSENT_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_EVENT, onChange)
}

function allows(state: ConsentState | null, category: ConsentCategory): boolean {
  return state?.[category] === true
}

/** Client: o visitante autorizou scripts de marketing/atribuição? */
export function marketingConsentClient(): boolean {
  return allows(readConsentState(), 'marketing')
}

/** Server: idem, a partir do header Cookie da requisição. Sem o header não há
 *  como afirmar consentimento — responde false. */
export function marketingConsentServer(cookieHeader: string | undefined | null): boolean {
  return allows(parseConsentCookie(cookieFrom(cookieHeader, CONSENT_COOKIE)), 'marketing')
}

/** Client: o visitante autorizou medição de análise e desempenho? */
export function analyticsConsentClient(): boolean {
  return allows(readConsentState(), 'analytics')
}

/** Server: idem, a partir do header Cookie da requisição. */
export function analyticsConsentServer(cookieHeader: string | undefined | null): boolean {
  return allows(parseConsentCookie(cookieFrom(cookieHeader, CONSENT_COOKIE)), 'analytics')
}
