import { marketingConsentClient } from './consent'

/** Wait for consented scripts without consuming the conversion while loading.
 * Abort on component cleanup/account changes; a later mount may retry. */
export function waitForMarketingTag(
  name: 'fbq' | 'gtag', signal: AbortSignal, timeoutMs = 10000,
): Promise<boolean> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = Date.now() + timeoutMs
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(ready)
    }
    const abort = () => finish(false)
    const check = () => {
      if (signal.aborted || typeof window === 'undefined' || !marketingConsentClient()) return finish(false)
      if (typeof window[name] === 'function') return finish(true)
      if (Date.now() >= deadline) return finish(false)
      timer = setTimeout(check, 100)
    }
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
}
