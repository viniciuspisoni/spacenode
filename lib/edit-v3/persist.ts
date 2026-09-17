// lib/edit-v3/persist.ts
//
// Persistência RESILIENTE dos jobs de edição na tabela edit_v3_jobs — usada
// pelo Editar V3 E pelo V4 (o nome da tabela ficou; é dela que a aba Edições do
// Histórico lê, e trocar por uma tabela nova custaria refazer aquela integração
// inteira para não ganhar nada).
// Best-effort por construção: se a migration ainda não foi aplicada (tabela
// ausente) ou qualquer erro de telemetria ocorrer, a edição NUNCA quebra — só
// loga. A rota funciona com OU sem a tabela (a migration aguarda aprovação do
// fundador antes de ser aplicada).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditV3JobRecord, EditV3Status } from './types'

type Admin = SupabaseClient

/** O mesmo client_request_id já tem um job em voo (índice único da migration
 *  20260917120000): quem chega depois espera, em vez de gerar em paralelo. */
export class JobConflictError extends Error {
  constructor(clientRequestId: string) {
    super(`edit job em andamento para client_request_id=${clientRequestId}`)
    this.name = 'JobConflictError'
  }
}

/** Código PostgREST/Postgres de "coluna não existe" — a migration que criou
 *  a coluna ainda não foi aplicada neste ambiente. */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST204' || error?.code === '42703'
}

/** Insere o job inicial (status 'processing'); devolve o id ou null. */
export async function insertJobResilient(
  admin: Admin,
  // `action_type` fica como string: o V4 grava 'replace_object', que não existe
  // no vocabulário do V3 (o CHECK do banco aceita os dois desde a migration
  // 20260910040000).
  row: Omit<Partial<EditV3JobRecord>, 'action_type'> & {
    user_id: string
    action_type: string
    status: EditV3Status
    /** Idempotência do plugin SketchUp (coluna da migration 20260917120000). */
    client_request_id?: string
  },
): Promise<string | null> {
  let res = await admin.from('edit_v3_jobs').insert(row).select('id').single()
  if (res.error && res.error.code === '23505' && row.client_request_id) {
    throw new JobConflictError(row.client_request_id)
  }
  // Ambiente sem a coluna client_request_id: regrava sem ela — telemetria
  // continua inteira, só a idempotência por id fica desligada.
  if (res.error && isMissingColumn(res.error) && row.client_request_id) {
    const { client_request_id: _omit, ...withoutId } = row
    void _omit
    res = await admin.from('edit_v3_jobs').insert(withoutId).select('id').single()
  }
  if (res.error) {
    console.warn('[edit-v3] job insert falhou (telemetria perdida):', res.error.message)
    return null
  }
  return (res.data?.id as string) ?? null
}

/** Job anterior do MESMO usuário com o MESMO client_request_id — a base da
 *  idempotência do Editar V4. Sem a coluna (ou em qualquer erro) devolve null:
 *  a rota segue gerando como sempre. */
export interface PriorEditJob {
  id: string
  status: string
  result_image_url: string | null
  nodes_cost: number | null
  charged: boolean | null
  created_at: string
}

export async function findJobByClientRequestId(
  admin: Admin,
  userId: string,
  clientRequestId: string,
): Promise<PriorEditJob | null> {
  const res = await admin
    .from('edit_v3_jobs')
    .select('id, status, result_image_url, nodes_cost, charged, created_at')
    .eq('user_id', userId)
    .eq('client_request_id', clientRequestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (res.error) {
    if (!isMissingColumn(res.error)) {
      console.warn('[edit-v4] busca por client_request_id falhou:', res.error.message)
    }
    return null
  }
  return (res.data as PriorEditJob | null) ?? null
}

/** Atualiza o job (no-op se id null). Best-effort. */
export async function updateJobResilient(
  admin: Admin,
  jobId: string | null,
  patch: Partial<EditV3JobRecord> & { status?: EditV3Status; completed_at?: string },
): Promise<void> {
  if (!jobId) return
  const res = await admin.from('edit_v3_jobs').update(patch).eq('id', jobId)
  if (res.error) {
    console.warn('[edit-v3] job update falhou:', res.error.message)
  }
}
