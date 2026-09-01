import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export type RequestUserAuthSource = 'bearer' | 'cookie' | 'none'

export interface RequestUserResult {
  user: User | null
  source: RequestUserAuthSource
}

export function bearerTokenFromRequest(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization) return null

  const match = authorization.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  return token || null
}

export async function getRequestUser(req: NextRequest): Promise<RequestUserResult> {
  const bearerToken = bearerTokenFromRequest(req)
  if (bearerToken) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
    if (!error && user) return { user, source: 'bearer' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { user, source: user ? 'cookie' : 'none' }
}
