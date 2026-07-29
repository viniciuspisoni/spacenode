// /app/spaces/new — escolha de origem da Vista Mestre.
// Bifurca em: caminho A (a partir de uma render existente) ou
// caminho B (upload direto de imagem).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function NewSpaceOriginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Conta renders pra mostrar empty state apropriado no card "a partir de render"
  const { count: renderCount } = await supabase
    .from('renders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .not('output_url', 'is', null)

  const hasRenders = (renderCount ?? 0) > 0

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontSize: 12, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: 32,
        }}>
          <Link href="/app/spaces">Spaces</Link>
          <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Novo</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10,
          }}>
            De onde vem a Vista Mestre deste projeto?
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--color-text-tertiary)',
            lineHeight: 1.6, maxWidth: 600, letterSpacing: '-0.005em',
          }}>
            A Vista Mestre é a imagem de referência do projeto: ela define estilo,
            materiais e atmosfera que todas as outras vistas vão preservar.
            Comece por uma render do Renderizar (mais preciso) ou suba uma imagem.
          </p>
        </div>

        {/* Cards */}
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}>
          <OriginCard
            href={hasRenders ? '/app/spaces/new/from-render' : '/app/generate?return=spaces/new'}
            recommended
            disabled={!hasRenders}
            disabledHref="/app/generate?return=spaces/new"
            disabledCta="Gerar minha primeira render"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            }
            title="A partir de uma render"
            description={
              hasRenders
                ? 'Use uma render existente do Renderizar como Vista Mestre. DNA mais preciso porque já temos as configurações de origem.'
                : 'Você ainda não tem renders concluídas. Gere a primeira agora — ao terminar, um atalho traz você de volta pra cá com a render já selecionada.'
            }
            footer="DNA enriquecido com ground truth"
          />
          <OriginCard
            href="/app/spaces/new/upload"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            }
            title="Subir imagem"
            description="Foto, render externa, sketch ou qualquer imagem de referência. JPG, PNG ou WebP até 15 MB."
            footer="DNA detectado pela imagem"
          />
        </div>

        <div style={{
          marginTop: 28, fontSize: 11, color: 'var(--color-text-quaternary)',
          textAlign: 'center', letterSpacing: '0.01em',
        }}>
          Em ambos os caminhos, a extração de DNA custa 8 nodes.
        </div>
      </div>
    </main>
  )
}

function OriginCard({
  href, recommended, disabled, disabledHref, disabledCta, icon, title, description, footer,
}: {
  href:           string
  recommended?:   boolean
  disabled?:      boolean
  disabledHref?:  string
  /** Rótulo do botão primário exibido no estado sem pré-requisito — o card
      continua acionável (navega pro disabledHref), nunca um beco sem saída. */
  disabledCta?:   string
  icon:           React.ReactNode
  title:          string
  description:    string
  footer:         string
}) {
  const finalHref = disabled ? (disabledHref ?? href) : href
  const showCta   = Boolean(disabled && disabledCta)

  return (
    <Link
      href={finalHref}
      style={{
        position: 'relative',
        padding: '24px 22px',
        background: recommended
          ? 'linear-gradient(135deg, rgba(29,158,117,0.08) 0%, rgba(29,158,117,0.02) 100%)'
          : 'var(--color-bg-elevated)',
        border: recommended
          ? '0.5px solid rgba(29,158,117,0.45)'
          : '0.5px solid var(--color-border-strong)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 14,
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        // Esmaecer só quando não há ação primária — com CTA o card é um caminho vivo.
        opacity: disabled && !showCta ? 0.6 : 1,
        minHeight: 200,
      }}
    >
      {recommended && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--color-accent-green)', background: 'var(--color-accent-green-bg)',
          padding: '4px 8px', borderRadius: 4,
        }}>
          ✦ recomendado
        </span>
      )}

      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 44, height: 44, borderRadius: 11,
        background: recommended ? 'var(--color-accent-green-bg)' : 'var(--color-surface)',
        color: recommended ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
      }}>
        {icon}
      </span>

      <div>
        <h2 style={{
          fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.02em', marginBottom: 6,
        }}>
          {title}
        </h2>
        <p style={{
          fontSize: 12, color: 'var(--color-text-tertiary)',
          lineHeight: 1.55, letterSpacing: '-0.005em',
        }}>
          {description}
        </p>
      </div>

      {showCta ? (
        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '0.5px solid var(--color-border)' }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '12px 16px', borderRadius: 10,
            background: 'var(--color-inverse)', color: 'var(--color-inverse-foreground)',
            fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em',
            boxShadow: 'var(--shadow-md)',
          }}>
            {disabledCta} →
          </span>
        </div>
      ) : (
        <div style={{
          marginTop: 'auto',
          paddingTop: 14, borderTop: '0.5px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: recommended ? 'var(--color-accent-green)' : 'var(--color-text-quaternary)',
          }}>
            {footer}
          </span>
          <span style={{
            color: recommended ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
            fontSize: 14,
          }}>→</span>
        </div>
      )}
    </Link>
  )
}
