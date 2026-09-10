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
import { editV4Route } from '@/lib/edit-v4/flags'
import type { FinalizeProjectSummary } from '@/lib/finalizar/types'

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

  // Saldo da bolsa (dono do workspace) — é dele que a edição debita.
  const payerBalance = await getPayerBalance(createAdminClient(), user.id)
  const balance = payerBalance.totalBalance

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
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <FinalizeEditor
          savedProjects={savedProjects}
          initialSourceUrl={safeSource((await searchParams).source)}
          initialBalance={balance}
          nodesPerEdit={nodesForEdit({ provider: editV4Route() })}
        />
      </div>
    )
  }

  const useV3 = process.env.NEXT_PUBLIC_EDIT_V3 === '1'
  const useClean = process.env.NEXT_PUBLIC_EDIT_V2_CLEAN === '1'
  const useV2 = process.env.NEXT_PUBLIC_EDIT_V2 === '1'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      {useV3 ? (
        <EditV3Flow initialBalance={balance} />
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
