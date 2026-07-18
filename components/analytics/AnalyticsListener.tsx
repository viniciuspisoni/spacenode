'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { captureUtm, track } from '@/lib/analytics/track'

function AnalyticsListenerInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  useEffect(() => {
    captureUtm(searchParams)
    track('page_view', { path: query ? `${pathname}?${query}` : pathname })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, query])

  return null
}

// page_view dispara a cada troca de rota (App Router não recarrega a página,
// então isso substitui o pageview automático de um <script> de tag manager).
export function AnalyticsListener() {
  return (
    <Suspense fallback={null}>
      <AnalyticsListenerInner />
    </Suspense>
  )
}
