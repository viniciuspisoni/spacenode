// Autenticação de request com dois modos: cookie (browser/SSR) e Bearer
// (clientes fora do browser — hoje o plugin SketchUp). O Bearer carrega o
// access token da sessão Supabase do próprio usuário; a validação é via
// auth.getUser(token) com o client anon.
//
// Regra de segurança: um header Authorization presente e INVÁLIDO nunca cai
// pro cookie — quem se anuncia como cliente Bearer é tratado como Bearer até
// o fim (evita que um token errado seja mascarado por uma sessão de browser).

import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export type RequestUserAuthSource = 'bearer' | 'cookie' | 'none'

export interface RequestUserResult {
  user: User | null
  source: RequestUserAuthSource
}

export interface RequestAuthContext extends RequestUserResult {
  /** Client RLS agindo como o usuário (cookie SSR ou escopado no bearer).
   *  null quando não autenticado. */
  supabase: SupabaseClient | null
}

export function bearerTokenFromRequest(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization) return null

  const match = authorization.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  return token || null
}

// Client anon com o token do usuário no header global: queries PostgREST
// rodam sob a RLS do usuário, igual ao client de cookie do browser.
function createBearerClient(token: string): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

export async function getRequestAuthContext(req: NextRequest): Promise<RequestAuthContext> {
  const bearerToken = bearerTokenFromRequest(req)
  if (bearerToken) {
    const supabase = createBearerClient(bearerToken)
    const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
    if (!error && user) return { user, source: 'bearer', supabase }
    return { user: null, source: 'none', supabase: null }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
    ? { user, source: 'cookie', supabase: supabase as unknown as SupabaseClient }
    : { user: null, source: 'none', supabase: null }
}

export async function getRequestUser(req: NextRequest): Promise<RequestUserResult> {
  const { user, source } = await getRequestAuthContext(req)
  return { user, source }
}
