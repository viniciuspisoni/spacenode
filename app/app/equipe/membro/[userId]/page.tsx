// /app/equipe/membro/[userId] — histórico de gerações de um membro (owner/admin).
//
// Lista as imagens geradas pela pessoa DENTRO deste workspace, com filtro por
// projeto (Space) via ?project=<spaceId>. Gating: só owner/admin, e o alvo tem
// que ser membro ativo do mesmo workspace.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRows } from '@/lib/storage/signed'
import { getActiveWorkspace } from '@/lib/workspaces/context'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = { vista: 'Vista', render: 'Render', edit: 'Edição' }

type Gen = {
  generation_id: string
  kind:          string
  url:           string | null
  tool:          string | null
  nodes:         number | null
  is_favorited:  boolean | null
  review_status: string | null
  created_at:    string
}

export default async function MembroPage({
  params,
  searchParams,
}: {
  params:       Promise<{ userId: string }>
  searchParams: Promise<{ project?: string }>
}) {
  const { userId } = await params
  const { project } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ws = await getActiveWorkspace(supabase, user.id)
  if (!ws || (ws.role !== 'owner' && ws.role !== 'admin')) redirect('/app/equipe')

  const admin = createAdminClient()

  // O alvo precisa ser membro ativo DESTE workspace.
  const { data: target } = await admin
    .from('workspace_members')
    .select('role, profile:profiles!inner ( full_name, email )')
    .eq('workspace_id', ws.workspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!target) redirect('/app/equipe')

  const prof = (target as unknown as { profile: { full_name: string | null; email: string } }).profile
  const memberName = prof?.full_name || prof?.email || '—'

  let gensQuery = admin
    .from('workspace_generations')
    .select('generation_id, kind, url, tool, nodes, is_favorited, review_status, created_at')
    .eq('workspace_id', ws.workspaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)
  if (project) gensQuery = gensQuery.eq('project_id', project)

  const [projectsRes, gensRes] = await Promise.all([
    admin.from('spaces').select('id, name').eq('user_id', userId).order('created_at', { ascending: false }),
    gensQuery,
  ])

  const projects = (projectsRes.data ?? []) as { id: string; name: string }[]
  // Assina a coluna `url` (aliased pela view) antes de renderizar o <img>
  // (buckets privados após o flip; no-op enquanto públicos / FAL).
  const gens = (await signRows(admin, (gensRes.data ?? []) as Gen[], ['url'])) as Gen[]
  const base = `/app/equipe/membro/${userId}`

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 32 }}>
          <Link href="/app/equipe" style={{ color: 'inherit', textDecoration: 'none' }}>Equipe</Link>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{memberName}</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', marginBottom: 8 }}>
            {memberName}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Histórico de gerações neste workspace{project ? ' · filtrado por projeto' : ''}.
          </p>
        </div>

        {/* Filtro por projeto */}
        {projects.length > 0 && (
          <nav aria-label="Filtrar por projeto"
               style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            <Chip href={base} active={!project} label="Todos os projetos" />
            {projects.map((p) => (
              <Chip key={p.id} href={`${base}?project=${p.id}`} active={project === p.id} label={p.name} />
            ))}
          </nav>
        )}

        {/* Grade de gerações */}
        {gens.length === 0 ? (
          <div className="spn-empty">
            Nenhuma geração encontrada{project ? ' para este projeto' : ''}.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {gens.map((g) => (
              <div key={g.generation_id} className="spn-card spn-glass">
                <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--color-preview-bg)' }}>
                  {g.url
                    ? <img src={g.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>sem imagem</div>}
                  {g.is_favorited && (
                    <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 12 }} title="favorita">★</span>
                  )}
                </div>
                <div style={{ padding: '9px 11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                      {KIND_LABEL[g.kind] ?? g.kind}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(g.nodes ?? 0).toLocaleString('pt-BR')} nodes
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                    {fmt(g.created_at)}{g.review_status === 'approved' ? ' · aprovada' : g.review_status === 'discarded' ? ' · descartada' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {gens.length === 60 && (
          <p style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginTop: 18 }}>
            Mostrando as 60 gerações mais recentes.
          </p>
        )}
      </div>
    </main>
  )
}

/** Filtro por projeto. Duas decisões:
 *
 *  - O verde de seleção saiu: verde é estado, e escolher um filtro é ação —
 *    a pílula ligada usa o chip ativo do sistema.
 *  - O estado é `aria-current="page"`, não `aria-checked`/`role="radio"`.
 *    Cada pílula é um <Link> para uma URL diferente da MESMA página; pôr
 *    `role="radio"` sobrescrevia o papel de link (o leitor de tela deixava
 *    de anunciar que aquilo navega) e ainda declarava rádios sem radiogroup
 *    em volta. Quem dá o nome do conjunto agora é o <nav> acima. */
function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className="spn-pill" aria-current={active ? 'page' : undefined}
          style={{ textDecoration: 'none', display: 'inline-block' }}>
      {label}
    </Link>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}
