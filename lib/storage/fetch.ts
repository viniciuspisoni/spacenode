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

// ── SSRF allowlist (AL-1) ────────────────────────────────────────────────────
// As rotas de edição/visão aceitam URL de imagem do cliente e o servidor a
// busca. Sem allowlist, um usuário poderia apontar pra rede interna ou pro
// endpoint de metadados de nuvem. Só permitimos: data:image, o Storage do
// próprio projeto (Supabase) e o CDN da FAL — que é de onde vêm todas as
// imagens legítimas (uploads, renders, vistas, edições).
const ALLOWED_FETCH_HOSTS = ['fal.media', 'v2.fal.media', 'v3.fal.media', 'fal.run']

function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host.toLowerCase()
  } catch {
    return ''
  }
}

export class UnsafeFetchUrlError extends Error {
  readonly isUnsafeFetchUrl = true
  constructor(detail: string) {
    super(`unsafe fetch url: ${detail}`)
    this.name = 'UnsafeFetchUrlError'
  }
}

/** Valida que a URL é segura pra fetch server-side (allowlist). Lança
 *  UnsafeFetchUrlError. Exportada pras rotas validarem CEDO (400) se quiserem. */
export function assertSafeFetchUrl(url: string): void {
  if (url.startsWith('data:image/')) return
  let u: URL
  try { u = new URL(url) } catch { throw new UnsafeFetchUrlError('URL inválida') }
  if (u.protocol !== 'https:') throw new UnsafeFetchUrlError(`protocolo ${u.protocol}`)
  const host = u.host.toLowerCase()
  const sb = supabaseHost()
  if (sb && host === sb) return
  if (ALLOWED_FETCH_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return
  throw new UnsafeFetchUrlError(`host não permitido (${host})`)
}

export interface FetchedBytes { buffer: Buffer; contentType: string }

/** Baixa a imagem como bytes + contentType. Se for URL de bucket privado nosso e
 *  o flip estiver ativo, usa storage.download (service_role); senão, fetch HTTP.
 *  Lança em falha (mesma semântica do fetch anterior). */
export async function fetchStorageBytes(url: string, signal?: AbortSignal): Promise<FetchedBytes> {
  // Choke-point SSRF: bloqueia qualquer host fora da allowlist ANTES de buscar.
  assertSafeFetchUrl(url)
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
