import type { SupabaseClient } from '@supabase/supabase-js'

// ── Acesso interno (admin / suporte / dev) ─────────────────────────────────────
//
// Decide se o usuário atual pode ver dados de diagnóstico da plataforma
// (log técnico bruto, request ids de provider, endpoints, prompt final
// proprietário). Usuário comum nunca recebe esses dados — a redação acontece
// no servidor, não só na UI.
//
// Duas fontes, em ordem:
//   1. INTERNAL_STAFF_EMAILS — lista separada por vírgula no env (funciona já,
//      sem migration). Lembrar da paridade de env na Vercel ao configurar.
//   2. profiles.role ∈ ('admin', 'support', 'owner') — leitura resiliente: se
//      a coluna ainda não existir, o select falha e o resultado é `false`.
//      (Não confundir com workspace_members.role, que é papel DENTRO de um
//      workspace de cliente, não acesso interno da SpaceNode.)

const INTERNAL_ROLES = new Set(['admin', 'support', 'owner'])

export async function isInternalStaff(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<boolean> {
  const allowlist = (process.env.INTERNAL_STAFF_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && allowlist.includes(user.email.toLowerCase())) return true

  const { data, error } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error || !data) return false

  const role = (data as { role?: unknown }).role
  return typeof role === 'string' && INTERNAL_ROLES.has(role)
}
