import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRows } from '@/lib/storage/signed'

// GET /api/video/history?limit=N
// Retorna os últimos vídeos do usuário (renders com ambient='video').
// Pequeno endpoint dedicado pro carrossel do módulo Animar — usa só os
// campos que a UI precisa renderizar.

const DEFAULT_LIMIT = 18
const MAX_LIMIT     = 50

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = (() => {
    const n = Number(limitParam)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.floor(n))
  })()

  const { data, error } = await supabase
    .from('renders')
    .select('id, input_url, output_url, style, lighting, cost_credits, status, created_at')
    .eq('user_id', user.id)
    .eq('ambient', 'video')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/video/history]', error)
    return NextResponse.json({ error: 'Falha ao carregar histórico' }, { status: 500 })
  }

  const videos = await signRows(createAdminClient(), data ?? [], ['input_url', 'output_url'])
  return NextResponse.json({ videos })
}
