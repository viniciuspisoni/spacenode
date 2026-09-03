import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthContext } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRows } from '@/lib/storage/signed'

// GET /api/video/history?limit=N
// Retorna os últimos vídeos do usuário (renders com ambient='video').
// Pequeno endpoint dedicado pro carrossel do módulo Animar — usa só os
// campos que a UI precisa renderizar.

const DEFAULT_LIMIT = 18
const MAX_LIMIT     = 50

export async function GET(req: NextRequest) {
  // Cookie (app web) OU Bearer (plugin SketchUp): o client devolvido já vem
  // escopado ao token (RLS) — a consulta abaixo continua filtrando por user_id.
  const { user, supabase } = await getRequestAuthContext(req)
  if (!user || !supabase) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = (() => {
    const n = Number(limitParam)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
    return Math.min(MAX_LIMIT, Math.floor(n))
  })()

  const { data, error } = await supabase
    .from('renders')
    .select('id, input_url, output_url, style, lighting, cost_credits, status, created_at, config_snapshot')
    .eq('user_id', user.id)
    .eq('ambient', 'video')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/video/history]', error)
    return NextResponse.json({ error: 'Falha ao carregar histórico' }, { status: 500 })
  }

  // Expõe só as chaves de produto do snapshot (p/ "Reutilizar configuração").
  // Vídeos antigos não têm snapshot — settings vai null e a UI degrada.
  const rows: Record<string, unknown>[] = (data ?? []).map(row => {
    const { config_snapshot, ...rest } = row as Record<string, unknown> & { config_snapshot?: unknown }
    const cs = (config_snapshot ?? null) as Record<string, unknown> | null
    const settings = cs && cs.module === 'animar'
      ? {
          video_type:    typeof cs.video_type    === 'string' ? cs.video_type    : null,
          camera_motion: typeof cs.camera_motion === 'string' ? cs.camera_motion : null,
          aspect_ratio:  typeof cs.aspect_ratio  === 'string' ? cs.aspect_ratio  : null,
          duration:      typeof cs.duration      === 'string' ? cs.duration      : null,
          intensity:     typeof cs.intensity     === 'string' ? cs.intensity     : null,
        }
      : null
    return { ...rest, settings }
  })

  const videos = await signRows(createAdminClient(), rows, ['input_url', 'output_url'])
  return NextResponse.json({ videos })
}
