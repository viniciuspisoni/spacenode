/** A short-lived, account-bound transfer of the original image. URLs contain only an opaque ID. */
export const EDIT_HANDOFF_MAX_AGE = 30 * 60_000
export const EDIT_HANDOFF_MAX_BYTES = 10 * 1024 * 1024
const DATABASE = 'spn-edit-handoffs'
const STORE = 'handoffs'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EditHandoff {
  version: 1
  id: string
  ownerId: string
  createdAt: number
  image: Blob
  filename: string
  intention: string
}

export function editHandoffIntention(turns: { role: string; text: string }[], draft: string): string {
  const intention = [...turns.filter(t => t.role === 'user').map(t => t.text), draft].map(t => t.trim()).filter(Boolean).join('\n\n')
  if (intention.length > 4000) throw new Error('O histórico ficou longo. Use “Recomeçar comparação” e escreva um resumo do ajuste antes de continuar.')
  return intention
}

export function parseEditHandoff(value: unknown, ownerId: string, id: string, now = Date.now()): EditHandoff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Record<string, unknown>
  if (!UUID.test(id) || !UUID.test(ownerId) || d.id !== id || d.ownerId !== ownerId || d.version !== 1 ||
    typeof d.createdAt !== 'number' || !Number.isFinite(d.createdAt) || d.createdAt > now + 60_000 || now - d.createdAt > EDIT_HANDOFF_MAX_AGE ||
    !(d.image instanceof Blob) || !d.image.size || d.image.size > EDIT_HANDOFF_MAX_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(d.image.type) ||
    typeof d.filename !== 'string' || d.filename.length > 200 || typeof d.intention !== 'string' || d.intention.length > 4000) return null
  return d as unknown as EditHandoff
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Não foi possível guardar a imagem neste navegador.')); return }
    let expired = false
    const request = indexedDB.open(DATABASE, 1)
    const timeout = setTimeout(() => { expired = true; reject(new Error('O armazenamento do navegador não respondeu. Tente novamente.')) }, 3000)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível guardar a imagem neste navegador.')) }
    request.onsuccess = () => {
      clearTimeout(timeout)
      const db = request.result
      if (expired) { db.close(); return }
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

async function transact<T>(action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    let value: T
    const timer = setTimeout(() => tx.abort(), 8000)
    tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(value) }
    tx.onabort = tx.onerror = () => { clearTimeout(timer); db.close(); reject(new Error('Não foi possível transferir a imagem. Sua referência continua em Renderizar.')) }
    const store = tx.objectStore(STORE)
    const cursor = store.openCursor()
    cursor.onsuccess = () => {
      const c = cursor.result
      if (!c) return
      if (!c.value || typeof c.value.createdAt !== 'number' || Date.now() - c.value.createdAt > EDIT_HANDOFF_MAX_AGE) c.delete()
      c.continue()
    }
    action(store, next => { value = next })
  })
}

export async function saveEditHandoff(ownerId: string, file: File, intention: string): Promise<string> {
  if (file.size > EDIT_HANDOFF_MAX_BYTES) throw new Error('Editar aceita imagens de até 10 MB. Prepare uma referência menor antes de continuar.')
  const id = crypto.randomUUID()
  const handoff: EditHandoff = { version: 1, id, ownerId, createdAt: Date.now(), image: file, filename: file.name.slice(0, 200), intention: intention.trim() }
  if (!parseEditHandoff(handoff, ownerId, id)) throw new Error('Não foi possível preparar a transferência. Use JPG, PNG ou WebP e tente novamente.')
  return transact<string>((store, result) => { store.put(handoff); result(id) })
}

export async function readEditHandoff(ownerId: string, id: string): Promise<EditHandoff | null> {
  if (!UUID.test(ownerId) || !UUID.test(id)) return null
  return transact<EditHandoff | null>((store, result) => {
    const request = store.get(id)
    request.onsuccess = () => result(parseEditHandoff(request.result, ownerId, id))
  })
}
