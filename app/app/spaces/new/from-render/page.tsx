// /app/spaces/new/from-render — caminho A.
//   - Sem ?render_id → galeria de renders
//   - Com ?render_id  → tela de config (nome + categoria + motor herdado) + extração

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { signStorageUrl, signRows } from '@/lib/storage/signed'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { FromRenderFlow, type RenderGalleryItem } from '@/components/spaces/FromRenderFlow'

export default async function FromRenderPage({
  searchParams,
}: {
  searchParams: Promise<{ render_id?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [galleryRes, payerBalance, preselectedRes] = await Promise.all([
    supabase
      .from('renders')
      .select('id, output_url, ambient, style, lighting, engine, resolution, created_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .neq('ambient', 'upscale')
      .neq('ambient', 'video')
      // Piloto interno (Orion) fica fora da galeria: o Space herda o motor da
      // render e `spaces.engine` só conhece os públicos. A rota
      // /api/spaces/from-render recusa igual, para chamada forjada.
      .neq('engine', 'orion')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60),
    // Saldo da bolsa (dono do workspace) — é dele que a geração debita.
    getPayerBalance(admin, user.id),
    sp.render_id
      ? supabase
          .from('renders')
          .select('id, output_url, ambient, style, lighting, engine, resolution, created_at')
          .eq('id', sp.render_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ])

  // Assina output_url server-side antes de passar pro client (bucket privado
  // após o flip). Renders são FAL hoje → no-op, mas embrulhamos igual.
  const gallery     = (await signRows(admin, galleryRes.data ?? [], ['output_url'])) as RenderGalleryItem[]
  const balance     = payerBalance.totalBalance
  const preselectedRaw = (preselectedRes.data ?? null) as RenderGalleryItem | null
  // ?render_id apontando pra uma render do piloto cai na galeria comum em vez
  // de pré-selecionar um resultado que a API vai recusar.
  const preselected: RenderGalleryItem | null = preselectedRaw && (preselectedRaw.engine as string) !== 'orion'
    ? { ...preselectedRaw, output_url: (await signStorageUrl(admin, preselectedRaw.output_url)) ?? preselectedRaw.output_url }
    : null

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <FromRenderFlow
        gallery={gallery}
        preselected={preselected}
        initialBalance={balance}
      />
    </main>
  )
}
