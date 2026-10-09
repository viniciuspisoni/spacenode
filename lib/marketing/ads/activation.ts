import type { SupabaseClient } from '@supabase/supabase-js'

const USER_BATCH_SIZE = 500
const ROW_PAGE_SIZE = 500
type UserRow = { user_id: string | null; output_url?: string | null }
type UserQueryResult = { data: UserRow[] | null; error: { message: string } | null }
type UserQuery = (from: number, to: number) => PromiseLike<UserQueryResult>

async function readUserIds(
  query: UserQuery,
  source: string,
  include: (row: UserRow) => boolean = () => true,
): Promise<Set<string>> {
  const users = new Set<string>()
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await query(from, from + ROW_PAGE_SIZE - 1)
    if (error) throw new Error(`Falha ao ler ${source} (ativação): ${error.message}`)
    if (!data) throw new Error(`Dados indisponíveis ao ler ${source} (ativação)`)
    const rows = data
    for (const row of rows) if (row.user_id && include(row)) users.add(row.user_id)
    if (rows.length < ROW_PAGE_SIZE) return users
  }
}

export interface ActivationReconciliation {
  /** Confirmed output, distinct from perceived value. */
  activated: Set<string>
  /** Confirmed output without first_generation (legacy/telemetry gap). */
  legacy: Set<string>
  /** Event without confirmed output: unknown, not a first-generation nudge. */
  eventOnly: Set<string>
  internal: Set<string>
}

/** Reconcile each account; another user's instrumentation never disables legacy
 * coverage. Events alone do not prove persistence: the generate route can emit
 * first_generation even when inserting the history record fails.
 */
export async function reconcileActivationUsers(
  admin: SupabaseClient,
  signupUserIds: string[],
): Promise<ActivationReconciliation> {
  const result: ActivationReconciliation = {
    activated: new Set(), legacy: new Set(), eventOnly: new Set(), internal: new Set(),
  }
  const allIds = [...new Set(signupUserIds)]
  for (let i = 0; i < allIds.length; i += USER_BATCH_SIZE) {
    const chunk = allIds.slice(i, i + USER_BATCH_SIZE)
    const internal = await readUserIds((from, to) => admin.schema('marketing')
      .from('internal_actors').select('user_id').in('user_id', chunk)
      .order('user_id', { ascending: true }).range(from, to), 'contas internas')
    for (const id of internal) result.internal.add(id)
    const external = chunk.filter(id => !internal.has(id))
    if (external.length === 0) continue

    const [events, renders] = await Promise.all([
      readUserIds((from, to) => admin.schema('marketing')
        .from('acquisition_events').select('user_id')
        .eq('event_type', 'first_generation').eq('is_internal', false)
        .in('user_id', external).order('id', { ascending: true }).range(from, to),
      'eventos de primeira geração'),
      readUserIds((from, to) => admin.from('renders').select('user_id,output_url')
        .in('user_id', external).eq('status', 'completed')
        .or('is_internal_test.is.null,is_internal_test.eq.false')
        .not('output_url', 'is', null).neq('output_url', '')
        .order('id', { ascending: true }).range(from, to), 'renders concluídos',
      row => typeof row.output_url === 'string' && row.output_url.trim().length > 0),
    ])
    for (const id of renders) {
      result.activated.add(id)
      if (!events.has(id)) result.legacy.add(id)
    }
    for (const id of events) if (!renders.has(id)) result.eventOnly.add(id)
  }
  return result
}

export async function computeActivatedUsers(
  admin: SupabaseClient,
  signupUserIds: string[],
): Promise<Set<string>> {
  const result = await reconcileActivationUsers(admin, signupUserIds)
  if (result.eventOnly.size > 0) {
    console.warn(`[marketing/ads] ativação: ${result.eventOnly.size} contas com evento sem render concluído confirmado`)
  }
  return result.activated
}

