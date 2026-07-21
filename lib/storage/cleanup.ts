// lib/storage/cleanup.ts
//
// Higiene de storage (Fase B / AL-4 da auditoria 2026-07-03): remove arquivos
// órfãos do Supabase Storage quando o dono é excluído. Best-effort e defensivo:
//   • só toca URLs do Storage DO PRÓPRIO projeto (deriva o host de
//     NEXT_PUBLIC_SUPABASE_URL) — URLs da FAL/externas são ignoradas;
//   • só remove chaves sob o prefixo do próprio usuário (`${userId}/…`),
//     nunca arquivo de outro usuário;
//   • falha de remoção NUNCA lança — apenas loga (a exclusão do DB é a
//     autoridade; o arquivo órfão é reprocessável).

import type { SupabaseClient } from '@supabase/supabase-js'

const PUBLIC_MARKER = '/storage/v1/object/public/'

function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host.toLowerCase()
  } catch {
    return ''
  }
}

/** Deriva { bucket, key } de uma URL pública do Storage DO PRÓPRIO projeto,
 *  ou de uma URL RELATIVA do proxy de mídia (`/api/media?bucket=…&key=…`) —
 *  forma persistida nos documents do Finalizar para round-trip estável.
 *  Retorna null para URLs de outros hosts (FAL, externas) ou fora do padrão. */
export function parseSupabaseStoragePath(url: string): { bucket: string; key: string } | null {
  // Proxy de mídia relativo (persistido em documents após o flip de privacidade).
  if (url.startsWith('/api/media?')) {
    try {
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
      const bucket = params.get('bucket')
      const key = params.get('key')
      if (bucket && key) return { bucket, key }
    } catch { /* segue para o parse absoluto */ }
    return null
  }
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = supabaseHost()
  if (!host || u.host.toLowerCase() !== host) return null
  const i = u.pathname.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  const rest = decodeURIComponent(u.pathname.slice(i + PUBLIC_MARKER.length))
  const slash = rest.indexOf('/')
  if (slash < 1) return null
  const bucket = rest.slice(0, slash)
  const key = rest.slice(slash + 1)
  if (!bucket || !key) return null
  return { bucket, key }
}

/** Coleta recursivamente todas as URLs de um valor jsonb (o `document` do
 *  Finalizar, etc.) — http(s) absolutas e as relativas do proxy de mídia. */
export function collectUrls(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/api/media?')) out.push(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectUrls(v, out)
  }
  return out
}

/** Remove os arquivos das `urls` que pertencem ao usuário. `keyPrefix` restringe
 *  o namespace (ex.: `${userId}/finalizar/` pra NÃO apagar assets reaproveitados
 *  de outra feature). Best-effort: loga falhas, não lança. */
export async function removeOwnedStorageObjects(
  admin: SupabaseClient,
  urls: Array<string | null | undefined>,
  opts: { userId: string; keyPrefix?: string },
): Promise<void> {
  const prefix = opts.keyPrefix ?? `${opts.userId}/`
  const byBucket = new Map<string, Set<string>>()
  for (const url of urls) {
    if (!url) continue
    const parsed = parseSupabaseStoragePath(url)
    if (!parsed) continue
    if (!parsed.key.startsWith(prefix)) continue
    const set = byBucket.get(parsed.bucket) ?? new Set<string>()
    set.add(parsed.key)
    byBucket.set(parsed.bucket, set)
  }
  for (const [bucket, keys] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove([...keys])
    if (error) {
      console.error(`[storage-cleanup] remove falhou (${bucket}, ${keys.size} chaves):`, error.message)
    }
  }
}

/** Lista recursivamente todas as chaves sob `prefix` num bucket (o Storage lista
 *  só filhos imediatos; pastas têm id null; pagina de 1000 em 1000). */
async function listAllKeys(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  const stack: string[] = [prefix]
  while (stack.length) {
    const dir = stack.pop() as string
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset })
      if (error) {
        console.error(`[storage-cleanup] list falhou (${bucket}/${dir}):`, error.message)
        break
      }
      const items = data ?? []
      for (const item of items) {
        const full = `${dir}/${item.name}`
        if (!item.id) stack.push(full)   // subpasta (id null)
        else keys.push(full)             // arquivo
      }
      if (items.length < 1000) break
      offset += 1000
    }
  }
  return keys
}

/** Remove TODOS os arquivos do usuário (prefixo `${userId}/`) nos buckets dados.
 *  Usado na exclusão de conta (LGPD). Best-effort: loga falhas, não lança. */
export async function removeUserStoragePrefix(
  admin: SupabaseClient,
  userId: string,
  buckets: string[],
): Promise<void> {
  for (const bucket of buckets) {
    const keys = await listAllKeys(admin, bucket, userId)
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000)
      const { error } = await admin.storage.from(bucket).remove(batch)
      if (error) {
        console.error(`[storage-cleanup] prefix remove falhou (${bucket}, lote ${i}):`, error.message)
      }
    }
  }
}
