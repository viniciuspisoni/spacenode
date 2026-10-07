/** Browser-only preferences with stable SSR snapshots and same-tab notifications. */
export function createBrowserPreference<T extends string | number>(options: {
  key: string
  fallback: T
  parse: (raw: string | null) => T | null
  apply: (value: T) => void
}) {
  const listeners = new Set<() => void>()
  let memory: T | null = null
  let revision = 0

  const read = (): T | null => {
    if (typeof window === 'undefined') return null
    if (memory !== null) return memory
    try { return options.parse(window.localStorage.getItem(options.key)) } catch { return null }
  }
  const getSnapshot = () => read() ?? options.fallback
  const notify = () => listeners.forEach(listener => listener())
  const onStorage = (event: StorageEvent) => {
    if (event.key !== options.key && event.key !== null) return
    // Ignore sessionStorage; a null storageArea also supports synthetic events.
    if (event.storageArea && event.storageArea !== window.localStorage) return
    memory = null
    revision++
    options.apply(getSnapshot())
    notify()
  }
  const set = (value: T) => {
    if (typeof window === 'undefined') return
    revision++
    memory = value
    try {
      window.localStorage.setItem(options.key, String(value))
      memory = null
    } catch {}
    options.apply(value)
    notify()
  }
  return {
    getSnapshot,
    getServerSnapshot: () => options.fallback,
    hasPreference: () => read() !== null,
    getRevision: () => revision,
    set,
    adoptRemote(value: T, expectedRevision: number) {
      if (revision !== expectedRevision || read() !== null) return false
      set(value)
      return true
    },
    subscribe(listener: () => void) {
      if (listeners.size === 0) window.addEventListener('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}
