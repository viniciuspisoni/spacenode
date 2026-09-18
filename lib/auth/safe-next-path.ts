// Validador único do parâmetro ?next= dos fluxos de login.
//
// O parser WHATWG trata barra invertida como '/' e ignora controles, então
// uma checagem ingênua de prefixo deixa passar next com backslash ou tab —
// que resolvem pra origem do atacante num redirect (open redirect confirmado
// empiricamente na revisão de 2026-09-01). Aqui o valor só passa se, resolvido
// contra uma origem sentinela, continuar NA origem sentinela.

const FALLBACK = '/app'

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/

/** Caminho interno normalizado (path + query), ou null se o valor não passa.
 *  Quem precisa distinguir "ausente/inválido" de "/app explícito" usa este;
 *  `safeNextPath` é a versão com fallback para os fluxos de login. */
export function internalNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\') || CONTROL_OR_SPACE.test(value)) return null

  let resolved: URL
  try {
    resolved = new URL(value, 'https://n')
  } catch {
    return null
  }
  if (resolved.origin !== 'https://n') return null

  return resolved.pathname + resolved.search
}

export function safeNextPath(value: string | null | undefined): string {
  return internalNextPath(value) ?? FALLBACK
}
