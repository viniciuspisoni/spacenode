// Resolução do "workspace ativo" de um usuário.
//
// Decisão de produto (2026-06): cada usuário pertence a EXATAMENTE UM workspace
// ativo por vez (garantido pelo índice único parcial uq_wm_one_active_per_user
// em workspace_members). Logo, "workspace ativo" é simplesmente a única
// membership com status='active' da pessoa.
//
// Onde isto é usado:
//   - Fase 2 (tela Equipe): resolver papel/workspace do solicitante.
//   - Fase 1.5 (cobrança): resolver o `ownerId` do workspace = a conta que paga
//     os nodes (a "bolsa"). Em workspace individual, ownerId === o próprio
//     usuário, então a cobrança fica idêntica à de hoje.
//
// O carimbo de workspace_id nas gerações é feito por TRIGGER no banco
// (set_generation_workspace_id / set_shot_workspace_id), então as rotas de
// geração não chamam este helper.

import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkspaceRole = 'owner' | 'admin' | 'member'
export type WorkspaceType = 'individual' | 'office'

export interface ActiveWorkspace {
  workspaceId: string
  name:        string
  role:        WorkspaceRole
  type:        WorkspaceType
  /** Dono do workspace = conta que paga os nodes (a "bolsa"). */
  ownerId:     string
}

/**
 * Retorna o workspace ativo do usuário, ou null se ele não tiver membership ativa
 * (não deve acontecer — o cadastro cria uma; tratar null como "fallback ao fluxo
 * individual" em quem chamar).
 *
 * Passe um client que consiga ler a membership do usuário: service-role nas rotas
 * server-side, ou o client da sessão do próprio usuário (RLS já permite ler a
 * própria membership).
 */
export async function getActiveWorkspace(
  client: SupabaseClient,
  userId: string,
): Promise<ActiveWorkspace | null> {
  const { data, error } = await client
    .from('workspace_members')
    .select('role, workspace:workspaces!inner ( id, name, type, owner_id )')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const row = data as unknown as {
    role: WorkspaceRole
    workspace: { id: string; name: string; type: WorkspaceType; owner_id: string } | null
  }
  if (!row.workspace) return null

  return {
    workspaceId: row.workspace.id,
    name:        row.workspace.name,
    role:        row.role,
    type:        row.workspace.type,
    ownerId:     row.workspace.owner_id,
  }
}

/** Atalho: só o id do workspace ativo (ou null). */
export async function getActiveWorkspaceId(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  return (await getActiveWorkspace(client, userId))?.workspaceId ?? null
}

/**
 * Conta que paga os nodes do workspace ativo (a "bolsa"). Em workspace individual
 * é o próprio usuário; em escritório é o dono. Base da cobrança da Fase 1.5.
 */
export async function getPayerId(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  return (await getActiveWorkspace(client, userId))?.ownerId ?? null
}
