export type CostObserver = <T>(metadata: { provider: string; endpoint: string; context: string }, call: () => Promise<T>, measure?: (value: T) => { requestId?: string | null; usd?: number | null }) => Promise<T>
/** Pure dependency injection: shared providers must remain client-import safe. */
export function observeCall<T>(observer: CostObserver | undefined, metadata: { provider: string; endpoint: string; context: string }, call: () => Promise<T>, measure?: (value: T) => { requestId?: string | null; usd?: number | null }): Promise<T> {
  return observer ? observer(metadata, call, measure) : call()
}
