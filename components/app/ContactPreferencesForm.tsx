'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CONTACT_COPY, CONTACT_NOTICE_VERSION, normalizeWhatsApp, type ContactPreferences } from '@/lib/customer-contact/validation'

export default function ContactPreferencesForm({ initial, requiredForSignup = false }: {
  initial?: ContactPreferences | null
  requiredForSignup?: boolean
}) {
  const router = useRouter()
  const [phone, setPhone] = useState(initial?.whatsapp_e164 ?? '')
  const [support, setSupport] = useState(initial?.support_opt_in ?? false)
  const [marketing, setMarketing] = useState(initial?.marketing_opt_in ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError(null)
    setSaved(false)
    const normalized = normalizeWhatsApp(phone)
    if (!normalized) { setError('Informe um celular com DDD. Para outro país, comece com + e o código do país.'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/users/me/contact', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: normalized, support_opt_in: support,
          marketing_opt_in: marketing, notice_version: CONTACT_NOTICE_VERSION }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.ok) {
        setError(response.status === 401 ? 'Entre novamente para salvar.' : 'Não foi possível salvar. Tente novamente.')
        return
      }
      setPhone(normalized)
      setSaved(true)
      // Refresh the current destination, including billing intent and query parameters.
      router.refresh()
    } catch {
      setError('Não foi possível salvar. Confira sua conexão e tente novamente.')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="contact-whatsapp" style={{ fontSize: 14, fontWeight: 500 }}>Seu WhatsApp com DDD</label>
        <input id="contact-whatsapp" name="whatsapp" type="tel" autoComplete="tel" inputMode="tel"
          required maxLength={40} value={phone} disabled={saving}
          onChange={event => { setPhone(event.target.value); setSupport(false); setMarketing(false); setSaved(false) }}
          placeholder="(11) 99999-9999" aria-describedby="contact-help" aria-invalid={!!error}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '12px 14px', fontSize: 16,
            borderRadius: 10, border: '1px solid var(--color-input-border)',
            color: 'var(--color-text-primary)', background: 'var(--color-input)' }} />
        <p id="contact-help" style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          {requiredForSignup ? 'O WhatsApp é necessário para concluir seu cadastro. ' : ''}
          Informe um número seu. Para outro país, use + e o código do país.
        </p>
      </div>
      <fieldset disabled={saving} style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 12 }}>
        <legend style={{ marginBottom: 12, fontSize: 14, fontWeight: 500 }}>Você escolhe o que receber</legend>
        {[
          { id: 'contact-support', checked: support, set: setSupport, text: CONTACT_COPY.support },
          { id: 'contact-marketing', checked: marketing, set: setMarketing, text: CONTACT_COPY.marketing },
        ].map(option => (
          <label key={option.id} htmlFor={option.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, fontSize: 14, lineHeight: 1.6 }}>
            <input id={option.id} type="checkbox" checked={option.checked}
              onChange={event => { option.set(event.target.checked); setSaved(false) }}
              style={{ marginTop: 5, flexShrink: 0, width: 18, height: 18 }} />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
        As duas escolhas são opcionais. Você pode alterá-las em Conta a qualquer momento.
        {' '}<a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Política de Privacidade</a>.
      </p>
      {error && <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--color-error)' }}>{error}</p>}
      <button type="submit" disabled={saving} className="spn-ghost"
        style={{ minHeight: 48, padding: '12px 18px', fontSize: 14, color: 'var(--color-text-primary)' }}>
        {saving ? 'Salvando…' : requiredForSignup ? 'Concluir cadastro' : 'Salvar preferências'}
      </button>
      {saved && <p role="status" style={{ margin: 0, fontSize: 14 }}>Preferências salvas.</p>}
    </form>
  )
}
