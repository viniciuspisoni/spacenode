// /app/conta — página da conta do usuário.
//
// Resumo de identidade, plano, saldo e atalhos para alterar senha / sair.
//
// Eram seis cartões opacos, cada um com o seu título, e o e-mail aparecia em
// dois deles. Agora são quatro superfícies de vidro: os dados viram linhas de
// grupo (o mesmo desenho das linhas que abrem folhas, sem folha atrás porque
// aqui não há o que configurar) e cada ação sai como botão secundário abaixo
// do grupo a que pertence.

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

  // Office (2026-08-31) e Starter (2026-09-12) são planos legados —
  // o assinante existente mantém os benefícios e vê o rótulo explícito.
  // Starter usa "Legacy" (decisão de produto); os demais, "plano legado".
  const planName = getPlanDisplayName(balance.planId)
    + (balance.planId === 'office'  ? ' · plano legado' : '')
    + (balance.planId === 'starter' ? ' · Legacy'       : '')
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
    // Sem fundo chapado: quem pinta é o <Ambient/> do shell, e é ele que o
    // vidro refrata.
    <main style={{ flex: 1, overflowY: 'auto', padding: '40px 48px 80px' }}>
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
        <Block title="Identificação">
          <div className="spn-group spn-glass">
            <Row label="Email" value={email} />
            {fullName && <Row label="Nome" value={fullName} />}
          </div>
        </Block>

        {/* Plano e saldo */}
        <Block title="Plano e saldo">
          {balance.pooled && (
            <p style={{
              fontSize: 12.5, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 12,
            }}>
              Você faz parte de um workspace — o plano e o saldo abaixo são da conta
              principal, compartilhados por toda a equipe.
            </p>
          )}
          <div className="spn-group spn-glass">
            <Row label="Plano atual" value={planName} />
            <Row label="Nodes mensais" value={`${planNodes} disponíveis`} />
            {extraNodes > 0 && <Row label="Nodes extras" value={`${extraNodes} sem validade`} />}
            <Row label="Total disponível" value={`${totalNodes} nodes`} />
          </div>
          <Link href="/app/billing" className="spn-ghost" style={ghostLink}>
            Gerenciar plano →
          </Link>
        </Block>

        {/* Aparência */}
        <Block title="Aparência">
          <div className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: '18px 20px' }}>
            <p style={{
              fontSize: 13, color: 'var(--color-text-tertiary)',
              lineHeight: 1.6, letterSpacing: '-0.005em', marginBottom: 14,
            }}>
              Tema da interface. &ldquo;Sistema&rdquo; acompanha a preferência do seu dispositivo.
            </p>
            <ThemeSelector variant="full" />
          </div>
        </Block>

        {/* Segurança e suporte — o e-mail de acesso era repetido aqui embaixo
            só para servir de cabeçalho a um link; agora ele mora num lugar só. */}
        <Block title="Segurança e suporte">
          <div className="spn-group spn-glass">
            <Row label="WhatsApp" value={SUPPORT_PHONE_DISPLAY} />
            <Row label="E-mail de suporte" value={SUPPORT_EMAIL} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/update-password" className="spn-ghost" style={ghostLink}>
              {onlyGoogle ? 'Definir senha para acesso por email →' : 'Alterar senha →'}
            </Link>
            <a
              href={supportWhatsAppUrl('Olá! Preciso de ajuda com a minha conta SpaceNode.')}
              target="_blank"
              rel="noopener noreferrer"
              className="spn-ghost"
              style={ghostLink}
            >
              Chamar no WhatsApp →
            </a>
          </div>
        </Block>

        {/* Sair */}
        <Block title="Sessão">
          <p style={{
            fontSize: 13, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, letterSpacing: '-0.005em',
          }}>
            Encerrar a sessão neste navegador.
          </p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="spn-ghost"
              style={{
                ...ghostLink,
                background: 'var(--color-error-bg)',
                borderColor: 'var(--color-error-border)',
                color: 'var(--color-error)',
              }}
            >
              Sair desta conta
            </button>
          </form>
        </Block>

      </div>
    </main>
  )
}

/** Título de seção + conteúdo. O título fica FORA do vidro (é linha curta,
 *  sobrevive sobre o papel de parede); o conteúdo, dentro. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28, display: 'grid', gap: 12 }}>
      <h2 className="spn-field-label" style={{ marginBottom: 0 }}>{title}</h2>
      {children}
    </section>
  )
}

/** Linha de dado: mesmo desenho da linha que abre folha, sem a folha —
 *  não há nada para configurar aqui, só para ler. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="spn-row spn-row--static">
      <span className="spn-row-title">{label}</span>
      <span className="spn-row-value" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

const ghostLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  textDecoration: 'none',
  width: 'auto',
}
