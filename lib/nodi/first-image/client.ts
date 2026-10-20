'use client'

export function observeFirstImagePilot(receipt: string, stage: 'applied' | 'generated' | 'feedback', extra: { renderId?: string; helpful?: boolean; modified?: boolean } = {}) {
  void fetch('/api/nodi/first-image/observe', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt, stage, ...extra }) }).catch(() => {})
}
