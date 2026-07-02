// /app/equipe — painel da Equipe (Workspace).
//
// Mostra os membros do workspace e o uso de cada um: imagens geradas, nodes
// consumidos, favoritas e última atividade. Owner/admin enxergam todos os
// membros; um membro comum vê só a si mesmo. Os PROJETOS continuam privados —
// aqui são apenas NÚMEROS agregados (gating feito no servidor, sem mexer no RLS).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkspace } from '@/lib/workspaces/context'
import { TeamManager, type ManagerMember, type ManagerInvite } from '@/components/app/TeamManager'

export const dynamic = 'force-dynamic'

type MemberRow = {
  userId:       string
  name:         string
  role:         'owner' | 'admin' | 'member'
  isSelf:       boolean
  images:       number
  nodes:        number
  favoritas:    number
  lastActivity: string | null
}

const ROLE_LABEL: Record<MemberRow['role'], string> = {
  owner:  'dono',
  admin:  'admin',
  member: 'membro',
}

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ws = await getActiveWorkspace(supabase, user.id)
  if (!ws) return <EmptyState />

  const admin = createAdminClient()
  const isManager = ws.role === 'owner' || ws.role === 'admin'

  const [membersRes, usageRes, invitesRes] = await Promise.all([
    admin
      .from('workspace_members')
      .select('user_id, role, profile:profiles!inner ( full_name, email )')
      .eq('workspace_id', ws.workspaceId)
      .eq('status', 'active'),
    admin
      .from('workspace_member_usage')
      .select('user_id, images, nodes, favoritas, last_activity')
      .eq('workspace_id', ws.workspaceId),
    admin
      .from('workspace_invites')
      .select('id, email, role, expires_at')
      .eq('workspace_id', ws.workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  const usageByUser = new Map(
    (usageRes.data ?? []).map((u) => [u.user_id as string, u]),
  )

  let rows: MemberRow[] = (membersRes.data ?? []).map((m) => {
    const prof = (m as unknown as { profile: { full_name: string | null; email: string } }).profile
    const u = usageByUser.get(m.user_id as string)
    return {
      userId:       m.user_id as string,
      name:         prof?.full_name || prof?.email || '—',
      role:         m.role as MemberRow['role'],
      isSelf:       m.user_id === user.id,
      images:       Number(u?.images ?? 0),
      nodes:        Number(u?.nodes ?? 0),
      favoritas:    Number(u?.favoritas ?? 0),
      lastActivity: (u?.last_activity as string | null) ?? null,
    }
  })

  // Membro comum só enxerga a si mesmo.
  if (!isManager) rows = rows.filter((r) => r.isSelf)

  // Ordena: dono primeiro, depois mais imagens.
  rows.sort((a, b) => {
    if (a.role === 'owner' && b.role !== 'owner') return -1
    if (b.role === 'owner' && a.role !== 'owner') return 1
    return b.images - a.images
  })

  const totalImages = rows.reduce((s, r) => s + r.images, 0)
  const totalNodes  = rows.reduce((s, r) => s + r.nodes, 0)
  const isSolo      = rows.length <= 1

  // Dados pro painel de gestão (só usados se for manager).
  const managerMembers: ManagerMember[] = (membersRes.data ?? []).map((m) => {
    const prof = (m as unknown as { profile: { full_name: string | null; email: string } }).profile
    return {
      userId: m.user_id as string,
      name:   prof?.full_name || prof?.email || '—',
      role:   m.role as ManagerMember['role'],
      isSelf: m.user_id === user.id,
    }
  })
  const managerInvites: ManagerInvite[] = (invitesRes.data ?? []).map((i) => ({
    id:        i.id as string,
    email:     i.email as string,
    role:      i.role as string,
    expiresAt: i.expires_at as string,
  }))

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: 36,
        }}>
          <span>{ws.name}</span>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Equipe</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10,
          }}>
            Equipe
          </h1>
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            {isManager
              ? 'Acompanhe o uso de cada pessoa do seu workspace — imagens geradas, nodes consumidos e favoritas.'
              : 'Seu uso neste workspace — imagens geradas, nodes consumidos e favoritas.'}
          </p>
        </div>

        {/* Cards-resumo */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          <SummaryCard label="Membros"        value={rows.length.toLocaleString('pt-BR')} />
          <SummaryCard label="Imagens geradas" value={totalImages.toLocaleString('pt-BR')} />
          <SummaryCard label="Nodes consumidos" value={totalNodes.toLocaleString('pt-BR')} />
        </div>

        {/* Gestão da equipe (só owner/admin) */}
        {isManager && (
          <TeamManager members={managerMembers} invites={managerInvites} />
        )}

        {/* Tabela de membros */}
        <section style={{
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 1fr',
            gap: 12, padding: '14px 22px',
            borderBottom: '0.5px solid var(--color-border)',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
          }}>
            <span>Membro</span>
            <span style={{ textAlign: 'right' }}>Imagens</span>
            <span style={{ textAlign: 'right' }}>Nodes</span>
            <span style={{ textAlign: 'right' }}>Favoritas</span>
            <span style={{ textAlign: 'right' }}>Última atividade</span>
          </div>

          {rows.map((r) => (
            <div key={r.userId} style={{
              display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 1fr',
              gap: 12, padding: '15px 22px', alignItems: 'center',
              borderBottom: '0.5px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar name={r.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13.5, color: 'var(--color-text-primary)', fontWeight: 500,
                    letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {isManager
                      ? <Link href={`/app/equipe/membro/${r.userId}`} style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted var(--color-border-strong)' }}>{r.name}</Link>
                      : r.name}{r.isSelf && <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}> · você</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                    {ROLE_LABEL[r.role]}
                  </div>
                </div>
              </div>
              <Num value={r.images} />
              <Num value={r.nodes} />
              <Num value={r.favoritas} muted={r.favoritas === 0} />
              <span style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
                {fmtDate(r.lastActivity)}
              </span>
            </div>
          ))}
        </section>

        {/* Estado individual / convite */}
        {isSolo && (
          <div style={{
            marginTop: 18, padding: '16px 20px',
            background: 'var(--color-surface-subtle)',
            border: '0.5px dashed var(--color-border-strong)',
            borderRadius: 12,
            fontSize: 12.5, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
          }}>
            Por enquanto só você está neste workspace. O convite de membros por email
            chega na próxima fase — aí o consumo de cada pessoa do escritório aparece aqui.
          </div>
        )}

      </div>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: '1 1 160px',
      padding: '18px 20px',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14,
    }}>
      <div style={{ fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginTop: 6,
      }}>
        {label}
      </div>
    </div>
  )
}

function Num({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <span style={{
      textAlign: 'right', fontSize: 13.5, fontWeight: 500,
      fontVariantNumeric: 'tabular-nums',
      color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
    }}>
      {value.toLocaleString('pt-BR')}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border-strong)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
    }}>
      {initial}
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function EmptyState() {
  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 48 }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        Não encontramos um workspace ativo para esta conta.
      </p>
    </main>
  )
}
