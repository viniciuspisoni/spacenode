'use client'

import { useEffect, useState } from 'react'
import type { ImageSize } from '@/lib/onboarding/first-image'

export function useReferenceImage(file: File | null) {
  const [result, setResult] = useState<{ file: File; size: ImageSize | null } | null>(null)
  useEffect(() => {
    if (!file) return
    let alive = true
    const url = URL.createObjectURL(file), image = new Image()
    const done = (size: ImageSize | null) => {
      clearTimeout(timeout)
      image.onload = null; image.onerror = null
      URL.revokeObjectURL(url)
      if (alive) setResult({ file, size })
    }
    const timeout = setTimeout(() => done(null), 15_000)
    image.onload = () => done(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null)
    image.onerror = () => done(null)
    image.src = url
    return () => { alive = false; clearTimeout(timeout); image.onload = null; image.onerror = null; URL.revokeObjectURL(url) }
  }, [file])
  const current = file && result?.file === file ? result : null
  return { size: current?.size ?? null, status: !file ? 'empty' : !current ? 'reading' : current.size ? 'ready' : 'error' } as const
}
