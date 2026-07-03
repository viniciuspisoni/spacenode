// /api/finalizar/projects
//   GET  → lista as composições do usuário (resumo p/ galeria)
//   POST → cria uma composição
//
// Cliente user-scoped (RLS). NÃO consome Nodes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRows, signStorageUrl } from '@/lib/storage/signed'

interface CreateBody {
  name?: string
  base_image_url?: string | null
  source_space_id?: string | null
  width?: number
  height?: number
  document?: unknown
  thumbnail_url?: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('finalize_projects')
    .select('id, name, thumbnail_url, updated_at')
    .order('updated_at', { ascending: false })
    .limit(120)

  if (error) {
    console.error('[finalizar.projects.list]', error)
    return NextResponse.json({ error: 'Erro ao listar composições' }, { status: 500 })
  }
  // Assina thumbnail_url de cada composição (space-mestres vira privado; no-op enquanto público).
  const projects = await signRows(createAdminClient(), data ?? [], ['thumbnail_url'])
  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as CreateBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  if (!body.document || typeof body.document !== 'object') {
    return NextResponse.json({ error: 'Composição inválida' }, { status: 400 })
  }

  const name = (body.name ?? 'Composição sem título').toString().trim().slice(0, 120) || 'Composição sem título'

  const { data, error } = await supabase
    .from('finalize_projects')
    .insert({
      user_id: user.id,
      name,
      base_image_url: body.base_image_url ?? null,
      source_space_id: body.source_space_id ?? null,
      width: typeof body.width === 'number' ? Math.round(body.width) : null,
      height: typeof body.height === 'number' ? Math.round(body.height) : null,
      document: body.document,
      thumbnail_url: body.thumbnail_url ?? null,
    })
    .select('id, name, thumbnail_url, updated_at')
    .single()

  if (error || !data) {
    console.error('[finalizar.projects.create]', error)
    return NextResponse.json({ error: 'Erro ao salvar composição' }, { status: 500 })
  }
  const project = { ...data, thumbnail_url: await signStorageUrl(createAdminClient(), data.thumbnail_url) }
  return NextResponse.json({ project }, { status: 201 })
}
