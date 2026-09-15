// lib/analytics/consent.ts
//
// Ponto único de decisão sobre scripts/envios de MARKETING de terceiros
// (Google Ads, GA4, Meta Pixel). O rastreamento first-party (cookies sn_* +
// marketing.acquisition_events) NÃO passa por aqui — é infraestrutura própria,
// sem terceiros, coberta pela cláusula 7 da política de privacidade.
//
// MECANISMO: escolha explícita do visitante, guardada no cookie sn_consent.
//   • ausente  → ainda não escolheu; NADA de terceiro carrega (opt-in)
//   • 'denied' → recusou; NADA de terceiro carrega
//   • 'granted'→ aceitou; Google Ads e Meta Pixel podem carregar e disparar
//
// É deliberadamente um gate mínimo, não uma CMP: uma escolha binária de
// marketing, persistida, revogável trocando a escolha no banner. Não há
// categorização por finalidade, nem vendor list, nem TCF.
//
// O ambiente continua sendo responsabilidade de quem injeta o script: o
// GoogleTag só carrega em produção (o ID é fixo no código) e os adapters de
// GA4/Meta só agem com a env var presente. Este módulo responde UMA pergunta —
// "o visitante autorizou marketing de terceiros?" — e nada além disso.

export const CONSENT_COOKIE = 'sn_consent'
export const CONSENT_MAX_AGE_DAYS = 180

/** Evento disparado no window quando a escolha muda, para os componentes
 *  montados reagirem sem recarregar a página. */
export const CONSENT_EVENT = 'sn:consent'

export type ConsentChoice = 'granted' | 'denied'

/** Parse defensivo: o valor vem de cookie, que é entrada hostil. */
export function parseConsentCookie(value: string | undefined | null): ConsentChoice | null {
  if (value === 'granted' || value === 'denied') return value
  return null
}

function cookieFrom(header: string | undefined | null, name: string): string | undefined {
  if (!header) return undefined
  const prefix = `${name}=`
  const found = header.split('; ').find((c) => c.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

/** Escolha atual no browser. `null` = ainda não escolheu. */
export function readConsentChoice(): ConsentChoice | null {
  if (typeof document === 'undefined') return null
  return parseConsentCookie(cookieFrom(document.cookie, CONSENT_COOKIE))
}

/** Grava a escolha e avisa quem estiver ouvindo. Best-effort: sem cookie
 *  disponível, o visitante segue sem terceiros — o lado seguro. */
export function writeConsentChoice(choice: ConsentChoice): void {
  try {
    const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
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

/** Client: o visitante autorizou scripts de marketing de terceiros? */
export function marketingConsentClient(): boolean {
  return readConsentChoice() === 'granted'
}

/** Server: idem, a partir do header Cookie da requisição. Sem o header não há
 *  como afirmar consentimento — responde false. */
export function marketingConsentServer(cookieHeader: string | undefined | null): boolean {
  return parseConsentCookie(cookieFrom(cookieHeader, CONSENT_COOKIE)) === 'granted'
}
