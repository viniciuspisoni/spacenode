import { isEngineId, isResolution, isValidCombination, type EngineId, type Resolution } from '@/lib/engines'
import { ONBOARDING_GOALS, type OnboardingGoal } from '@/lib/onboarding'
import type { ProjectMaterials, ProjectType } from '@/lib/prompts'
import type { FixtureLights } from '@/lib/ai/fixture-lights'

export const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const DATABASE = 'spn-render-drafts'
const STORE = 'drafts'
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MATERIAL_FIELDS = ['fachada', 'piso', 'esquadrias', 'paredes', 'teto', 'marcenaria', 'bancadas', 'elementos', 'outros'] as const

export interface DraftConfig {
  projectType: ProjectType
  segment: string
  environment: string
  lighting: string
  fixtureLights: FixtureLights
  background: string
  sceneElements: string[]
  selectedEngine: EngineId
  selectedResolution: Resolution
}

export interface RenderDraft {
  version: 1
  id: string
  ownerId: string
  updatedAt: number
  image: Blob
  filename: string
  lastModified: number
  config: DraftConfig
  materials: ProjectMaterials
  materialRefs: Partial<Record<keyof ProjectMaterials, string>>
  direction: string
  goal: OnboardingGoal | null
}

const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const text = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length <= max

/** Local data is versioned and checked before it can configure a paid request. */
export function parseRenderDraft(raw: unknown, ownerId: string, now = Date.now()): RenderDraft | null {
  const d = record(raw), c = record(d?.config), m = record(d?.materials), refs = record(d?.materialRefs)
  if (!d || !c || !m || !refs || !ownerId || d.ownerId !== ownerId || d.version !== 1 ||
    !text(d.id, 100) || !d.id || typeof d.updatedAt !== 'number' || !Number.isFinite(d.updatedAt) ||
    d.updatedAt > now + 60_000 || now - d.updatedAt > DRAFT_MAX_AGE ||
    !(d.image instanceof Blob) || d.image.size === 0 || d.image.size > MAX_IMAGE_BYTES ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(d.image.type) ||
    !text(d.filename, 200) || typeof d.lastModified !== 'number' || !Number.isFinite(d.lastModified) ||
    !text(d.direction, 4000) || (d.goal !== null && !(typeof d.goal === 'string' && Object.hasOwn(ONBOARDING_GOALS, d.goal))) ||
    !['interior', 'exterior'].includes(String(c.projectType)) ||
    !['preserve', 'on', 'off'].includes(String(c.fixtureLights)) ||
    !isEngineId(c.selectedEngine) || !isResolution(c.selectedResolution) || !isValidCombination(c.selectedEngine, c.selectedResolution) ||
    !['segment', 'environment', 'lighting', 'background'].every(k => text(c[k])) ||
    !Array.isArray(c.sceneElements) || c.sceneElements.length > 30 || !c.sceneElements.every(e => text(e))) return null
  const materials: ProjectMaterials = {}, materialRefs: RenderDraft['materialRefs'] = {}
  for (const field of MATERIAL_FIELDS) {
    if (m[field] !== undefined) {
      if (!text(m[field], 4000)) return null
      materials[field] = m[field]
    }
    if (refs[field] !== undefined) {
      if (!text(refs[field], 4000)) return null
      try { if (new URL(refs[field]).protocol !== 'https:') return null } catch { return null }
      materialRefs[field] = refs[field]
    }
  }
  return { ...d, config: c, materials, materialRefs } as unknown as RenderDraft
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('draft-storage-unavailable')); return }
    let expired = false
    const request = indexedDB.open(DATABASE, 1)
    const timeout = setTimeout(() => { expired = true; reject(new Error('draft-storage-timeout')) }, 3000)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'ownerId' })
    request.onerror = () => { clearTimeout(timeout); reject(request.error) }
    request.onsuccess = () => {
      clearTimeout(timeout)
      const db = request.result
      if (expired) { db.close(); return }
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

// Serialize saves/removals in this tab: a pending save cannot resurrect a
// discarded or completed draft. IDB serializes read/write transactions across tabs.
const queues = new Map<string, Promise<unknown>>()
function inOrder<T>(ownerId: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(action)
  queues.set(ownerId, next)
  void next.finally(() => { if (queues.get(ownerId) === next) queues.delete(ownerId) }).catch(() => {})
  return next
}

export function readRenderDraft(ownerId: string): Promise<RenderDraft | null> {
  return inOrder(ownerId, async () => {
    if (!ownerId) return null
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE)
      // Expired local files are purged on the next visit, including accounts
      // that have not returned to this browser themselves.
      const cleanup = store.openCursor()
      cleanup.onsuccess = () => {
        const cursor = cleanup.result
        if (!cursor) return
        if (typeof cursor.value?.updatedAt === 'number' && Date.now() - cursor.value.updatedAt > DRAFT_MAX_AGE) cursor.delete()
        cursor.continue()
      }
      const request = store.get(ownerId)
      let draft: RenderDraft | null = null
      request.onsuccess = () => {
        draft = parseRenderDraft(request.result, ownerId)
        if (request.result && !draft) store.delete(ownerId)
      }
      tx.oncomplete = () => { db.close(); resolve(draft) }
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('draft-read-failed')) }
    })
  })
}

export function saveRenderDraft(draft: RenderDraft): Promise<void> {
  return inOrder(draft.ownerId, async () => {
    const checked = parseRenderDraft(draft, draft.ownerId)
    if (!checked) throw new Error('invalid-draft')
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(checked)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('draft-save-failed')) }
    })
  })
}

export function removeRenderDraft(ownerId: string, expectedId: string): Promise<void> {
  return inOrder(ownerId, async () => {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE)
      const request = store.get(ownerId)
      request.onsuccess = () => { if (request.result?.id === expectedId) store.delete(ownerId) }
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('draft-remove-failed')) }
    })
  })
}
