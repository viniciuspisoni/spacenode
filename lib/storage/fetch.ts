// lib/storage/fetch.ts
//
// Fetch server-side de imagem que funciona MESMO com bucket privado (B2). Um
// fetch HTTP de URL pública de bucket privado dá 403 — então, quando o flip
// estiver ativo (STORAGE_PRIVATE=1), baixamos os objetos dos NOSSOS buckets via
// storage API (service_role, ignora público/privado). FAL/externas/públicas
// seguem por fetch HTTP normal. INERTE enquanto STORAGE_PRIVATE != '1' (aí é só
// um fetch HTTP, idêntico ao comportamento anterior).
//
// Server-only (importa o admin client / service_role).

import { createAdminClient } from '@/lib/supabase/admin'
import { parseSupabaseStoragePath } from './cleanup'
import { PRIVATE_BUCKETS } from './signed'

function privateStorageActive(): boolean {
  return process.env.STORAGE_PRIVATE === '1'
}

export interface FetchedBytes { buffer: Buffer; contentType: string }

/** Baixa a imagem como bytes + contentType. Se for URL de bucket privado nosso e
 *  o flip estiver ativo, usa storage.download (service_role); senão, fetch HTTP.
 *  Lança em falha (mesma semântica do fetch anterior). */
export async function fetchStorageBytes(url: string, signal?: AbortSignal): Promise<FetchedBytes> {
  if (privateStorageActive()) {
    const parsed = parseSupabaseStoragePath(url)
    if (parsed && PRIVATE_BUCKETS.has(parsed.bucket)) {
      const admin = createAdminClient()
      const { data, error } = await admin.storage.from(parsed.bucket).download(parsed.key)
      if (error || !data) {
        throw new Error(`storage download failed (${parsed.bucket}): ${error?.message ?? 'no data'}`)
      }
      const buffer = Buffer.from(await data.arrayBuffer())
      return { buffer, contentType: data.type || 'application/octet-stream' }
    }
  }
  const res = await fetch(url, signal ? { signal } : undefined)
  if (!res.ok) throw new Error(`fetch image failed (${res.status}) ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' }
}

/** Só os bytes (Buffer) — drop-in pra fetchImageBuffer. */
export async function fetchStorageBuffer(url: string, signal?: AbortSignal): Promise<Buffer> {
  return (await fetchStorageBytes(url, signal)).buffer
}
