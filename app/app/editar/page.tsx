// /app/editar — Editar.
//
// Fork por feature flag (precedência de cima p/ baixo):
//   NEXT_PUBLIC_EDIT_V4=1       → Editar unificado: edição por IA e
//                                 pós-produção na MESMA ferramenta, sobre o
//                                 motor não-destrutivo que era o Finalizar.
//   NEXT_PUBLIC_EDIT_V3=1       → Editar V3 (EditV3Flow), Google/Gemini-first.
//                                 EDITOR PADRÃO até a virada do V4.
//   NEXT_PUBLIC_EDIT_V2_CLEAN=1 → Editar Clean (EditCleanFlow), legado.
//   NEXT_PUBLIC_EDIT_V2=1       → laboratório v2 (EditV2Flow), congelado.
//   (sem flag)                  → Editar v1 (RetocarStandaloneFlow), intocado.
// Rollback = remover a flag (cai para o editor anterior). Nada é removido.
//
// Por que a fusão: o módulo de pós-produção já tinha a lista inteira de ajustes
// (exposição, cor, curva, HSL, máscaras locais, geometria, camadas) e ficou com
// 3 projetos em dois meses contra 2.381 renders — porque era um DESTINO, e as
// pessoas seguem o fluxo. Ver docs/EDITAR-V4.md.

import { createClient } from '@/lib/supabase/server'
import EditOnboardingGuide from '@/components/app/EditOnboardingGuide'
import EditHandoff from '@/components/app/EditHandoff'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { redirect } from 'next/navigation'
import { RetocarStandaloneFlow } from '@/components/spaces/RetocarStandaloneFlow'
import { EditV2Flow } from '@/components/editar/EditV2Flow'
import { EditCleanFlow } from '@/components/editar/EditCleanFlow'
import { EditV3Flow } from '@/components/edit-v3/EditV3Flow'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import { signRows } from '@/lib/storage/signed'
import { assertSafeImageUrl } from '@/lib/edit-v3/ssrf'
import { nodesForEdit } from '@/lib/edit-v4/pricing'
import { economicEnabled, ECONOMIC_NODES } from '@/lib/edit-v4/economic/policy'
import { editV4Enabled, editV4Route } from '@/lib/edit-v4/flags'
import { editV4ExecutionAvailable } from '@/lib/edit-v4/availability'
import type { FinalizeProjectSummary } from '@/lib/finalizar/types'
import { loadOwnRenderRecovery } from '@/lib/onboarding/render-recovery-server'
import RenderRecoveryGuide from '@/components/app/RenderRecoveryGuide'

/** `?source=` só é aceito se apontar para uma origem da casa — a MESMA
 *  allowlist que a rota de edição usa. Sem isto, um link montado por terceiro
 *  abriria o editor com uma imagem de fora e ela viraria o primeiro upload. */
function safeSource(raw: string | string[] | undefined): string | null {
  const url = typeof raw === 'string' ? raw : null
  if (!url) return null
  try {
    assertSafeImageUrl(url)
    return url
  } catch {
    return null
  }
}

export default async function EditarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const economicEditing = economicEnabled(user.id)
  const aiExecutionAvailable = editV4ExecutionAvailable(user.id)

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)
  const balance = payerBalance.totalBalance
  const params = await searchParams
  const guided = params.onboarding === '1'
  const recovery = await loadOwnRenderRecovery(supabase, user.id, params.recovery, params.reason)
  // A recovery always loads this owner's persisted output, never a URL supplied in the link.
  const source = recovery?.outputUrl ?? (params.recovery ? null : safeSource(params.source))
  const handoffId = !params.recovery && typeof params.handoff === 'string' ? params.handoff : null
  const showPlanOffer = payerBalance.planId === 'free' && !payerBalance.pooled
  if (recovery?.reason === 'geometry') return <main style={{ flex: 1, overflowY: 'auto' }}><RenderRecoveryGuide recovery={recovery} /></main>

  // ── Editar unificado ──────────────────────────────────────────────────────
  // Sai antes do fork antigo de propósito: é o único que precisa do papel de
  // parede do <Ambient/> aparecendo por trás do vidro, e o <main> com cor
  // chapada abaixo pinta por cima dele. Os quatro editores antigos seguem
  // exatamente como estavam.
  if (process.env.NEXT_PUBLIC_EDIT_V4 === '1') {
    const { data } = await supabase
      .from('finalize_projects')
      .select('id, name, thumbnail_url, updated_at')
      .order('updated_at', { ascending: false })
      .limit(120)
    // Assina thumbnail_url antes de passar pro client (bucket privado).
    const savedProjects = (await signRows(
      createAdminClient(), data ?? [], ['thumbnail_url'],
    )) as FinalizeProjectSummary[]

    return (
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {guided && !recovery && !handoffId && <EditOnboardingGuide />}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
          {handoffId ? <EditHandoff key={`${user.id}:${handoffId}`} ownerId={user.id} handoffId={handoffId}
            editor="v4" savedProjects={savedProjects} initialBalance={balance} showPlanOffer={showPlanOffer}
            economicEditing={economicEditing} nodesPerEdit={economicEditing ? ECONOMIC_NODES : nodesForEdit({ provider: editV4Route() })} aiEnabled={editV4Enabled()} aiExecutionAvailable={aiExecutionAvailable} /> : <FinalizeEditor
            key={recovery ? `${recovery.renderId}:${recovery.reason}` : source ?? 'new'}
            savedProjects={savedProjects}
            initialSourceUrl={source}
            recovery={recovery}
            showPlanOffer={showPlanOffer}
            initialBalance={balance}
            economicEditing={economicEditing} nodesPerEdit={economicEditing ? ECONOMIC_NODES : nodesForEdit({ provider: editV4Route() })}
            aiEnabled={editV4Enabled()}
            aiExecutionAvailable={aiExecutionAvailable}
            editorTitle="Editar"
          />}
        </div>
      </div>
    )
  }

  const useV3 = process.env.NEXT_PUBLIC_EDIT_V3 === '1'
  const useClean = process.env.NEXT_PUBLIC_EDIT_V2_CLEAN === '1'
  const useV2 = process.env.NEXT_PUBLIC_EDIT_V2 === '1'

  // Legacy screens cannot accept a source. Keep the handoff in a supported editor;
  // the free post-production editor remains available if AI editing is disabled.
  if (handoffId) return <EditHandoff key={`${user.id}:${handoffId}`} ownerId={user.id} handoffId={handoffId}
    editor={useV3 ? 'v3' : 'v4'} initialBalance={balance} economicEditing={economicEditing} nodesPerEdit={economicEditing ? ECONOMIC_NODES : nodesForEdit({ provider: editV4Route() })}
    aiEnabled={false} aiExecutionAvailable={false} showPlanOffer={showPlanOffer} />

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      {guided && !recovery && <EditOnboardingGuide />}
      {useV3 ? (
        <EditV3Flow key={recovery ? `${recovery.renderId}:${recovery.reason}` : source ?? 'new'} initialBalance={balance} initialSourceUrl={source} recovery={recovery} showPlanOffer={showPlanOffer} />
      ) : useClean ? (
        <EditCleanFlow initialBalance={balance} />
      ) : useV2 ? (
        <EditV2Flow initialBalance={balance} />
      ) : (
        <RetocarStandaloneFlow initialBalance={balance} />
      )}
    </main>
  )
}
