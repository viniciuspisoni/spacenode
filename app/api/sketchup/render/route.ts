// GET /api/sketchup/render?id={renderId}
//
// Reconciliação do plugin SketchUp: o /api/generate debita Nodes ANTES do
// provider e um timeout/queda de rede do cliente não desfaz o trabalho — o
// servidor termina, cobra e grava o render, mas o plugin perde a resposta.
// Esta rota deixa o plugin recuperar o resultado pago pelo renderId que ele
// guardou (ou reconferir o último render ao reabrir o painel).
//
// Mesma redação do histórico: projeção explícita, sem generation_log nem
// fal_request_id; URLs assinadas.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/request-user'
import { signRow } from '@/lib/storage/signed'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('renders')
    .select('id, user_id, status, input_url, output_url, preview_url, nodes_charged, engine, resolution, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[sketchup/render] erro ao buscar render:', error)
    return NextResponse.json({ error: 'Erro ao carregar render' }, { status: 500 })
  }
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: 'Render não encontrado' }, { status: 404 })
  }

  const signed = await signRow(admin, row as Record<string, unknown>, ['input_url', 'output_url', 'preview_url'])

  return NextResponse.json({
    id: row.id,
    status: row.status,
    inputUrl: signed.input_url ?? null,
    outputUrl: signed.output_url ?? null,
    previewUrl: signed.preview_url ?? null,
    nodesCharged: row.nodes_charged ?? null,
    createdAt: row.created_at,
  })
}
