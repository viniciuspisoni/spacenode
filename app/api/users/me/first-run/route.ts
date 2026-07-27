// POST /api/users/me/first-run
//
// Encerra o fluxo guiado de primeiro render (/app/comecar) pro usuário logado:
// grava profiles.first_run_done_at e o /app para de redirecionar pra lá.
//
// Chamado nos dois desfechos — concluiu a primeira imagem OU dispensou o
// fluxo. É idempotente: só escreve se ainda estiver NULL, então reenviar não
// reescreve a data original.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ first_run_done_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('first_run_done_at', null)

  if (error) {
    console.error('[first-run] update falhou:', error)
    return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
