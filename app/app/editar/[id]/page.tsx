// /app/editar/[id] — abre um projeto salvo do Editar.
//
// A ferramenta unificada mora em /app/editar; um projeto salvo dela precisa
// morar embaixo dela também. Antes o editor abria projetos em /app/finalizar/
// [id] — a segunda porta da MESMA ferramenta, que é o que a fusão veio
// desfazer. Aquela rota continua existindo e agora redireciona para cá, porque
// há projetos reais e links do Histórico apontando para lá.
//
// Atrás da mesma flag do resto: sem ela, quem tem um projeto salvo continua
// abrindo pelo /app/finalizar/[id], que segue intocado.
// Next 16: params é Promise (await).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { notFound, redirect } from 'next/navigation'
import { FinalizeEditor } from '@/components/finalizar/FinalizeEditor'
import { mediaProxyUrl, mediaProxyDeep, signRows } from '@/lib/storage/signed'
import { nodesForEdit } from '@/lib/edit-v4/pricing'
import { editV4Enabled, editV4Route } from '@/lib/edit-v4/flags'
import type { FinalizeProject, FinalizeProjectSummary } from '@/lib/finalizar/types'

export default async function EditarProjetoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (process.env.NEXT_PUBLIC_EDIT_V4 !== '1') redirect(`/app/finalizar/${id}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('finalize_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) notFound()

  // Editor round-trip: URL de PROXY (estável) em base/thumbnail + document, NÃO
  // signed URL (que expiraria e seria persistida no save-back).
  const raw = data as unknown as FinalizeProject
  const project: FinalizeProject = {
    ...raw,
    base_image_url: mediaProxyUrl(raw.base_image_url),
    thumbnail_url:  mediaProxyUrl(raw.thumbnail_url),
    document:       mediaProxyDeep(raw.document) as FinalizeProject['document'],
  }

  // Saldo e preço descem como prop, como no /app/editar. A rota antiga não
  // fazia isso: abrir um projeto salvo mostrava "18 nodes" sem saldo nenhum ao
  // lado, e a pessoa não sabia se podia pagar antes de clicar.
  const admin = createAdminClient()
  const [payerBalance, { data: rows }] = await Promise.all([
    getPayerBalance(admin, user.id),
    supabase
      .from('finalize_projects')
      .select('id, name, thumbnail_url, updated_at')
      .order('updated_at', { ascending: false })
      .limit(120),
  ])
  const savedProjects = (await signRows(
    admin, rows ?? [], ['thumbnail_url'],
  )) as FinalizeProjectSummary[]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <FinalizeEditor
        initialProject={project}
        savedProjects={savedProjects}
        initialBalance={payerBalance.totalBalance}
        nodesPerEdit={nodesForEdit({ provider: editV4Route() })}
        aiEnabled={editV4Enabled()}
      />
    </div>
  )
}
