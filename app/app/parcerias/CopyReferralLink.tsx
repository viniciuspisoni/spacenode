'use client'

import { useState } from 'react'

export function CopyReferralLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" onClick={copy} style={{
      border: 0, borderRadius: 10, padding: '12px 18px', cursor: 'pointer',
      background: 'var(--color-text-primary)', color: 'var(--color-bg)',
      fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
    }}>
      {copied ? 'Link copiado' : 'Copiar link'}
    </button>
  )
}
