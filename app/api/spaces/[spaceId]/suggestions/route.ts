import { NextRequest, NextResponse } from 'next/server'
import { createClient }     from '@/lib/supabase/server'
import type { Vista }       from '@/lib/spaces/types'
import { buildSuggestions } from '@/lib/spaces/suggestions'

// ── GET /api/spaces/[spaceId]/suggestions ─────────────────────────────────────

type Params = { params: Promise<{ spaceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { spaceId } = await params

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // ── Space ownership (RLS) ─────────────────────────────────────────────────
  const { data: space } = await supabase
    .from('spaces')
    .select('id')
    .eq('id', spaceId)
    .single()
  if (!space) return NextResponse.json({ error: 'Space não encontrado' }, { status: 404 })

  // ── Fetch non-mestre completed vistas (sorted desc) ───────────────────────
  const { data: vistasRaw } = await supabase
    .from('renders')
    .select('id, vista_type, vista_label, generation_mode, status, output_url, created_at, parent_render_id')
    .eq('space_id', spaceId)
    .neq('vista_type', 'mestre')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  const vistas = (vistasRaw ?? []) as Vista[]
  const suggestions = buildSuggestions(vistas)

  return NextResponse.json({ suggestions })
}
