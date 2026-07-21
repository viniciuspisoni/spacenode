// /api/finalizar/projects/[id]
//   GET    → uma composição
//   PUT    → atualiza a composição
//   DELETE → remove a composição
//
// Next 16: params é Promise (await). RLS + defense-in-depth (.eq user_id).
// NÃO consome Nodes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeOwnedStorageObjects, collectUrls } from '@/lib/storage/cleanup'
import { mediaProxyUrl, mediaProxyDeep } from '@/lib/storage/signed'

type Params = { params: Promise<{ id: string }> }

interface UpdateBody {
  name?: string
  base_image_url?: string | null
  source_space_id?: string | null
  width?: number
  height?: number
  document?: unknown
  thumbnail_url?: string | null
  /** Pré-condição opcional: updated_at visto pelo cliente. Se o registro já
   *  mudou (outra aba), o PUT devolve 409 em vez de sobrescrever. */
  expected_updated_at?: string
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('finalize_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
  // Editor round-trip: usa URL de PROXY (estável) em base/thumbnail + nas URLs
  // aninhadas no document (layers[].url/maskUrl), NÃO signed URL (que expiraria e
  // seria persistida no save-back). O proxy é estável e re-resolve o acesso.
  const project = {
    ...data,
    base_image_url: mediaProxyUrl(data.base_image_url),
    thumbnail_url:  mediaProxyUrl(data.thumbnail_url),
    document:       mediaProxyDeep(data.document),
  }
  return NextResponse.json({ project })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as UpdateBody | null
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  if (body.document !== undefined && (typeof body.document !== 'object' || body.document === null)) {
    return NextResponse.json({ error: 'Composição inválida' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120) || 'Composição sem título'
  if (body.base_image_url !== undefined) patch.base_image_url = body.base_image_url
  if (body.source_space_id !== undefined) patch.source_space_id = body.source_space_id
  if (typeof body.width === 'number') patch.width = Math.round(body.width)
  if (typeof body.height === 'number') patch.height = Math.round(body.height)
  if (body.document !== undefined) patch.document = body.document
  if (body.thumbnail_url !== undefined) patch.thumbnail_url = body.thumbnail_url

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  let query = supabase
    .from('finalize_projects')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (typeof body.expected_updated_at === 'string' && body.expected_updated_at) {
    query = query.eq('updated_at', body.expected_updated_at)
  }
  const { data, error } = await query
    .select('id, name, thumbnail_url, updated_at')
    .maybeSingle()

  if (error) {
    console.error('[finalizar.projects.update]', error)
    return NextResponse.json({ error: 'Erro ao salvar composição' }, { status: 500 })
  }
  if (!data) {
    // Pré-condição falhou (registro mudou em outra aba) ou id inexistente.
    if (typeof body.expected_updated_at === 'string' && body.expected_updated_at) {
      return NextResponse.json(
        { error: 'O projeto foi alterado em outra aba — recarregue para continuar.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Composição não encontrada' }, { status: 404 })
  }
  const project = { ...data, thumbnail_url: mediaProxyUrl(data.thumbnail_url) }
  return NextResponse.json({ project })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Busca as URLs de storage do projeto ANTES de apagar a linha (scoped por user).
  const { data: proj } = await supabase
    .from('finalize_projects')
    .select('base_image_url, thumbnail_url, document')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const { error } = await supabase
    .from('finalize_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[finalizar.projects.delete]', error)
    return NextResponse.json({ error: 'Erro ao excluir composição' }, { status: 500 })
  }

  // Higiene de storage (best-effort): remove só arquivos criados pela própria
  // ferramenta Finalizar (namespace `${user.id}/finalizar/`) — nunca um asset
  // reaproveitado de outra feature (ex.: base_image_url que aponta pra um render
  // ou uma edição em `${user.id}/retocar/…`). Roda DEPOIS do delete: uma falha
  // aqui não desfaz a exclusão da composição.
  if (proj) {
    const admin = createAdminClient()
    await removeOwnedStorageObjects(
      admin,
      [proj.base_image_url, proj.thumbnail_url, ...collectUrls(proj.document)],
      { userId: user.id, keyPrefix: `${user.id}/finalizar/` },
    )
  }

  return NextResponse.json({ ok: true })
}
