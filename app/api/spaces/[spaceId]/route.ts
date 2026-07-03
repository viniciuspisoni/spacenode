// GET    /api/spaces/[spaceId]  → detalhe (com vistas count via view)
// PATCH  /api/spaces/[spaceId]  → renomear / desarquivar
// DELETE /api/spaces/[spaceId]  → arquivar (soft) — status='archived'
//
// Hard delete não é exposto: queremos preservar audit trail e evitar
// estragar packs já compartilhados.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRow } from '@/lib/storage/signed'

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .eq('id', spaceId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }

  const space = await signRow(createAdminClient(), data, ['vista_mestre_url'])
  return NextResponse.json({ space })
}

// Renomear e/ou desarquivar. Body: { name?: string, action?: 'unarchive' }.
// Ownership dupla: RLS + eq('user_id') explícito, como no DELETE.
export async function PATCH(
  req:     NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let body: { name?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const patch: Record<string, string> = {}

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json({ error: 'Nome deve ter entre 1 e 80 caracteres' }, { status: 400 })
    }
    patch.name = name
  }

  if (body.action === 'unarchive') {
    const { data: current } = await supabase
      .from('spaces')
      .select('status, locked_at, dna')
      .eq('id', spaceId)
      .eq('user_id', user.id)
      .single()
    if (!current) {
      return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
    }
    if (current.status === 'archived') {
      // Restaura pro estágio real do projeto, derivado do que já existe.
      patch.status = current.locked_at ? 'locked' : current.dna ? 'dna_extracted' : 'draft'
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('spaces')
    .update(patch)
    .eq('id', spaceId)
    .eq('user_id', user.id)
    .select('id, name, status')
    .single()

  if (error || !data) {
    console.error('[spaces.patch] update failed:', error)
    return NextResponse.json({ error: 'Erro ao atualizar Space' }, { status: 500 })
  }

  return NextResponse.json({ space: data })
}

export async function DELETE(
  _req:    NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await supabase
    .from('spaces')
    .update({ status: 'archived' })
    .eq('id', spaceId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[spaces.archive] update failed:', error)
    return NextResponse.json({ error: 'Erro ao arquivar Space' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
