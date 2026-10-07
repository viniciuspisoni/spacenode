import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publicRenderAudit } from '@/lib/ai/fidelity/audit-status'

const PRIVATE = { 'Cache-Control': 'private, no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await params
  if (!UUID_RE.test(renderId)) return NextResponse.json({ error: 'Render inválido' }, { status: 400, headers: PRIVATE })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401, headers: PRIVATE })
  // Session client and RLS match the structural-diff endpoint's access policy.
  const { data, error } = await supabase.from('renders').select('generation_log').eq('id', renderId).maybeSingle()
  if (error) return NextResponse.json({ error: 'Não foi possível consultar a verificação' }, { status: 500, headers: PRIVATE })
  if (!data) return NextResponse.json({ error: 'Render não encontrado' }, { status: 404, headers: PRIVATE })
  return NextResponse.json(publicRenderAudit(data.generation_log), { headers: PRIVATE })
}
