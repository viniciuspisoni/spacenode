// ── Shell das páginas jurídicas (/termos, /privacidade) ───────────────────────
//
// Server component estático, tema-neutro (só tokens semânticos — funciona em
// light e dark sem forçar nada; o script anti-flash do layout raiz só força
// dark na rota "/"). Sem 'use client' e sem styled-jsx de propósito: as
// páginas ficam prerenderizadas e indexáveis.

import Link from 'next/link'
import { Brandmark } from '@/components/brand'
import { LEGAL_CNPJ, LEGAL_NAME, SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/lib/support'

export function LegalShell({
  title,
  updatedAt,
  intro,
  children,
}: {
  title: string
  updatedAt: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Header mínimo — só a marca voltando pra home */}
      <header style={{
        maxWidth: 760, margin: '0 auto', padding: '28px 24px 0',
      }}>
        <Link href="/" style={{ display: 'inline-flex', color: 'var(--color-text-primary)', textDecoration: 'none' }}>
          <Brandmark size={22} />
        </Link>
      </header>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{
          fontSize: 30, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 10,
        }}>
          {title}
        </h1>
        <p style={{
          fontSize: 12.5, color: 'var(--color-text-tertiary)',
          letterSpacing: '-0.005em', marginBottom: intro ? 20 : 40,
        }}>
          Última atualização: {updatedAt}
        </p>

        {intro && (
          <div style={{
            padding: '16px 18px', marginBottom: 40,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border)',
            borderRadius: 12,
            fontSize: 13.5, color: 'var(--color-text-secondary)',
            lineHeight: 1.7, letterSpacing: '-0.005em',
          }}>
            {intro}
          </div>
        )}

        {children}

        {/* Rodapé jurídico — navegação cruzada + canais oficiais */}
        <div aria-hidden style={{ height: 0.5, background: 'var(--color-border-strong)', margin: '56px 0 24px' }} />
        <nav style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px 24px',
          fontSize: 12, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em',
        }}>
          <Link href="/termos" style={legalFooterLink}>Termos de Uso</Link>
          <Link href="/privacidade" style={legalFooterLink}>Política de Privacidade</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={legalFooterLink}>{SUPPORT_EMAIL}</a>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={legalFooterLink}>
            WhatsApp {SUPPORT_PHONE_DISPLAY}
          </a>
        </nav>
        <p style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 16, letterSpacing: '-0.005em' }}>
          spacenode · 2026 · {LEGAL_NAME} · CNPJ {LEGAL_CNPJ}
        </p>
      </article>
    </main>
  )
}

const legalFooterLink: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  textDecoration: 'none',
}

// ── Blocos tipográficos ────────────────────────────────────────────────────────

export function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{
        fontSize: 15.5, fontWeight: 600, color: 'var(--color-text-primary)',
        letterSpacing: '-0.015em', lineHeight: 1.35, marginBottom: 12,
      }}>
        {n}. {title}
      </h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 13.5, color: 'var(--color-text-secondary)',
      lineHeight: 1.75, letterSpacing: '-0.005em', margin: '0 0 12px',
    }}>
      {children}
    </p>
  )
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: '0 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {children}
    </ul>
  )
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li style={{
      fontSize: 13.5, color: 'var(--color-text-secondary)',
      lineHeight: 1.7, letterSpacing: '-0.005em',
    }}>
      {children}
    </li>
  )
}

/** Destaque para cláusulas que o usuário PRECISA ver (natureza da IA, uso profissional). */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 16px', margin: '0 0 12px',
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border-strong)',
      borderRadius: 10,
      fontSize: 13.5, color: 'var(--color-text-primary)',
      lineHeight: 1.7, letterSpacing: '-0.005em',
    }}>
      {children}
    </div>
  )
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{children}</strong>
}
