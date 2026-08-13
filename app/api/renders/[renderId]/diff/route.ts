// GET /api/renders/[renderId]/diff — mapa visual de diferenças estruturais.
//
// Devolve um PNG: o input original esmaecido com, em vermelho, as bordas
// estruturais que NÃO foram encontradas no render gerado (mesma lógica do
// edgeRecall do gate de fidelidade). Alimenta o toggle "Ver diferenças" do
// comparador — a engenharia de fidelidade vira algo que o usuário ENXERGA.
//
// Auth via sessão; o SELECT em `renders` roda sob RLS (só o dono lê a linha).
// URLs passam pelo allowlist do fetch server-side (Storage próprio + CDN FAL).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { buildStructuralDiffPng } from '@/lib/ai/fidelity/geometry-score'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ renderId: string }> },
) {
  const { renderId } = await context.params
  if (!UUID_RE.test(renderId)) {
    return NextResponse.json({ error: 'Render inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: render, error } = await supabase
    .from('renders')
    .select('id, input_url, output_url')
    .eq('id', renderId)
    .single()
  if (error || !render?.input_url || !render?.output_url) {
    return NextResponse.json({ error: 'Render não encontrado' }, { status: 404 })
  }

  try {
    const [originalBuf, generatedBuf] = await Promise.all([
      fetchStorageBuffer(render.input_url),
      fetchStorageBuffer(render.output_url),
    ])
    const png = await buildStructuralDiffPng(originalBuf, generatedBuf)
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type':  'image/png',
        // Par input/output é imutável por render — cache privado longo.
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (err) {
    console.error('[renders/diff] falhou:', (err as Error).message)
    return NextResponse.json({ error: 'Não foi possível gerar o mapa de diferenças.' }, { status: 500 })
  }
}
