// /app/conta — página da conta do usuário.
//
// Resumo de identidade, plano, saldo e atalhos para alterar senha / sair.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { getPlanDisplayName } from '@/lib/plan-display'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, supportWhatsAppUrl } from '@/lib/support'
import ThemeSelector from '@/components/app/ThemeSelector'

export const dynamic = 'force-dynamic'

export default async function ContaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Nome é do próprio usuário; plano/saldo são da bolsa (dono do workspace).
  const [profileRes, balance] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    getPayerBalance(createAdminClient(), user.id),
  ])

  // Office é plano legado (aposentado p/ novas assinaturas em 2026-08-31) —
  // o assinante existente mantém os benefícios e vê o rótulo explícito.
  const planName  = getPlanDisplayName(balance.planId)
    + (balance.planId === 'office' ? ' · plano legado' : '')
  const fullName  = profileRes.data?.full_name ?? null
  const email     = user.email ?? ''
  const planNodes  = balance.planBalance
  const extraNodes = balance.extraBalance
  const totalNodes = balance.totalBalance

  // Detecta provider — usado pra customizar mensagem de senha.
  // Se identidade for só Google, mensagem fica "definir senha" em vez de "alterar".
  const providers = user.app_metadata?.providers ?? user.app_metadata?.provider ?? []
  const providersArr = Array.isArray(providers) ? providers : [providers]
  const onlyGoogle = providersArr.length === 1 && providersArr[0] === 'google'

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: 36,
        }}>
          <span>Workspace</span>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Conta</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10,
          }}>
            Conta
          </h1>
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            Resumo da sua conta SpaceNode — identificação, plano e segurança.
          </p>
        </div>

        {/* Identificação */}
        <Section title="Identificação">
          <Field label="Email" value={email} />
          {fullName && <Field label="Nome" value={fullName} />}
        </Section>

        {/* Plano e saldo */}
        <Section title="Plano e saldo">
          {balance.pooled && (
            <p style={{
              fontSize: 12.5, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 12,
            }}>
              Você faz parte de um workspace — o plano e o saldo abaixo são da conta
              principal, compartilhados por toda a equipe.
            </p>
          )}
          <Field label="Plano atual" value={planName} />
          <Field label="Nodes mensais" value={`${planNodes} disponíveis`} />
          {extraNodes > 0 && <Field label="Nodes extras" value={`${extraNodes} sem validade`} />}
          <Field label="Total disponível" value={`${totalNodes} nodes`} />
          <Link
            href="/app/billing"
            style={linkButtonStyle}
          >
            Gerenciar plano →
          </Link>
        </Section>

        {/* Aparência */}
        <Section title="Aparência">
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 14,
          }}>
            Tema da interface. &ldquo;Sistema&rdquo; acompanha a preferência do seu dispositivo.
          </p>
          <ThemeSelector variant="full" />
        </Section>

        {/* Segurança */}
        <Section title="Segurança">
          <Field label="Email de acesso" value={email} />
          <Link
            href="/update-password"
            style={linkButtonStyle}
          >
            {onlyGoogle ? 'Definir senha para acesso por email →' : 'Alterar senha →'}
          </Link>
        </Section>

        {/* Suporte */}
        <Section title="Suporte">
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            Precisa de ajuda? Fale com a gente — atendimento em português.
          </p>
          <Field label="WhatsApp" value={SUPPORT_PHONE_DISPLAY} />
          <Field label="E-mail" value={SUPPORT_EMAIL} />
          <a
            href={supportWhatsAppUrl('Olá! Preciso de ajuda com a minha conta SpaceNode.')}
            target="_blank"
            rel="noopener noreferrer"
            style={linkButtonStyle}
          >
            Chamar no WhatsApp →
          </a>
        </Section>

        {/* Sair */}
        <Section title="Sessão">
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 14,
          }}>
            Encerrar a sessão neste navegador.
          </p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              style={{
                ...linkButtonStyle,
                background: 'var(--color-error-bg)',
                borderColor: 'var(--color-error-border)',
                color: 'var(--color-error)',
                cursor: 'pointer',
              }}
            >
              Sair desta conta
            </button>
          </form>
        </Section>

      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      marginBottom: 28,
      padding: '22px 24px',
      background: 'var(--color-bg-elevated)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 14,
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
        marginBottom: 16,
      }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0',
      borderBottom: '0.5px solid var(--color-border)',
      gap: 16,
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500,
        letterSpacing: '-0.005em', textAlign: 'right',
        wordBreak: 'break-word' as const,
      }}>
        {value}
      </span>
    </div>
  )
}

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  marginTop: 16,
  padding: '10px 16px',
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border-strong)',
  borderRadius: 9,
  fontSize: 12.5, fontWeight: 500,
  color: 'var(--color-text-secondary)',
  letterSpacing: '-0.005em',
  textDecoration: 'none',
}
