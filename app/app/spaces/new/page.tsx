'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SpaceCategory, ProjectDNA } from '@/lib/spaces/types'

// ── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.32)',
      }}>
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', letterSpacing: '-0.005em' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#111111',
  border: '0.5px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: '#fafafa',
  fontFamily: 'inherit',
  letterSpacing: '-0.005em',
  outline: 'none',
  width: '100%',
  boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
}

// ── New Space Page ────────────────────────────────────────────────────────────

export default function NewSpacePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<SpaceCategory>('residencial')
  const [anchorPreview, setAnchorPreview] = useState<string | null>(null)
  const [anchorBase64, setAnchorBase64] = useState<string | null>(null)

  const [dna, setDna] = useState<ProjectDNA>({
    style: '', materials: '', palette: [], context: '', lighting: '',
  })
  const [paletteInput, setPaletteInput] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Imagem deve ter menos de 10 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string
      setAnchorPreview(result)
      setAnchorBase64(result)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Nome é obrigatório.'); return }
    if (!anchorBase64) { setError('Adicione a imagem Anchor.'); return }

    // Parse palette from comma-separated hex values
    const palette = paletteInput
      .split(',')
      .map(s => s.trim())
      .filter(s => /^#[0-9a-fA-F]{3,6}$/.test(s))

    setSubmitting(true)
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          anchor_image_base64: anchorBase64,
          project_dna: { ...dna, palette },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Erro ao criar Space')
      }
      const data = await res.json()
      router.push(`/app/spaces/${data.space.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: '#0a0a0a', padding: '40px 48px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Back link */}
        <Link href="/app/spaces" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'rgba(255,255,255,0.42)',
          textDecoration: 'none', marginBottom: 32,
          letterSpacing: '-0.005em',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Spaces
        </Link>

        {/* Title */}
        <h1 style={{
          fontSize: 26, fontWeight: 500,
          letterSpacing: '-0.03em', color: '#fafafa',
          lineHeight: 1.1, marginBottom: 6,
        }}>
          Novo Space
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', marginBottom: 40, letterSpacing: '-0.005em' }}>
          A Vista Mestre define o DNA visual de todo o projeto.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* ── Seção: Básico ─────────────────────────────── */}
            <Section label="Identificação">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16 }}>
                <Field label="Nome do projeto">
                  <input
                    style={inputStyle}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Casa Pisoni · Torre Comercial..."
                    required
                  />
                </Field>

                <Field label="Categoria">
                  <select
                    style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' as const }}
                    value={category}
                    onChange={e => setCategory(e.target.value as SpaceCategory)}
                  >
                    <option value="residencial">Residencial</option>
                    <option value="comercial">Comercial</option>
                    <option value="conceito">Conceito</option>
                  </select>
                </Field>
              </div>
            </Section>

            {/* ── Seção: Anchor ─────────────────────────────── */}
            <Section label="Vista Mestre (Anchor)">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />

              {anchorPreview ? (
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={anchorPreview}
                    alt="Anchor preview"
                    style={{
                      width: '100%', aspectRatio: '16/9',
                      objectFit: 'cover', borderRadius: 10,
                      border: '0.5px solid rgba(255,255,255,0.08)',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(0,0,0,0.6)',
                      backdropFilter: 'blur(10px)',
                      border: '0.5px solid rgba(255,255,255,0.15)',
                      color: '#fff', borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  style={{
                    width: '100%', aspectRatio: '16/9',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 12,
                    background: 'transparent',
                    border: '0.5px dashed rgba(255,255,255,0.14)',
                    borderRadius: 10, cursor: 'pointer',
                    color: 'rgba(255,255,255,0.42)',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fafafa', marginBottom: 4 }}>
                      Upload da Vista Mestre
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: '-0.005em' }}>
                      Arraste ou clique · JPG, PNG, WEBP até 10 MB
                    </div>
                  </div>
                </button>
              )}
            </Section>

            {/* ── Seção: DNA ────────────────────────────────── */}
            <Section label="Project DNA">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field
                  label="Estilo Arquitetônico"
                  hint="Ex: Contemporâneo brasileiro com volumes brancos e madeira"
                >
                  <input
                    style={inputStyle}
                    value={dna.style}
                    onChange={e => setDna(d => ({ ...d, style: e.target.value }))}
                    placeholder="Contemporâneo, minimalista, brutalista..."
                  />
                </Field>

                <Field
                  label="Materiais"
                  hint="Ex: Concreto aparente, madeira cumaru, vidro fumê"
                >
                  <textarea
                    style={{ ...inputStyle, minHeight: 64, resize: 'vertical' as const }}
                    value={dna.materials}
                    onChange={e => setDna(d => ({ ...d, materials: e.target.value }))}
                    placeholder="Fachada, piso, esquadrias, elementos especiais..."
                  />
                </Field>

                <Field
                  label="Paleta de Cores"
                  hint="Códigos hex separados por vírgula: #E8E5DE, #3D2A1E, #6B7355"
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      value={paletteInput}
                      onChange={e => setPaletteInput(e.target.value)}
                      placeholder="#E8E5DE, #3D2A1E, #6B7355, #2B3A4A"
                    />
                    {/* Swatches preview */}
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      {paletteInput.split(',').map(s => s.trim()).filter(s => /^#[0-9a-fA-F]{3,6}$/.test(s)).map((hex, i) => (
                        <div key={i} style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: hex,
                          border: '0.5px solid rgba(255,255,255,0.1)',
                          flexShrink: 0,
                        }} />
                      ))}
                    </div>
                  </div>
                </Field>

                <Field
                  label="Contexto do Terreno"
                  hint="Ex: Terreno em pedra, vegetação nativa, fundo de mata atlântica"
                >
                  <input
                    style={inputStyle}
                    value={dna.context}
                    onChange={e => setDna(d => ({ ...d, context: e.target.value }))}
                    placeholder="Localização, entorno, condicionantes..."
                  />
                </Field>

                <Field
                  label="Perfil de Iluminação"
                  hint="Ex: Sol pleno manhã, sombras duras, blue sky"
                >
                  <input
                    style={inputStyle}
                    value={dna.lighting}
                    onChange={e => setDna(d => ({ ...d, lighting: e.target.value }))}
                    placeholder="Hora do dia, condição atmosférica..."
                  />
                </Field>
              </div>
            </Section>

            {/* ── Error ─────────────────────────────────────── */}
            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(192,57,43,0.1)',
                border: '0.5px solid rgba(192,57,43,0.3)',
                borderRadius: 8,
                fontSize: 13,
                color: '#e87070',
              }}>
                {error}
              </div>
            )}

            {/* ── Actions ───────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 8 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '11px 24px',
                  background: submitting ? 'rgba(48,180,108,0.4)' : 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)',
                  color: '#042818',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: submitting ? 'default' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  boxShadow: submitting ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(48,180,108,0.18)',
                  letterSpacing: '-0.005em',
                }}
              >
                {submitting ? 'Criando Space...' : 'Criar Space'}
              </button>
              <Link href="/app/spaces" style={{
                padding: '11px 16px',
                background: '#111111',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                fontSize: 13, color: 'rgba(255,255,255,0.62)',
                textDecoration: 'none',
                letterSpacing: '-0.005em',
              }}>
                Cancelar
              </Link>
            </div>

          </div>
        </form>
      </div>
    </main>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111111',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '22px 24px',
      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.04)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.24em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.32)',
        marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {label}
        <span style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
      </div>
      {children}
    </div>
  )
}
