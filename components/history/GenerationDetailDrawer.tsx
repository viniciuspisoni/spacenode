'use client'

import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/app/glass'
import {
  normalizeGeneration,
  authorInitials,
  buildBriefingText,
  type DetailResponse,
  type GenerationDetail,
  type GenerationKind,
} from '@/lib/history/generation-detail'

// ── "Detalhes da geração" ──────────────────────────────────────────────────────
//
// Aberto ao clicar em qualquer card do Histórico ou do dashboard. Busca os
// dados sob demanda (a grid continua leve) e exibe o arquivo técnico da
// geração: preview, autoria, configuração, custo/desempenho e log técnico.
// Gerações antigas sem metadados mostram fallbacks — nunca quebram.
//
// Era um drawer lateral próprio, com overlay, cabeçalho, botão de fechar e
// Esc só dele. Virou a <Sheet> do kit: no desktop a folha já é um painel
// flutuante centrado e faz o mesmo papel — com uma peça a menos no sistema,
// e com o foco preso, o scrim e a trava de rolagem vindo de graça.

interface Props {
  kind:    GenerationKind
  id:      string
  onClose: () => void
}

const FALLBACK = 'Não registrado'

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function GenerationDetailDrawer({ kind, id, onClose }: Props) {
  const router = useRouter()
  const [detail,  setDetail]  = useState<GenerationDetail | null>(null)
  const [failed,  setFailed]  = useState(false)
  // A folha é montada já com o conteúdo, mas fechada: a animação de entrada
  // precisa de um frame com data-open="false" antes de virar true.
  const [entered, setEntered] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showLog,      setShowLog]      = useState(false)
  const [copied,       setCopied]       = useState<'briefing' | 'log' | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/history/detail?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((res: DetailResponse) => { if (alive) setDetail(normalizeGeneration(res)) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [kind, id])

  // Só a entrada: Esc, scrim e foco são da folha.
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const copy = useCallback(async (text: string, which: 'briefing' | 'log') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(c => (c === which ? null : c)), 1600)
    } catch {
      // Clipboard bloqueado (http/permissão) — sem feedback, sem quebrar.
    }
  }, [])

  const d = detail

  const downloadHref = d?.imageUrl
    ? `/api/download?url=${encodeURIComponent(d.imageUrl)}&filename=${encodeURIComponent(`spacenode-${d.moduleLabel.toLowerCase()}-${d.id.slice(0, 8)}.${d.isVideo ? 'mp4' : 'jpg'}`)}`
    : null

  // Diagnóstico técnico existe apenas para admin/suporte — para usuário comum
  // a API nem envia esses dados (technicalLog chega null).
  const logText = d?.technicalLog ? JSON.stringify(d.technicalLog, null, 2) : ''

  return (
    <Sheet open={entered} title="Detalhes da geração" onClose={onClose} doneLabel="Fechar">
      <>
          {failed && (
            <div className="spn-error">
              Configuração indisponível para esta geração.
            </div>
          )}

          {!failed && !d && (
            <div className="spn-empty">carregando…</div>
          )}

          {d && (
            <>
              {/* ── Seção 1: Preview ── */}
              <div style={T.previewWrap}>
                {d.imageUrl ? (
                  d.isVideo ? (
                    <video src={d.imageUrl} controls style={T.previewImg} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.imageUrl} alt={d.title} style={T.previewImg} />
                  )
                ) : (
                  <div style={T.previewEmpty}>Imagem indisponível</div>
                )}
              </div>

              <div style={{ marginBottom: 6 }}>
                <div style={T.title}>{d.title}</div>
                <div style={T.subRow}>
                  <span>{formatDateTime(d.createdAt) ?? FALLBACK}</span>
                  <StatusPill status={d.status} label={d.statusLabel} />
                </div>
                {d.contextLabel && (
                  <div style={T.contextRow}>
                    <FolderGlyph />
                    {d.contextHref ? (
                      <a href={d.contextHref} style={T.contextLink}>{d.contextLabel}</a>
                    ) : (
                      <span>{d.contextLabel}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Ações — um CTA primário só (baixar); o resto é fantasma. */}
              <div style={T.actionsGrid}>
                {downloadHref && (
                  <a href={downloadHref} className="spn-cta" style={T.actionPrimary}>
                    {d.isVideo ? 'Baixar vídeo' : 'Baixar imagem'}
                  </a>
                )}
                {d.reuseHref && (
                  <button className="spn-ghost" style={T.action} onClick={() => router.push(d.reuseHref!)}>
                    Reutilizar configuração
                  </button>
                )}
                {d.variationHref && (
                  <button className="spn-ghost" style={T.action} onClick={() => router.push(d.variationHref!)}>
                    Criar variação
                  </button>
                )}
                {d.editHref && (
                  <button className="spn-ghost" style={T.action} onClick={() => router.push(d.editHref!)}>
                    Enviar para edição
                  </button>
                )}
                <button className="spn-ghost" style={T.action} onClick={() => copy(buildBriefingText(d), 'briefing')}>
                  {copied === 'briefing' ? 'Briefing copiado ✓' : 'Copiar briefing'}
                </button>
                {d.privileged && d.technicalLog && (
                  <button className="spn-ghost" style={T.action} onClick={() => copy(logText, 'log')}>
                    {copied === 'log' ? 'Log copiado ✓' : 'Copiar log técnico'}
                  </button>
                )}
              </div>

              {/* ── Seção 2: Autoria ── */}
              <Section title="Autoria">
                {d.author ? (
                  <div style={T.authorRow}>
                    <span style={T.avatar}>{authorInitials(d.author)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={T.authorName}>{d.author.name ?? d.author.email ?? 'Autor não registrado'}</div>
                      {d.author.email && d.author.name && (
                        <div style={T.authorEmail}>{d.author.email}</div>
                      )}
                      {d.workspaceName && (
                        <div style={T.authorTeam}>{d.workspaceName}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={T.fallbackText}>Autor não registrado</div>
                )}
              </Section>

              {/* ── Briefing do usuário (texto escrito pelo próprio usuário) ── */}
              {d.userBriefing && (
                <Section title="Briefing do usuário">
                  <div style={T.promptBlock}>{d.userBriefing}</div>
                </Section>
              )}

              {/* ── Seção 3: Configuração usada ── */}
              <Section title="Configuração usada">
                <div style={T.kvList}>
                  {d.config.filter(c => !c.advanced).map(c => (
                    <KV key={c.label} label={c.label} value={c.value ?? FALLBACK} muted={!c.value} />
                  ))}
                </div>

                {d.sourceImageUrl && (
                  <div style={{ marginTop: 12 }}>
                    <div style={T.kvLabel}>Imagem base</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.sourceImageUrl} alt="Imagem base" style={T.baseThumb} />
                  </div>
                )}

                {d.config.some(c => c.advanced) && (
                  <>
                    <button className="spn-ghost" style={T.expandBtn} onClick={() => setShowAdvanced(v => !v)}>
                      {showAdvanced ? 'Ocultar avançado' : 'Mostrar avançado'}
                      <Chevron open={showAdvanced} />
                    </button>
                    {showAdvanced && (
                      <div style={{ marginTop: 10 }}>
                        <div style={T.kvList}>
                          {d.config.filter(c => c.advanced).map(c => (
                            <KV key={c.label} label={c.label} value={c.value ?? FALLBACK} muted={!c.value} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Section>

              {/* ── Seção 4: Custo e desempenho ── */}
              <Section title="Custo e desempenho">
                <div style={T.kvList}>
                  <KV
                    label="Nodes consumidos"
                    value={d.nodesCost != null ? `${d.nodesCost} node${d.nodesCost !== 1 ? 's' : ''}` : FALLBACK}
                    muted={d.nodesCost == null}
                  />
                  {/* Tempo de geração e tentativas saíram da visão de produto
                      (decisão 2026-07-01); seguem no Diagnóstico técnico. */}
                  <KV label="Criada em" value={formatDateTime(d.createdAt) ?? FALLBACK} muted={!d.createdAt} />
                  {d.completedAt && (
                    <KV label="Concluída em" value={formatDateTime(d.completedAt) ?? FALLBACK} />
                  )}
                  {/* Usuário comum vê só a referência curta; uuid completo é
                      dado interno (Diagnóstico técnico). */}
                  <KV label="Referência" value={d.privileged ? d.id : d.shortId} mono />
                </div>
              </Section>

              {/* ── Seção 5: Diagnóstico técnico (somente admin/suporte) ── */}
              {d.privileged && d.technicalLog && (
                <Section title="Diagnóstico técnico">
                  <button className="spn-ghost" style={T.expandBtn} onClick={() => setShowLog(v => !v)}>
                    {showLog ? 'Ocultar diagnóstico' : 'Ver diagnóstico completo'}
                    <Chevron open={showLog} />
                  </button>
                  {showLog && (
                    <>
                      {d.finalPrompt && (
                        <PromptBlock label="Prompt final enviado ao provider" text={d.finalPrompt} />
                      )}
                      <pre style={T.logBlock}>{logText}</pre>
                    </>
                  )}
                </Section>
              )}
            </>
          )}
      </>
    </Sheet>
  )
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={T.section}>
      <div style={T.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value, muted, mono }: { label: string; value: string; muted?: boolean; mono?: boolean }) {
  return (
    <div style={T.kvRow}>
      <span style={T.kvLabel}>{label}</span>
      <span style={{
        ...T.kvValue,
        color: muted ? 'var(--color-text-quaternary)' : 'var(--color-text-primary)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontSize: mono ? 10 : 12,
      }}>
        {value}
      </span>
    </div>
  )
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={T.kvLabel}>{label}</div>
      <div style={T.promptBlock}>{text}</div>
    </div>
  )
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const ok    = status === 'completed'
  const bad   = status === 'failed' || status.startsWith('rejected')
  const color = ok ? 'var(--color-accent-green)' : bad ? 'var(--color-error)' : 'var(--color-text-secondary)'
  return (
    <span style={{ ...T.statusPill, color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function FolderGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const T: Record<string, CSSProperties> = {
  // Overlay, casca do drawer, cabeçalho e botão de fechar saíram: quem faz
  // isso agora é a <Sheet>. O que sobrou é só o miolo do arquivo técnico.
  fallbackText: { fontSize: 12, color: 'var(--color-text-quaternary)' },

  previewWrap:  { borderRadius: 'var(--r-inner)', overflow: 'hidden', background: 'var(--color-preview-bg)', border: '0.5px solid var(--glass-line)', marginBottom: 14 },
  previewImg:   { display: 'block', width: '100%', maxHeight: 300, objectFit: 'contain', background: '#000' },
  previewEmpty: { padding: '48px 0', textAlign: 'center', fontSize: 12, color: 'var(--color-text-quaternary)' },

  title:        { fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  subRow:       { display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--color-text-tertiary)' },
  statusPill:   { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' },
  contextRow:   { display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 11, color: 'var(--color-text-secondary)' },
  contextLink:  { color: 'var(--color-text-secondary)', textDecoration: 'underline', textUnderlineOffset: 2 },

  actionsGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '14px 0 4px' },
  actionPrimary:{ minHeight: 36, fontSize: 11.5, textDecoration: 'none' },
  action:       { height: 36, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5 },

  section:      { marginTop: 22, paddingTop: 18, borderTop: '0.5px solid var(--glass-line)' },
  sectionTitle: { fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: 12 },

  authorRow:    { display: 'flex', alignItems: 'center', gap: 11 },
  avatar:       { width: 32, height: 32, borderRadius: '50%', background: 'var(--color-chip)', border: '0.5px solid var(--glass-line)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, letterSpacing: '0.02em' },
  authorName:   { fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  authorEmail:  { fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  authorTeam:   { fontSize: 10, color: 'var(--color-text-quaternary)', marginTop: 3, letterSpacing: '0.02em' },

  kvList:       { display: 'flex', flexDirection: 'column', gap: 8 },
  kvRow:        { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  kvLabel:      { fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em', flexShrink: 0, marginBottom: 4 },
  kvValue:      { fontSize: 12, textAlign: 'right', letterSpacing: '-0.01em', overflowWrap: 'anywhere' },

  baseThumb:    { width: 96, height: 72, objectFit: 'cover', borderRadius: 8, border: '0.5px solid var(--glass-line)', display: 'block' },

  expandBtn:    { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, height: 30, fontSize: 11 },

  promptBlock:  { padding: '10px 12px', borderRadius: 'var(--r-inner)', background: 'var(--color-input)', border: '0.5px solid var(--glass-line)', fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto' },

  logBlock:     { marginTop: 10, padding: '12px 14px', borderRadius: 'var(--r-inner)', background: 'var(--color-preview-bg)', border: '0.5px solid var(--glass-line)', fontSize: 10, lineHeight: 1.55, color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflowY: 'auto' },
}
