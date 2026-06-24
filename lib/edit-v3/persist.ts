// lib/edit-v3/persist.ts
//
// Persistência RESILIENTE dos jobs do Editar V3 na tabela edit_v3_jobs.
// Best-effort por construção: se a migration ainda não foi aplicada (tabela
// ausente) ou qualquer erro de telemetria ocorrer, a edição NUNCA quebra — só
// loga. A rota funciona com OU sem a tabela (a migration aguarda aprovação do
// fundador antes de ser aplicada).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EditV3JobRecord, EditV3Status } from './types'

type Admin = SupabaseClient

/** Insere o job inicial (status 'processing'); devolve o id ou null. */
export async function insertJobResilient(
  admin: Admin,
  row: Partial<EditV3JobRecord> & { user_id: string; action_type: string; status: EditV3Status },
): Promise<string | null> {
  const res = await admin.from('edit_v3_jobs').insert(row).select('id').single()
  if (res.error) {
    console.warn('[edit-v3] job insert falhou (telemetria perdida):', res.error.message)
    return null
  }
  return (res.data?.id as string) ?? null
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
