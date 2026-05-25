// Server-side retry helper. Wraps an engine call so that a transient
// RetouchTimeoutError on the first attempt triggers ONE automatic retry.
// All other errors (no-output, FAL 4xx/5xx, network) propagate immediately —
// retrying them would just waste another node.
//
// Why this exists:
//   FAL models cold-start unpredictably. The first call after some idle time
//   can take 90-180s or more; the second call to the same model usually
//   returns in <30s because the cluster is warm. Without this wrapper a
//   single cold-start call surfaces as a hard 500 to the user and burns
//   their patience for no good reason.
//
// Crediting:
//   The route is still responsible for debiting BEFORE this wrapper and
//   refunding if BOTH attempts fail. We don't manage credits here.
//
// Limits:
//   We retry once. Two timeouts in a row almost certainly mean the model is
//   degraded — burning more retries would push the user to wait 9+ minutes
//   for nothing. The route surfaces the error after that.

import type { EngineDescriptor, RetouchInput, RetouchOutput } from './types'
import { RetouchTimeoutError } from './types'

export async function callWithTimeoutRetry(
  engine:  EngineDescriptor,
  input:   RetouchInput,
  retries = 1,
): Promise<RetouchOutput> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await engine.call(input)
    } catch (err) {
      lastErr = err
      // Anything other than a timeout is non-retryable.
      if (!(err instanceof RetouchTimeoutError)) throw err
      if (attempt === retries) break
      console.warn(
        '[engines] timeout on %s — retry %d/%d',
        engine.endpoint,
        attempt + 1,
        retries,
      )
    }
  }
  throw lastErr
}
