'use client'

import { useEffect, useState } from 'react'
import type { PublicRenderAudit } from '@/lib/ai/fidelity/audit-status'

export default function RenderPreservationStatus({ renderId, onWarning }: { renderId: string; onWarning: () => void }) {
  const [result, setResult] = useState<PublicRenderAudit | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    async function check() {
      try {
        const response = await fetch(`/api/renders/${encodeURIComponent(renderId)}/preservation`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('audit unavailable')
        const data = await response.json() as PublicRenderAudit
        if (controller.signal.aborted) return
        if (data.status === 'pending' && ++attempts < 30) {
          setResult(data)
          timer = setTimeout(check, 2000)
          return
        }
        setResult(data.status === 'pending' ? { ...data, status: 'unavailable' } : data)
        if (data.warning) onWarning()
      } catch {
        if (!controller.signal.aborted) setResult({ status: 'unavailable', warning: false, materialsPassed: false })
      }
    }
    void check()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [renderId, onWarning])
  if (result?.status === 'pending') return <p className="spn-hint" role="status">Conferindo os materiais do resultado…</p>
  if (result?.status === 'unavailable') return <p className="spn-hint" role="status">A verificação dos materiais não foi concluída. Confira o resultado com a imagem original.</p>
  if (result?.materialsPassed) return <p className="spn-hint" role="status">Materiais conferidos com a imagem original.</p>
  return null
}
