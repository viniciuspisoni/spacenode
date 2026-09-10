// ── Orion · autorização ──────────────────────────────────────────────────────
//
// Duas travas em série, as duas obrigatórias:
//   1. ORION_INTERNAL_ENABLED === '1'  — flag PRIVADA de servidor, desligada
//      por padrão. Sem ela, Orion não existe pra ninguém (nem pra staff).
//   2. isInternalStaff — equipe SpaceNode (INTERNAL_STAFF_EMAILS ou
//      profiles.role ∈ admin/support/owner). Ser dono ou admin de um WORKSPACE
//      de cliente NÃO concede acesso interno: workspace_members.role é papel
//      dentro do workspace, e isInternalStaff nem o consulta.
//
// Este gate roda na página E em toda entrada de API capaz de executar Orion —
// sempre ANTES de upload intermediário, débito ou qualquer chamada paga.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaff } from '@/lib/auth/privileged'

/** Flag privada do piloto. Server-only: em client component isso é undefined,
 *  que é exatamente o comportamento desejado (Orion invisível). */
export function orionInternalEnabled(): boolean {
  return process.env.ORION_INTERNAL_ENABLED === '1'
}

export async function canUseOrion(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  if (!orionInternalEnabled()) return false
  return isInternalStaff(admin, user)
}
