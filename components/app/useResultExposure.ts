'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics/client'
import { POST_RESULT_VERSION } from '@/lib/onboarding/post-result'

/** Observe the actual question/card, not the full expanding result container. */
export function useResultExposure<T extends HTMLElement = HTMLElement>(renderId: string, stage: 'feedback' | 'offer', active = true, kind: 'render' | 'edit' = 'render', eligible = false) {
  const target = useRef<T | null>(null)
  const recorded = useRef(new Set<string>())
  useEffect(() => {
    const element = target.current
    const key = `${renderId}:${stage}:${kind}`
    if (!active || !element || recorded.current.has(key) || typeof IntersectionObserver === 'undefined') return
    let visible = false
    const record = () => {
      if (!visible || document.visibilityState === 'hidden' || recorded.current.has(key)) return
      recorded.current.add(key)
      const props = { render_id: renderId, flow_version: POST_RESULT_VERSION, kind, offer_eligible: stage === 'offer' || eligible }
      if (stage === 'offer') track('plans_viewed', { ...props, surface: 'render_result', plan: 'essence' })
      else track('cta_clicked', { ...props, cta: 'render_feedback_prompt_viewed' })
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)
      record()
    }, { threshold: 0.5 })
    observer.observe(element)
    document.addEventListener('visibilitychange', record)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', record) }
  }, [renderId, stage, active, kind, eligible])
  return target
}
