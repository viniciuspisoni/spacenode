import { APICallError, NoObjectGeneratedError } from 'ai'

/** Fixed diagnostic codes only: SDK errors can carry private images and prompts. */
export function pilotFailure(error: unknown): { issue: string; retryable: boolean } {
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason === 'content-filter') return { issue: 'output-blocked', retryable: false }
    return { issue: error.finishReason === 'length' ? 'output-truncated' : 'output-invalid', retryable: true }
  }
  const status = APICallError.isInstance(error) ? error.statusCode
    : error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
  if (typeof status === 'number' && [400, 401, 402, 403, 404, 408, 424, 429, 500, 502, 503, 504].includes(status)) {
    return { issue: `http-${status}`, retryable: [500, 502, 503, 504].includes(status) }
  }
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return { issue: 'timeout-or-abort', retryable: false }
  return { issue: 'unavailable', retryable: false }
}

export interface PilotUsage {
  inputTokens: number; outputTokens: number; durationMs: number; steps: number; nominalUsd: number
  attempts: number; costComplete: boolean; recoveredFrom?: string
}

export class PilotRunError extends Error {
  constructor(readonly issue: string, readonly usage: PilotUsage, readonly retryBudget?: 'limited' | 'unavailable') {
    // Deliberately do not retain the provider error as cause.
    super('First-image analysis unavailable')
    this.name = 'PilotRunError'
  }
}
