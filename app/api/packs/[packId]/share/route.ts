// POST /api/packs/[packId]/share — gera share_token e expira em 90 dias.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

function makeToken(): string {
  return randomBytes(12).toString('base64url')
}

export async function POST(
  _req:    NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: pack, error: getErr } = await supabase
    .from('packs').select('id, share_token, vistas_ordered').eq('id', packId).single()
  if (getErr || !pack) {
    return NextResponse.json({ error: 'Pack não encontrado' }, { status: 404 })
  }
  const ordered = (pack.vistas_ordered as unknown[]) ?? []
  if (ordered.length === 0) {
    return NextResponse.json({ error: 'Pack sem vistas selecionadas' }, { status: 409 })
  }

  // Idempotente: se já tem token, retorna ele.
  const token = (pack.share_token as string | null) ?? makeToken()
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updErr } = await supabase
    .from('packs')
    .update({ share_token: token, expires_at: expires })
    .eq('id', packId)
  if (updErr) {
    console.error('[packs.share] update failed:', updErr)
    return NextResponse.json({ error: 'Erro ao gerar link' }, { status: 500 })
  }

  return NextResponse.json({ token, expires_at: expires })
}
