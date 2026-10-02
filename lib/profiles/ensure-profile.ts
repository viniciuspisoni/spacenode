// lib/profiles/ensure-profile.ts
//
// Rede de segurança para conta sem linha em public.profiles (usuário anterior
// ao trigger handle_new_user). O saldo inicial NÃO é informado aqui: vem do
// DEFAULT de profiles.credits, a mesma fonte do trigger de cadastro.
//
// INSERT que ignora conflito (ON CONFLICT DO NOTHING), nunca upsert com merge:
// o chamador decide criar quando o SELECT do profile não devolveu linha — e
// isso também acontece numa falha transitória de leitura. Com merge, essa
// falha trocava o saldo atual (inclusive o de assinante) pelo valor do
// cadastro, ou devolvia o crédito grátis a quem já tinha gastado.

import type { SupabaseClient, User } from '@supabase/supabase-js'

export async function ensureProfileRow(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
): Promise<void> {
  await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
}
