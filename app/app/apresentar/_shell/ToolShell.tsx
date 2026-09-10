'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

/**
 * A casca das quatro ferramentas do Apresentar.
 *
 * O painel de 420px, o cabeçalho e o rodapé de custo estavam copiados
 * inteiros nas quatro telas — e quatro cópias do rodapé viravam quatro
 * respostas diferentes para "quanto isto custa". A casca em si agora é CSS
 * (`.spn-tool` e `.spn-cost`, globals.css); o que sobra de COMPORTAMENTO —
 * a volta pro hub, a zona de arraste e o dock — mora aqui, uma vez só.
 *
 * Blocos 3D não importa daqui de propósito: é outro módulo, e o pouco que
 * teria em comum já está nas classes.
 */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Cabeçalho do painel ──────────────────────────────────────────────────────

export function ToolHeader({ title, desc, badge }: {
  title: string
  desc?: string
  /** Só quando o estado da ferramenta muda o que o usuário deve esperar
   *  ("beta"). "Novo" é assunto do hub, não de quem já está dentro. */
  badge?: string
}) {
  return (
    <header style={{ flex: '0 0 auto', padding: '13px 16px 12px', borderBottom: '0.5px solid var(--glass-line)' }}>
      <Link
        href="/app/apresentar"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', textDecoration: 'none',
        }}
      >
        <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke="currentColor"
             strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 1L1 7l6 6" />
        </svg>
        Apresentar
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
          {title}
        </h1>
        {badge ? (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)', background: 'var(--color-chip)',
            padding: '3px 7px', borderRadius: 999,
          }}>
            {badge}
          </span>
        ) : null}
      </div>
      {desc ? <p className="spn-hint" style={{ marginTop: 5 }}>{desc}</p> : null}
    </header>
  )
}

// ── Dock de custo ────────────────────────────────────────────────────────────

export function CostDock({ cost, balance, children }: {
  cost: number
  balance: number
  /** O CTA. `.spn-cost .spn-cta` já o encosta na direita. */
  children: React.ReactNode
}) {
  const short = balance < cost
  return (
    <div className="spn-dock spn-glass spn-glass--chrome">
      <div className="spn-cost">
        <div className="spn-cost-figures">
          <div className="spn-cost-main">{cost} nodes</div>
          <div className="spn-cost-sub" style={short ? { color: 'var(--color-error)' } : undefined}>
            Saldo {balance}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Zona de arraste ──────────────────────────────────────────────────────────

export function SourceDrop({ preview, label, note, meta, onFile, onClear, height = 132 }: {
  preview: string | null
  label: string
  note?: string
  /** Linha de baixo quando há imagem: dimensões, peso. */
  meta?: string
  onFile: (file: File) => void
  onClear: () => void
  height?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        /* Com imagem carregada o único filho é um <img alt=""> decorativo: um
           role="button" que tira o nome do conteúdo ficaria SEM nome nenhum
           no leitor de tela. O rótulo vem explícito. */
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() }
        }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        style={{
          minHeight: preview ? 0 : height,
          borderRadius: 'var(--r-inner)',
          border: `1px dashed ${drag ? 'var(--color-border-focus)' : 'var(--glass-line-strong)'}`,
          background: drag ? 'var(--color-chip-hover)' : 'var(--color-chip)',
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: preview ? 0 : '22px 18px',
          transition: 'border-color 180ms var(--ease), background 180ms var(--ease)',
        }}
      >
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={preview} alt="" style={{
            width: '100%', display: 'block', maxHeight: 210,
            objectFit: 'contain', background: 'var(--color-preview-bg)',
          }} />
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                 style={{ color: 'var(--color-text-quaternary)' }} aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 9, textAlign: 'center' }}>
              {label}
            </span>
            {note ? (
              <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{note}</span>
            ) : null}
          </>
        )}
      </div>

      {preview ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
          <span className="spn-hint" style={{ marginTop: 0 }}>{meta}</span>
          <button type="button" className="spn-ghost" style={{ height: 28, flex: '0 0 auto' }}
                  onClick={(e) => { e.stopPropagation(); onClear() }}>
            Trocar
          </button>
        </div>
      ) : null}

      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

// ── Palco: carregando ────────────────────────────────────────────────────────

/**
 * Um giro só para as quatro telas. O `@keyframes` viaja junto do componente:
 * cada tela declarava o seu, e três delas o declaravam sem usar o `fadeIn`
 * que vinha no mesmo bloco.
 */
export function StageLoading({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <style>{'@keyframes spnSpin { to { transform: rotate(360deg) } }'}</style>
      <span style={{
        width: 34, height: 34, borderRadius: '50%',
        border: '2px solid var(--glass-line-strong)',
        borderTopColor: 'var(--color-text-secondary)',
        animation: 'spnSpin 0.9s linear infinite',
      }} />
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  )
}

// ── Palco: link de download ──────────────────────────────────────────────────

export function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </svg>
  )
}
