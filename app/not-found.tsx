import Link from 'next/link'
import { Brandmark } from '@/components/brand'

export const metadata = {
  title: 'Página não encontrada · SpaceNode',
}

export default function NotFound() {
  return (
    <main style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow — mesmo tratamento da tela de login */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 70% 50% at 50% 40%, var(--color-surface-subtle) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 400,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', position: 'relative',
      }}>
        <div style={{ marginBottom: 32, color: 'var(--color-text-primary)' }}>
          <Brandmark size={28} />
        </div>

        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.2em',
          textTransform: 'uppercase' as const, color: 'var(--color-text-quaternary)',
          marginBottom: 16,
        }}>
          404
        </div>

        <h1 style={{
          fontSize: 26, fontWeight: 500, letterSpacing: '-0.03em',
          color: 'var(--color-text-primary)', lineHeight: 1.3,
          margin: '0 0 12px',
        }}>
          Essa vista não foi encontrada.
        </h1>

        <p style={{
          fontSize: 14, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', lineHeight: 1.6,
          margin: '0 0 32px',
        }}>
          O link pode ter mudado ou essa página não existe mais.
        </p>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/" style={{
            width: '100%', padding: '14px 24px', borderRadius: 10,
            background: 'var(--color-inverse)', color: 'var(--color-inverse-foreground)',
            fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
            textDecoration: 'none', display: 'inline-block',
          }}>
            Voltar para a SpaceNode
          </Link>
          <Link href="/login?mode=signup" style={{
            width: '100%', padding: '14px 24px', borderRadius: 10,
            background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)',
            color: 'var(--color-text-primary)',
            fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em',
            textDecoration: 'none', display: 'inline-block',
          }}>
            Começar agora
          </Link>
        </div>
      </div>
    </main>
  )
}
