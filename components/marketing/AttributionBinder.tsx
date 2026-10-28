'use client'

import { useEffect } from 'react'
import { useMarketingConsent } from '@/components/analytics/useMarketingConsent'
import { metaPixelTrack } from '@/lib/analytics/adapters/meta-pixel'
import { waitForMarketingTag } from '@/lib/analytics/tag-ready'
import type { SignupConversionResult } from '@/lib/analytics/signup-conversion'

function saved(key: string): boolean {
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}
function save(key: string): void {
  try { window.localStorage.setItem(key, '1') } catch { /* Server remains idempotent. */ }
}

/** The server confirms the signup; URL cleanup cannot consume its conversion.
 * Consent changes and transport failures remain retryable, per account. */
export default function AttributionBinder({ userId }: { userId: string }) {
  const consent = useMarketingConsent()
  useEffect(() => {
    if (!userId) return
    const boundFlag = `sn_attr_bound:${userId}`
    const conversionFlag = `sn_meta_signup_v1:${userId}`
    if (saved(boundFlag) && (saved(conversionFlag) || consent !== 'granted')) return
    const controller = new AbortController()
    let retry: ReturnType<typeof setTimeout> | undefined

    async function bind(attempt = 0): Promise<void> {
      let complete = false
      try {
        const res = await fetch('/api/marketing/track', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'bind_signup' }),
        })
        if (!res.ok) throw new Error('bind failed')
        const data = await res.json() as { bound?: boolean; conversion?: SignupConversionResult }
        if (controller.signal.aborted) return
        if (data.bound === true) save(boundFlag)
        const conversion = data.conversion
        let pixelQueued = false
        if (conversion?.eventId && consent === 'granted'
          && await waitForMarketingTag('fbq', controller.signal)) {
          if (controller.signal.aborted) return
          pixelQueued = metaPixelTrack('signup_completed', { status: true }, conversion.eventId)
        }
        if (controller.signal.aborted) return
        complete = conversion?.status === 'accepted' || conversion?.status === 'ineligible'
          || (conversion?.status === 'unconfigured' && pixelQueued)
        if (complete) save(conversionFlag)
        if (conversion?.status === 'consent_required') return
      } catch { /* Retry below, then on the next visit if still unavailable. */ }
      if (!complete && attempt < 2 && !controller.signal.aborted) {
        retry = setTimeout(() => { void bind(attempt + 1) }, 1500 * (attempt + 1))
      }
    }
    void bind()
    return () => { controller.abort(); clearTimeout(retry) }
  }, [userId, consent])
  return null
}
