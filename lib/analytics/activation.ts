import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { trackServerEvent } from './server'
import type { AnalyticsFeature } from './events'

/** A primeira conclusão em outra ferramenta após uma render. Chamado só por rotas
 * que entregaram resultado; o índice de dedupe torna a marcação única por conta. */
export async function trackSecondTool(
  admin: SupabaseClient,
  req: NextRequest | Request,
  userId: string,
  feature: Extract<AnalyticsFeature, 'editar' | 'finalizar' | 'ampliar' | 'animar'>,
): Promise<void> {
  const { data: render } = await admin.from('renders')
    .select('id').eq('user_id', userId).eq('status', 'completed')
    .in('style', ['interior', 'exterior']).limit(1).maybeSingle()
  if (!render) return
  await trackServerEvent(admin, {
    event: 'second_tool_completed', userId, req, feature,
    dedupeKey: `second-tool:${userId}`,
  })
}
