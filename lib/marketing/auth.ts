// lib/marketing/auth.ts
//
// Gate de acesso do sistema editorial: staff interno apenas (mesmo mecanismo do
// Diagnóstico técnico do Histórico — lib/auth/privileged.ts: INTERNAL_STAFF_EMAILS
// e/ou profiles.role). Usado pelo layout de /admin/marketing e por TODA rota
// /api/admin/marketing/* — defesa em profundidade além do redirect do proxy.
//
// Server-only: cria o admin client (service role). Nunca importar de client
// component.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isInternalStaff } from '@/lib/auth/privileged'

export interface MarketingStaffContext {
  user: { id: string; email: string | null }
  /** Admin client (service role) — único caminho de acesso ao schema marketing. */
  admin: SupabaseClient
}

/** Devolve o contexto de staff ou null (não logado / não staff). Quem chama
 *  decide a resposta: notFound() nas páginas, 404 JSON nas APIs — o painel não
 *  anuncia a própria existência para quem não é staff. */
export async function getMarketingStaffContext(): Promise<MarketingStaffContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const staff = await isInternalStaff(admin, { id: user.id, email: user.email })
  if (!staff) return null

  return { user: { id: user.id, email: user.email ?? null }, admin }
}
