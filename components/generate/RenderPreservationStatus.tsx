'use client'

import { useEffect, useState } from 'react'
import type { PublicRenderAudit } from '@/lib/ai/fidelity/audit-status'
import { pollRenderAudit } from '@/lib/ai/fidelity/poll-audit'

export default function RenderPreservationStatus({ renderId, onWarning }: { renderId: string; onWarning: () => void }) {
  const [result, setResult] = useState<PublicRenderAudit | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void pollRenderAudit(renderId, { signal: controller.signal, onPending: setResult }).then(data => {
      if (!data || controller.signal.aborted) return
      setResult(data)
      if (data.warning) onWarning()
    })
    return () => controller.abort()
  }, [renderId, onWarning])
  if (result?.status === 'pending') return <p className="spn-hint" role="status">Conferindo os materiais do resultado…</p>
  if (result?.status === 'unavailable') return <p className="spn-hint" role="status">A verificação dos materiais não foi concluída. Confira o resultado com a imagem original.</p>
  if (result?.materialsPassed) return <p className="spn-hint" role="status">Materiais conferidos com a imagem original.</p>
  return null
}
