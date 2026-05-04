import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { VistaType } from '@/lib/spaces/types'

type Params = { params: Promise<{ spaceId: string }> }

// ── GET /api/spaces/[spaceId]/vistas — lista Vistas do Space ─────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { spaceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Verify space ownership via RLS
  const { data: space } = await supabase
    .from('spaces')
    .select('id')
    .eq('id', spaceId)
    .single()

  if (!space) return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })

  // Optional ?vista_type= filter
  const { searchParams } = new URL(req.url)
  const vistaType = searchParams.get('vista_type') as VistaType | null

  let query = supabase
    .from('renders')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false })

  if (vistaType) {
    query = query.eq('vista_type', vistaType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/spaces/[spaceId]/vistas]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vistas: data ?? [] })
}
