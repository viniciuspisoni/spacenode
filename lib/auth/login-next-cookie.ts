// Transporte do destino pós-login quando a query não sobrevive ao fluxo.
//
// O caso que exige isso é o botão do Google (GIS): a doc oficial manda o
// login_uri bater EXATAMENTE com uma redirect URI autorizada no client OAuth
// — query dinâmica ali arrisca quebrar o login inteiro (achado F20 da revisão
// 2026-09-01). Então o login_uri fica fixo em /auth/google e a página de
// login deposita o next neste cookie de curta duração; o POST lê e apaga.
// O valor SEMPRE passa pelo safeNextPath no consumo.

export const LOGIN_NEXT_COOKIE = 'sn_login_next'
export const LOGIN_NEXT_MAX_AGE = 600

export function readLoginNextCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === LOGIN_NEXT_COOKIE) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return null
      }
    }
  }
  return null
}
