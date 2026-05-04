import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ spaceId: string }> }

// ── GET /api/spaces/[spaceId] — detalhe do Space ──────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: space, error: spaceErr } = await supabase
    .from('spaces_with_counts')
    .select('*')
    .eq('id', spaceId)
    .single()

  if (spaceErr || !space) {
    return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })
  }

  // Buscar Vista Mestre
  let anchor = null
  if (space.anchor_render_id) {
    const { data } = await supabase
      .from('renders')
      .select('*')
      .eq('id', space.anchor_render_id)
      .single()
    anchor = data
  }

  return NextResponse.json({ space, anchor })
}
