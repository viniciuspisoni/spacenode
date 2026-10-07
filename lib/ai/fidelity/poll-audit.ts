import type { PublicRenderAudit } from './audit-status'

const UNAVAILABLE: PublicRenderAudit = { status: 'unavailable', warning: false, materialsPassed: false }
const PENDING: PublicRenderAudit = { status: 'pending', warning: false, materialsPassed: false }

export function normalizePublicAudit(raw: unknown): PublicRenderAudit | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.status !== 'string' || !['pending', 'completed', 'unavailable', 'not_requested'].includes(value.status) ||
      typeof value.warning !== 'boolean' || typeof value.materialsPassed !== 'boolean') return null
  return { status: value.status as PublicRenderAudit['status'], warning: value.warning,
    materialsPassed: value.status === 'completed' && !value.warning && value.materialsPassed }
}

function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return }
    const finish = (continuePolling: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      resolve(continuePolling)
    }
    const cancel = () => finish(false)
    const timer = setTimeout(() => finish(true), ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

async function request(url: string, signal: AbortSignal, timeoutMs: number, fetcher: typeof fetch) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new Error('audit cancelled')) }
    signal.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => { controller.abort(); reject(new Error('audit request timeout')) }, timeoutMs)
    if (signal.aborted) cancel()
  })
  try {
    return await Promise.race([
      fetcher(url, { signal: controller.signal, cache: 'no-store' }).then(async response => ({
        response, body: response.ok ? await response.json() as unknown : null,
      })),
      interrupted,
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

/** Read-only polling: bounded requests/time, retries for temporary failures, no AI calls. */
export async function pollRenderAudit(renderId: string, options: {
  signal: AbortSignal
  onPending: (result: PublicRenderAudit) => void
  fetcher?: typeof fetch
}): Promise<PublicRenderAudit | null> {
  const { signal, onPending, fetcher = fetch } = options
  const deadline = Date.now() + 90_000
  let failures = 0
  for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt++) {
    if (signal.aborted) return null
    try {
      const { response, body } = await request(`/api/renders/${encodeURIComponent(renderId)}/preservation`, signal,
        Math.min(10_000, deadline - Date.now()), fetcher)
      if (signal.aborted) return null
      if (!response.ok && response.status !== 429 && response.status < 500) return UNAVAILABLE
      const data = response.ok ? normalizePublicAudit(body) : null
      if (!data) throw new Error('temporary audit failure')
      failures = 0
      if (data.status !== 'pending') return data
      onPending(data)
    } catch {
      if (signal.aborted) return null
      if (++failures >= 3) return UNAVAILABLE
      onPending(PENDING)
    }
    if (attempt < 29 && !(await pause(Math.min(2000, Math.max(0, deadline - Date.now())), signal))) return null
  }
  return UNAVAILABLE
}
