// /app/equipe/convite/[token] — página de aceite de convite.
//
// Mostra os dados do convite e (se o email da sessão bater) um botão pra aceitar.
// Fica sob /app, então o proxy já garante que a pessoa esteja logada.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AcceptInviteButton } from '@/components/app/AcceptInviteButton'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = { admin: 'admin', member: 'membro' }

// Server Component roda 1x por request, então comparar com o "agora" é correto.
// Isolado numa função pura de módulo p/ não disparar a regra react-hooks/purity.
function isExpired(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('workspace_invites')
    .select('email, role, status, expires_at, workspace:workspaces!inner ( name )')
    .eq('token', token)
    .maybeSingle()

  const ws = (invite as unknown as { workspace?: { name: string } } | null)?.workspace
  const valid = !!invite
    && invite.status === 'pending'
    && !isExpired(invite.expires_at as string)
  const emailMatches = !!invite
    && !!user.email
    && user.email.toLowerCase() === String(invite.email).toLowerCase()

  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 48 }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 16, padding: '32px 30px',
      }}>
        {!invite && <Message>Convite não encontrado. Confira se o link está completo.</Message>}

        {invite && !valid && (
          <Message>Este convite expirou ou já foi usado. Peça um novo ao responsável.</Message>
        )}

        {invite && valid && !emailMatches && (
          <Message>
            Este convite é para <b style={{ color: 'var(--color-text-primary)' }}>{String(invite.email)}</b>,
            mas você está logado como <b style={{ color: 'var(--color-text-primary)' }}>{user.email}</b>.
            Entre com a conta certa para aceitar.
          </Message>
        )}

        {invite && valid && emailMatches && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
              Convite de equipe
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.2 }}>
              Entrar em {ws?.name ?? 'um workspace'}
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              Você foi convidado para participar como <b style={{ color: 'var(--color-text-primary)' }}>{ROLE_LABEL[String(invite.role)] ?? 'membro'}</b>.
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6, marginBottom: 24 }}>
              Ao aceitar, você passa a fazer parte deste workspace. Seu workspace pessoal
              fica pausado enquanto você estiver aqui (seus projetos continuam seus).
            </p>
            <AcceptInviteButton token={token} />
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '0.5px solid var(--color-border)' }}>
          <Link href="/app" style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
            ← Voltar ao app
          </Link>
        </div>
      </div>
    </main>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
      {children}
    </p>
  )
}
