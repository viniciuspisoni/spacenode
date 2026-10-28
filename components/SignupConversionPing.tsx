'use client'

// Legacy Google Ads URL trigger. Meta uses the authenticated signup through
// AttributionBinder and shares its event ID with Conversions API.
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { reportSignupConversion } from '@/lib/gtag'
import { useMarketingConsent } from '@/components/analytics/useMarketingConsent'
import { waitForMarketingTag } from '@/lib/analytics/tag-ready'

export default function SignupConversionPing() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isSignup = searchParams.get('signup') === '1'
  const consent = useMarketingConsent()

  useEffect(() => {
    if (!isSignup || consent === null) return
    const controller = new AbortController()
    const finish = () => {
      // Checkout may already have consumed resume=1 in the current URL.
      const url = new URL(window.location.href)
      url.searchParams.delete('signup')
      url.searchParams.delete('resume')
      router.replace(`${url.pathname}${url.search}${url.hash}`)
    }
    async function run() {
      if (consent === 'granted' && process.env.NEXT_PUBLIC_GADS_SIGNUP_LABEL) {
        if (!await waitForMarketingTag('gtag', controller.signal)) return
        if (controller.signal.aborted) return
        reportSignupConversion()
      }
      if (!controller.signal.aborted) finish()
    }
    void run()
    return () => controller.abort()
  }, [isSignup, consent, router])
  return null
}
