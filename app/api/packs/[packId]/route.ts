// GET / PUT / DELETE /api/packs/[packId]

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PackNarrative } from '@/lib/spaces/types'

const NARRATIVES: PackNarrative[] = ['tour', 'dia_noite', 'detalhes', 'hero']

export async function GET(
  _req:    NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('packs').select('*').eq('id', packId).single()
  if (error || !data) {
    return NextResponse.json({ error: 'Pack não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ pack: data })
}

export async function PUT(
  req:     NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | {
        narrative?:      string
        vistas_ordered?: string[]
        client_name?:    string
        client_email?:   string
        description?:    string
      }
    | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.narrative && NARRATIVES.includes(body.narrative as PackNarrative)) {
    update.narrative = body.narrative
  }
  if (Array.isArray(body.vistas_ordered)) {
    update.vistas_ordered = body.vistas_ordered.filter(v => typeof v === 'string')
  }
  if (typeof body.client_name === 'string')  update.client_name  = body.client_name
  if (typeof body.client_email === 'string') update.client_email = body.client_email
  if (typeof body.description === 'string')  update.description  = body.description

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('packs').update(update).eq('id', packId)
    .select('*').single()
  if (error || !data) {
    return NextResponse.json({ error: 'Erro ao atualizar pack' }, { status: 500 })
  }
  return NextResponse.json({ pack: data })
}

export async function DELETE(
  _req:    NextRequest,
  context: { params: Promise<{ packId: string }> },
) {
  const { packId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await supabase.from('packs').delete().eq('id', packId)
  if (error) {
    return NextResponse.json({ error: 'Erro ao remover pack' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
