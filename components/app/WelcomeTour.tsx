'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/analytics/client'
import { ONBOARDING_PATHS, type OnboardingSource } from '@/lib/onboarding'
import WelcomeExperience from './WelcomeExperience'

export const TOUR_START_EVENT = 'spn:tour:start'

/** Keeps the existing first-visit and sidebar replay contract. */
export default function WelcomeTour({ needsOnboarding }: { needsOnboarding: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const autoStarted = useRef(false)
  const pendingPersist = useRef(needsOnboarding)
  const persisting = useRef(false)

  const start = useCallback(() => {
    autoStarted.current = true
    setSession(value => value + 1)
    setOpen(true)
    track('cta_clicked', { cta: 'onboarding_tour_started', surface: 'welcome_experience' })
  }, [])

  const markSeen = useCallback((outcome: 'dismissed' | 'started_render' | 'started_edit') => {
    if (!pendingPersist.current || persisting.current) return
    persisting.current = true
    void (async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase.from('profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', user.id).is('onboarding_completed_at', null).select('id')
        if (!error && data?.length) {
          pendingPersist.current = false
          track('onboarding_completed', { surface: 'welcome_experience', outcome })
        }
      } catch {
        // Best effort: a failed write allows the introduction on a later visit.
      } finally { persisting.current = false }
    })()
  }, [])

  const dismiss = () => {
    setOpen(false)
    track('cta_clicked', { cta: 'onboarding_tour_skipped', surface: 'welcome_experience' })
    markSeen('dismissed')
  }

  const launch = (source: OnboardingSource) => {
    setOpen(false)
    track('cta_clicked', { cta: 'onboarding_first_action', source })
    markSeen(source === 'render' ? 'started_edit' : 'started_render')
    router.push(ONBOARDING_PATHS[source].href)
  }

  useEffect(() => {
    if (pathname !== '/app') return
    const manual = window.location.hash === '#tour'
    if (manual) window.history.replaceState(null, '', '/app' + window.location.search)
    else if (!needsOnboarding || autoStarted.current) return
    const timer = window.setTimeout(start, manual ? 100 : 500)
    return () => window.clearTimeout(timer)
  }, [pathname, needsOnboarding, start])

  useEffect(() => {
    const onStart = () => { if (window.location.pathname === '/app') start() }
    window.addEventListener(TOUR_START_EVENT, onStart)
    return () => window.removeEventListener(TOUR_START_EVENT, onStart)
  }, [start])

  useEffect(() => {
    if (pathname === '/app') return
    const frame = requestAnimationFrame(() => setOpen(false))
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  // Removing the native dialog on navigation removes its modal state and restores focus.
  if (pathname !== '/app') return null
  return open ? <WelcomeExperience key={session} open onDismiss={dismiss} onStart={launch} /> : null
}
