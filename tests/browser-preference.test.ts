import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserPreference } from '@/lib/theme/browser-preference'

describe('browser appearance preferences', () => {
  let values: Map<string, string>
  let callbacks: Set<(event: StorageEvent) => void>
  let storage: Storage
  let apply = vi.fn<(value: string) => void>()
  const makeStore = () => createBrowserPreference<'system' | 'light' | 'dark'>({
    key: 'theme', fallback: 'system',
    parse: raw => raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null,
    apply,
  })
  const storageEvent = (key: string | null, area: Storage | null = storage) => {
    callbacks.forEach(callback => callback({ key, storageArea: area } as StorageEvent))
  }
  beforeEach(() => {
    values = new Map()
    callbacks = new Set()
    apply = vi.fn<(value: string) => void>()
    storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    } as unknown as Storage
    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: (_: string, callback: (event: StorageEvent) => void) => callbacks.add(callback),
      removeEventListener: (_: string, callback: (event: StorageEvent) => void) => callbacks.delete(callback),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the server snapshot stable while reading saved browser values', () => {
    values.set('theme', 'light')
    const store = makeStore()
    expect(store.getServerSnapshot()).toBe('system')
    expect(store.getSnapshot()).toBe('light')
    expect(store.hasPreference()).toBe(true)
    expect(apply).not.toHaveBeenCalled() // Leave the inline anti-flash script intact.
    vi.unstubAllGlobals()
    expect(store.getSnapshot()).toBe('system')
  })

  it('updates all same-tab consumers and removes the shared listener after cleanup', () => {
    const store = makeStore()
    const first = vi.fn(), second = vi.fn()
    const stopFirst = store.subscribe(first), stopSecond = store.subscribe(second)
    expect(callbacks.size).toBe(1)
    store.set('dark')
    expect(store.getSnapshot()).toBe('dark')
    expect(values.get('theme')).toBe('dark')
    expect(apply).toHaveBeenCalledWith('dark')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    stopFirst()
    expect(callbacks.size).toBe(1)
    stopSecond()
    expect(callbacks.size).toBe(0)
  })

  it('reflects another tab changing, deleting or clearing its preference', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    values.set('theme', 'light')
    storageEvent('theme')
    expect(store.getSnapshot()).toBe('light')
    expect(apply).toHaveBeenLastCalledWith('light')
    values.delete('theme')
    storageEvent('theme')
    expect(store.getSnapshot()).toBe('system')
    values.set('theme', 'dark')
    storageEvent('theme')
    values.clear()
    storageEvent(null)
    expect(apply).toHaveBeenLastCalledWith('system')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('ignores other preference keys and session storage events', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    storageEvent('glassIntensity')
    storageEvent('theme', {} as Storage)
    expect(listener).not.toHaveBeenCalled()
    expect(store.getRevision()).toBe(0)
  })

  it('keeps a chosen preference usable when browser storage is blocked', () => {
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error('blocked') })
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('blocked') })
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getSnapshot()).toBe('system')
    store.set('light')
    expect(store.getSnapshot()).toBe('light')
    expect(store.hasPreference()).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.adoptRemote('dark', 0)).toBe(false)
  })

  it('adopts the remote preference once on a fresh device', () => {
    const store = makeStore()
    expect(store.adoptRemote('light', store.getRevision())).toBe(true)
    expect(store.adoptRemote('dark', store.getRevision())).toBe(false)
    expect(store.getSnapshot()).toBe('light')
  })

  it('rejects a stale profile response after a newer local choice or a tab reset', () => {
    const store = makeStore()
    store.subscribe(vi.fn())
    const initialRevision = store.getRevision()
    store.set('dark')
    values.clear()
    storageEvent(null)
    expect(store.hasPreference()).toBe(false)
    expect(store.adoptRemote('light', initialRevision)).toBe(false)
    expect(store.getSnapshot()).toBe('system')
  })

  it('recovers from an invalid stored preference with a valid profile value', () => {
    values.set('theme', 'invalid')
    const store = makeStore()
    expect(store.hasPreference()).toBe(false)
    expect(store.adoptRemote('dark', store.getRevision())).toBe(true)
    expect(store.getSnapshot()).toBe('dark')
  })
})
