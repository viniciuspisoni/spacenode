import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { amount } from './aggregate'
import { normalizeProvider } from './catalog'
import type { CostEvent } from './types'

export function costModule(context: string) {
  if (context.startsWith('generate')) return 'Renderizar'
  if (/upscale|ampliar/.test(context)) return 'Ampliar'
  if (/edit|retocar|finaliz/.test(context)) return 'Editar'
  if (/apresentar|humanized|moodboard|board/.test(context)) return 'Apresentar'
  if (/video|veo|animar/.test(context)) return 'Animar'
  if (/3d|meshy/.test(context)) return 'Blocos 3D'
  return 'Visão e briefing'
}
/** Register after() before a call settles, including losing hedge branches.
 * Delivery returns the original promise without awaiting database telemetry. */
export function observeApiCall<T>(metadata: { provider: string; endpoint: string; context: string }, call: () => Promise<T>, measure?: (value: T) => { requestId?: string | null; usd?: number | null }): Promise<T> {
  const start = Date.now(), id = randomUUID(), pending = call()
  const observation: Promise<CostEvent> = pending.then(value => {
    let measured: { requestId?: string | null; usd?: number | null } = {}
    try { measured = measure?.(value) ?? {} } catch { /* telemetry must not fail delivery */ }
    return { id, created_at: new Date(start).toISOString(), module: costModule(metadata.context), provider: normalizeProvider(metadata.provider), endpoint: metadata.endpoint, request_id: measured.requestId ?? null, status: 'completed', estimated_usd: amount(measured.usd), real_usd: null, duration_ms: Date.now() - start }
  }, () => ({ id, created_at: new Date(start).toISOString(), module: costModule(metadata.context), provider: normalizeProvider(metadata.provider), endpoint: metadata.endpoint, request_id: null, status: 'failed', estimated_usd: null, real_usd: null, duration_ms: Date.now() - start }))
  try {
    after(async () => {
      const event = await observation
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
      try { const { error } = await createAdminClient().from('api_cost_events').insert(event); if (error) console.warn(`[costs] event not persisted: ${error.code}`) }
      catch { console.warn('[costs] event persistence unavailable') }
    })
  } catch { /* preserve behavior outside a Next request */ }
  return pending
}
