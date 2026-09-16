// lib/analytics/internal.ts
//
// Tráfego de desenvolvimento/teste × tráfego de mercado.
//
// O `.env.local` da máquina de desenvolvimento aponta para o Supabase de
// PRODUÇÃO (ver docs/ANALYTICS.md). Consequência medida em 16/09/26: uma
// tarde de `npm run dev` em localhost:3200 encheu o relatório de `lp_view` da
// campanha paga com visitas que nunca existiram. Nenhum dado é descartado —
// o evento é gravado com `is_internal = true` e os relatórios o excluem.
//
// A decisão é pelo HOST da requisição, não pelo referrer: host é o servidor
// que respondeu (não falsificável pelo visitante de forma útil) enquanto o
// referrer é só uma pista. Preview da Vercel, localhost e qualquer domínio
// fora da allowlist entram como interno.
//
// Complemento no banco: `marketing.internal_actors` + trigger marcam os
// eventos das contas do time mesmo quando vêm do host de produção — o host
// sozinho não pega o dono testando o site publicado.

/** Hosts que contam como público. Override por env (vírgula) quando um
 *  domínio novo entrar no ar antes de um deploy de código. */
const DEFAULT_PUBLIC_HOSTS = ['spacenode.app', 'www.spacenode.app']

function publicHosts(): string[] {
  const fromEnv = (process.env.ANALYTICS_PUBLIC_HOSTS ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
  return fromEnv.length > 0 ? fromEnv : DEFAULT_PUBLIC_HOSTS
}

/** Normaliza um header de host: tira porta e caixa. */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  const trimmed = host.trim().toLowerCase()
  if (!trimmed) return null
  // IPv6 literal ("[::1]:3000") ou host:porta comum.
  const withoutPort = trimmed.startsWith('[')
    ? trimmed.slice(0, trimmed.indexOf(']') + 1)
    : trimmed.split(':')[0]
  return withoutPort || null
}

/** true = evento de dev/preview/teste; não entra em relatório de mercado. */
export function isInternalHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host)
  // Sem host não dá para afirmar que é público — mas também não dá para
  // afirmar que é interno. Chamada interna do próprio servidor (cron, job):
  // trata como PÚBLICO para não esconder evento real por falta de header.
  if (!normalized) return false
  return !publicHosts().includes(normalized)
}

/** Idem, a partir de uma request (Next ou Request puro). */
export function isInternalRequest(req: Request | null | undefined): boolean {
  if (!req) return false
  // x-forwarded-host é o que a Vercel preenche atrás do proxy; host é o
  // fallback do runtime local.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  return isInternalHost(host)
}

/** Ambiente de execução fora de produção (preview/development da Vercel e
 *  `npm run dev`). Segunda rede de proteção: mesmo que o host esteja na
 *  allowlist, um build que não é o de produção não gera dado de mercado. */
export function isNonProductionRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv) return vercelEnv !== 'production'
  return process.env.NODE_ENV !== 'production'
}

/** Decisão final usada pelos pontos de escrita. */
export function isInternalTraffic(req: Request | null | undefined): boolean {
  return isInternalRequest(req) || isNonProductionRuntime()
}
