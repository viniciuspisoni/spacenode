// Validador único do parâmetro ?next= dos fluxos de login.
//
// O parser WHATWG trata barra invertida como '/' e ignora controles, então
// uma checagem ingênua de prefixo deixa passar next com backslash ou tab —
// que resolvem pra origem do atacante num redirect (open redirect confirmado
// empiricamente na revisão de 2026-09-01). Aqui o valor só passa se, resolvido
// contra uma origem sentinela, continuar NA origem sentinela.

const FALLBACK = '/app'

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return FALLBACK
  if (!value.startsWith('/') || value.startsWith('//')) return FALLBACK
  if (value.includes('\\') || CONTROL_OR_SPACE.test(value)) return FALLBACK

  let resolved: URL
  try {
    resolved = new URL(value, 'https://n')
  } catch {
    return FALLBACK
  }
  if (resolved.origin !== 'https://n') return FALLBACK

  return resolved.pathname + resolved.search
}
