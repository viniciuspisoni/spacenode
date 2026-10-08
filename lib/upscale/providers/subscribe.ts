import { fal } from '@fal-ai/client'

/** O SDK instalado não aplica timeout. Limita a espera e cancela a fila
 * quando possível; cancelamento não garante interromper inferência em curso. */
export async function withSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  let abort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new Error('timeout'))
    signal.addEventListener('abort', abort, { once: true })
  })
  try { return await Promise.race([work(), aborted]) }
  finally { signal.removeEventListener('abort', abort) }
}

export async function subscribeBounded(
  endpoint: string,
  input: Record<string, unknown>,
  timeoutMs: number,
  options: { signal?: AbortSignal; onRequestId?: (id: string, endpoint: string) => Promise<void> } = {},
): Promise<{ data: unknown; requestId?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  let id: string | null = null
  let checkpoint = Promise.resolve()
  const cancel = () => { if (id) void fal.queue.cancel(endpoint, { requestId: id }).catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const result = await withSignal(signal, () => fal.subscribe(endpoint, {
      input: input as never,
      onEnqueue(requestId) {
        id = requestId
        if (signal.aborted) { cancel(); return }
        checkpoint = options.onRequestId?.(requestId, endpoint) ?? Promise.resolve()
        void checkpoint.catch(error => controller.abort(error))
      },
    }))
    await withSignal(signal, () => checkpoint)
    return result
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
