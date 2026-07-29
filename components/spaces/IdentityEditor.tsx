'use client'

// Editor de identidade do escritório — live preview + form + footer.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ArchitectIdentity, AccentColorMode } from '@/lib/spaces/types'
import type { PlanId } from '@/lib/plans'

const ACCENT_PRESETS = ['#1D9E75', '#2A4877', '#A33D3D', '#BA7517', '#5B5B5B', '#C2865B']

interface Props {
  initialIdentity:    ArchitectIdentity | null
  planId:             PlanId
  planName:           string
  whiteLabelAllowed:  boolean
}

export function IdentityEditor({ initialIdentity, planName, whiteLabelAllowed }: Props) {
  // Form state
  const [name, setName]                     = useState(initialIdentity?.name ?? '')
  const [subtitle, setSubtitle]             = useState(initialIdentity?.subtitle ?? '')
  const [email, setEmail]                   = useState(initialIdentity?.email_contact ?? '')
  const [social, setSocial]                 = useState(initialIdentity?.social_link ?? '')
  const [accentMode, setAccentMode]         = useState<AccentColorMode>(initialIdentity?.accent_color_mode ?? 'derived_from_dna')
  const [accentFixed, setAccentFixed]       = useState(initialIdentity?.accent_color_fixed ?? ACCENT_PRESETS[0])
  const [footer, setFooter]                 = useState(initialIdentity?.footer_message ?? '')
  const [whiteLabel, setWhiteLabel]         = useState(initialIdentity?.white_label_enabled ?? false)

  const [logoUrl, setLogoUrl]               = useState<string | null>(initialIdentity?.logo_url ?? null)
  const [logoFile, setLogoFile]             = useState<File | null>(null)
  const [logoPreview, setLogoPreview]       = useState<string | null>(initialIdentity?.logo_url ?? null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [savedAt, setSavedAt]               = useState<number | null>(null)

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (logoPreview && logoFile && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview)
      }
    }
  }, [logoPreview, logoFile])

  function pickFile(f: File | null) {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(f.type)) {
      setError('Formato não suportado (JPG, PNG, SVG ou WebP)')
      return
    }
    if (f.size > 2 * 1024 * 1024) {
      setError('Logo maior que 2 MB')
      return
    }
    setError(null)
    setLogoFile(f)
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoPreview(URL.createObjectURL(f))
  }

  function removeLogo() {
    setLogoFile(null)
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoPreview(null)
    setLogoUrl(null)
  }

  async function handleSave() {
    setError(null)
    if (!name.trim()) {
      setError('Nome do escritório é obrigatório')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('subtitle', subtitle)
      fd.append('email_contact', email)
      fd.append('social_link', social)
      fd.append('footer_message', footer)
      fd.append('accent_color_mode', accentMode)
      if (accentMode === 'fixed') fd.append('accent_color_fixed', accentFixed)
      fd.append('white_label_enabled', whiteLabel ? '1' : '0')
      if (logoFile)                            fd.append('logo', logoFile)
      if (!logoFile && !logoPreview && logoUrl !== null) fd.append('remove_logo', '1')

      const res = await fetch('/api/users/me/identity', { method: 'PUT', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Erro ao salvar')
      const idn = data.identity as ArchitectIdentity
      setLogoUrl(idn.logo_url)
      if (!logoFile) setLogoPreview(idn.logo_url)
      else { setLogoFile(null); setLogoPreview(idn.logo_url) }
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Preview accent (modo "derived" mostra default verde como exemplo)
  const previewAccent = accentMode === 'fixed' ? accentFixed : '#1D9E75'

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 32px 80px' }}>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 12, color: 'var(--color-text-tertiary)',
        marginBottom: 28,
      }}>
        <Link href="/app">Workspace</Link>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <span>Configurações</span>
        <span style={{ opacity: 0.35, fontSize: 9 }}>›</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>Identidade</span>
      </div>

      <header style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.1,
        }}>
          Identidade do escritório
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.6, maxWidth: 600 }}>
          Aplicado em todos os Packs e links compartilháveis. A cor de acento por padrão
          é derivada do DNA de cada projeto — varia de projeto pra projeto.
        </p>
      </header>

      {/* Live preview do cabeçalho */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 14, padding: 24,
        marginBottom: 32,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)', marginBottom: 14,
        }}>
          Preview do cabeçalho
        </div>
        <div style={{
          background: '#fafafa', color: '#1a1a1a',
          padding: '20px 24px', borderRadius: 10,
          borderBottom: `2px solid ${previewAccent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
            ) : (
              <span style={{ width: 36, height: 36, borderRadius: 999, background: previewAccent }} />
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {name || 'Nome do escritório'}
              </div>
              {subtitle && <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {email && (
            <span style={{ fontSize: 12, color: '#424245' }}>{email}</span>
          )}
        </div>
      </div>

      {/* Form */}
      <div style={{
        display: 'grid', gap: 20,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {/* Logo */}
        <Field label="Logo" hint="PNG, SVG, JPG ou WebP — até 2 MB">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            onChange={e => pickFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 12,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 10,
          }}>
            {logoPreview ? (
              <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 8,
                background: 'var(--color-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-quaternary)', fontSize: 11,
              }}>
                sem logo
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <button onClick={() => fileInputRef.current?.click()} className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}>
                {logoPreview ? 'Trocar' : 'Selecionar'}
              </button>
              {logoPreview && (
                <button onClick={removeLogo} className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12, color: '#e57373' }}>
                  Remover
                </button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Nome do escritório *">
          <Input value={name} onChange={setName} placeholder="" />
        </Field>

        <Field label="Subtítulo (opcional)">
          <Input value={subtitle} onChange={setSubtitle} placeholder="Ex: arquitetura · interiores · paisagem" />
        </Field>

        <Field label="Email de contato">
          <Input value={email} onChange={setEmail} type="email" placeholder="contato@escritorio.com" />
        </Field>

        <Field label="Site ou Instagram (opcional)">
          <Input value={social} onChange={setSocial} placeholder="https:// ou @perfil" />
        </Field>

        <Field label="Mensagem de rodapé (opcional)" wide>
          <Input value={footer} onChange={setFooter} placeholder="Ex: Apresentação confidencial · uso exclusivo do cliente" />
        </Field>

        <Field label="Cor de acento" hint="Por padrão, derivada do DNA de cada projeto.">
          <div style={{
            padding: 14, borderRadius: 10,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="accent_mode"
                checked={accentMode === 'derived_from_dna'}
                onChange={() => setAccentMode('derived_from_dna')}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>Derivar do DNA do projeto</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                  Cada projeto recebe um acento diferente. Recomendado.
                </div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="accent_mode"
                checked={accentMode === 'fixed'}
                onChange={() => setAccentMode('fixed')}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>Cor fixa</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {ACCENT_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setAccentMode('fixed'); setAccentFixed(c) }}
                      style={{
                        width: 24, height: 24, borderRadius: 999,
                        background: c, border: accentFixed === c && accentMode === 'fixed'
                          ? '2px solid var(--color-text-primary)'
                          : '0.5px solid rgba(255,255,255,0.12)',
                        cursor: 'pointer', padding: 0,
                      }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </label>
          </div>
        </Field>

        <Field label="White-label" hint={whiteLabelAllowed ? 'Remove a atribuição "criado com spacenode" do rodapé do link compartilhável.' : `Disponível a partir do plano Pro. Você está em ${planName}.`}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 14, borderRadius: 10,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            cursor: whiteLabelAllowed ? 'pointer' : 'not-allowed',
            opacity: whiteLabelAllowed ? 1 : 0.55,
          }}>
            <input
              type="checkbox"
              checked={whiteLabel}
              onChange={e => setWhiteLabel(e.target.checked)}
              disabled={!whiteLabelAllowed}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Remover atribuição spacenode
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {whiteLabel ? 'Atribuição removida do rodapé.' : 'Atribuição visível no rodapé.'}
              </div>
            </div>
          </label>
        </Field>
      </div>

      {error && (
        <div style={{
          marginTop: 24, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
          color: '#e57373', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 32, paddingTop: 20,
        borderTop: '0.5px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {/* eslint-disable-next-line react-hooks/purity -- transient toast fade; re-render driven by setSavedAt elsewhere */}
          {savedAt && (Date.now() - savedAt) < 8000 ? '✓ Identidade salva.' : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/app" className="spn-action spn-action--ghost" style={{ width: 'auto', padding: '10px 18px', fontSize: 12 }}>
            Cancelar
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="spn-action spn-action--primary"
            style={{ width: 'auto', padding: '10px 18px', fontSize: 12 }}
          >
            {saving ? 'Salvando…' : 'Salvar identidade'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub ───────────────────────────────────────────────────────

function Field({ label, hint, children, wide }: {
  label: string; hint?: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 8,
      }}>
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 8, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '12px 14px',
        background: 'var(--color-bg-elevated)',
        border: '0.5px solid var(--color-border-strong)',
        borderRadius: 10, color: 'var(--color-text-primary)',
        fontSize: 13, letterSpacing: '-0.005em', outline: 'none',
      }}
    />
  )
}
