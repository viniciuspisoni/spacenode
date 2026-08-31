import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isInternalStaff } from '@/lib/auth/privileged'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const privileged = await isInternalStaff(admin, user)
  if (!privileged) return NextResponse.json({ error: 'Acesso restrito a admins' }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type') || 'all' // 'render' | 'vista' | 'all'
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '200'), 500)
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') || '30'), 365) // últimos N dias
  const status = req.nextUrl.searchParams.get('status') || 'completed' // 'completed' | 'failed' | 'all'

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  try {
    const queries = []

    if (type === 'render' || type === 'all') {
      let query = admin
        .from('renders')
        .select('id, output_url, input_url, model, engine, created_at, status, nodes_charged, config_snapshot')
        .gte('created_at', startDate.toISOString())
        .not('output_url', 'is', null)

      if (status === 'completed') {
        query = query.eq('status', 'completed')
      } else if (status === 'failed') {
        query = query.eq('status', 'failed')
      }
      // 'all' ignora o filtro de status

      queries.push(
        query
          .order('created_at', { ascending: false })
          .limit(limit)
          .then(({ data }) => ({
            type: 'render',
            items: (data || []).map(r => ({
              id: r.id,
              type: 'render',
              image_url: r.output_url,
              input_url: r.input_url,
              provider: (r.config_snapshot as any)?.provider || 'unknown',
              model: (r.config_snapshot as any)?.providerModel || r.model || r.engine || 'unknown',
              latency: (r.config_snapshot as any)?.latencyMs || null,
              created_at: r.created_at,
              nodes: r.nodes_charged || 0,
              status: r.status,
            })),
          }))
      )
    }

    if (type === 'vista' || type === 'all') {
      let query = admin
        .from('vistas')
        .select('id, image_url, created_at, status, model, provider, config_snapshot')
        .gte('created_at', startDate.toISOString())
        .not('image_url', 'is', null)

      if (status === 'completed') {
        query = query.eq('status', 'completed')
      } else if (status === 'failed') {
        query = query.eq('status', 'failed')
      }

      queries.push(
        query
          .order('created_at', { ascending: false })
          .limit(limit)
          .then(({ data }) => ({
            type: 'vista',
            items: (data || []).map(v => ({
              id: v.id,
              type: 'vista',
              image_url: v.image_url,
              input_url: null,
              provider: (v.config_snapshot as any)?.provider || v.provider || 'unknown',
              model: (v.config_snapshot as any)?.providerModel || v.model || 'unknown',
              latency: (v.config_snapshot as any)?.latencyMs || null,
              created_at: v.created_at,
              nodes: 0,
              status: v.status,
            })),
          }))
      )
    }

    const results = await Promise.all(queries)
    const items = results.flatMap(r => r.items).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({
      items,
      count: items.length,
      filters: { type, status, days, limit },
    })
  } catch (error) {
    console.error('[admin/image-gallery]', error)
    return NextResponse.json({ error: 'Erro ao buscar galeria' }, { status: 500 })
  }
}
