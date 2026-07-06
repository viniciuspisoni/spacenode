// lib/rate-limit.ts
//
// AL-2 da auditoria: rate limit de janela fixa via Postgres (bump_rate_limit).
// FAIL-OPEN: se a RPC falhar (migration ainda não aplicada, erro de infra),
// PERMITE — nunca bloqueia um usuário legítimo por um problema nosso. É inerte
// até a migration 20260703160000 ser aplicada.
//
// Uso típico numa rota, logo após o getUser():
//   const admin = createAdminClient()
//   const rl = await rateLimit(admin, `analyze:${user.id}`, 60, 60)
//   if (!rl.allowed) return NextResponse.json({ error: '...' }, { status: 429 })

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RateLimitResult {
  allowed: boolean
  count:   number
}

/** Conta +1 hit na janela atual de `windowSeconds` para `key` e diz se o total
 *  ainda está dentro de `max`. Fail-open em qualquer erro. */
export async function rateLimit(
  admin: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await admin.rpc('bump_rate_limit', {
    key_input:      key,
    window_seconds: windowSeconds,
  })
  if (error) {
    // 42883 = função inexistente (migration não aplicada); 42P01 = tabela. Ambos
    // esperados enquanto o AL-2 não estiver ligado → silêncio. Outros erros logam.
    if (error.code !== '42883' && error.code !== '42P01') {
      console.warn('[rate-limit] bump falhou (fail-open):', error.message)
    }
    return { allowed: true, count: 0 }
  }
  const count = typeof data === 'number' ? data : 0
  return { allowed: count <= max, count }
}

/** Deriva um identificador de IP do request (best-effort) pra limitar rotas
 *  públicas (sem user.id). Usa os headers de proxy da Vercel. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
