// DELETE /api/users/me — exclusão de conta (LGPD / direito ao esquecimento).
//
// Ação DESTRUTIVA e IRREVERSÍVEL. Requer { "confirm": "DELETE" } no corpo para
// evitar acionamento acidental (e mitigar CSRF, já além do SameSite=Lax do cookie).
//
// Ordem PROPOSITAL: apaga o usuário de auth PRIMEIRO (cascateia as linhas do DB
// via ON DELETE CASCADE) e SÓ ENTÃO remove os arquivos do Storage. Se a exclusão
// do auth falhar (ex.: alguma FK sem cascade), nada de storage é tocado → estado
// íntegro, sem exclusão parcial.
//
// PRÉ-REQUISITO antes de expor na UI: confirmar que TODAS as tabelas com user_id
// têm FK ON DELETE CASCADE para auth.users/profiles. O schema base já é cascade
// (profiles→auth.users, renders→profiles); conferir as tabelas do drift
// (edits/walkthroughs/shots) no Supabase antes de liberar publicamente.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeUserStoragePrefix } from '@/lib/storage/cleanup'

export const runtime = 'nodejs'

// Buckets onde o usuário guarda arquivos sob o prefixo `${user.id}/`.
const USER_BUCKETS = ['space-mestres', 'architect-identity']

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (!body || body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Confirmação obrigatória. Envie { "confirm": "DELETE" } para excluir a conta.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // 1. Apaga o usuário de auth → cascateia profiles + tudo que referencia
  //    profiles/auth.users com ON DELETE CASCADE. Se falhar, nada mais é tocado.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) {
    console.error('[users.me.delete] deleteUser falhou:', delErr.message)
    return NextResponse.json({ error: 'Erro ao excluir conta.' }, { status: 500 })
  }

  // 2. Remove os arquivos do usuário nos buckets (best-effort — a conta já foi
  //    excluída; arquivo órfão é reprocessável). As saídas no CDN da FAL não são
  //    nossas e permanecem lá (tratadas no B3/re-hospedagem).
  await removeUserStoragePrefix(admin, user.id, USER_BUCKETS)

  return NextResponse.json({ ok: true })
}
