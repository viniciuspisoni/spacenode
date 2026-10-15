'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readRenderDraft, removeRenderDraft, saveRenderDraft, type RenderDraft } from '@/lib/onboarding/render-draft'
import { track } from '@/lib/analytics/client'

export type DraftSnapshot = Pick<RenderDraft, 'image' | 'filename' | 'lastModified' | 'config' | 'materials' | 'materialRefs' | 'direction' | 'goal'>

export function useRenderDraft({ userId, snapshot, onRestore }: {
  userId?: string
  snapshot: DraftSnapshot | null
  onRestore: (draft: RenderDraft, file: File) => boolean
}) {
  const [available, setAvailable] = useState<RenderDraft | null>(null)
  const [saved, setSaved] = useState<DraftSnapshot | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [checked, setChecked] = useState(false)
  const latest = useRef(snapshot)
  const restore = useRef(onRestore)
  const mounted = useRef(false)
  const active = useRef<{ image: Blob; id: string; stopped: boolean } | null>(null)
  const revision = useRef(0)
  useEffect(() => { latest.current = snapshot; restore.current = onRestore }, [snapshot, onRestore])

  const persist = useCallback(async (input: DraftSnapshot) => {
    if (!userId) return
    if (active.current?.image !== input.image) active.current = { image: input.image, id: crypto.randomUUID(), stopped: false }
    const current = active.current!
    if (current.stopped) return
    const version = ++revision.current
    try {
      await saveRenderDraft({ ...input, version: 1, id: current.id, ownerId: userId, updatedAt: Date.now() })
      if (mounted.current && revision.current === version && !current.stopped) {
        setSaved(input); setStorageError(false); setAvailable(null)
      }
    } catch {
      if (mounted.current && revision.current === version) setStorageError(true)
    }
  }, [userId])

  const resume = useCallback((draft: RenderDraft) => {
    const file = new File([draft.image], draft.filename, { type: draft.image.type, lastModified: draft.lastModified })
    if (!restore.current(draft, file)) return
    active.current = { image: file, id: draft.id, stopped: false }
    setAvailable(null)
    track('cta_clicked', { cta: 'onboarding_draft_resumed', flow_version: '2026-10-15' })
  }, [])

  useEffect(() => {
    mounted.current = true
    let alive = true
    if (userId) void readRenderDraft(userId).then(draft => {
      if (!alive) return
      setChecked(true)
      if (latest.current || !draft) return
      setAvailable(draft)
      track('cta_clicked', { cta: 'onboarding_draft_available', flow_version: '2026-10-15' })
      if (new URLSearchParams(window.location.search).get('resume') === '1') resume(draft)
    }).catch(() => { if (alive) { setChecked(true); setStorageError(true) } })
    const flush = () => { if (latest.current) void persist(latest.current) }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      alive = false; mounted.current = false
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      flush()
    }
  }, [userId, persist, resume])

  useEffect(() => {
    if (!checked || !snapshot || !userId) return
    // Save the image immediately, debounce subsequent adjustments.
    const delay = active.current?.image === snapshot.image ? 500 : 0
    const timer = setTimeout(() => { void persist(snapshot) }, delay)
    return () => clearTimeout(timer)
  }, [snapshot, checked, userId, persist])

  const clear = async () => {
    const current = active.current
    if (!userId || !current) return
    active.current = { ...current, stopped: true }
    ++revision.current
    try {
      await removeRenderDraft(userId, current.id)
      if (mounted.current) { setAvailable(null); setSaved(null); setStorageError(false) }
    } catch { if (mounted.current) setStorageError(true) }
  }

  return {
    available, resume, complete: () => clear(),
    discard: async () => {
      if (!available || !userId) return
      try {
        await removeRenderDraft(userId, available.id)
        setAvailable(null); setStorageError(false)
        track('cta_clicked', { cta: 'onboarding_draft_discarded', flow_version: '2026-10-15' })
      } catch { setStorageError(true) }
    },
    status: storageError ? 'error' : snapshot ? (saved === snapshot ? 'saved' : 'saving') : 'idle',
  } as const
}
