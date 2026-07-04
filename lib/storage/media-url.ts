// lib/storage/media-url.ts
//
// CLIENT-SAFE (sem nenhum import de server): converte uma URL pública do Storage
// no proxy /api/media (que autentica + assina) para imagens buscadas DIRETO no
// browser. Alguns client components fazem `supabase.from(...).select()` e
// renderizam `<img src={row.image_url}>` — nesses casos não há emissão
// server-side pra assinar (signStorageUrl), então o proxy é a saída.
//
// Gated por NEXT_PUBLIC_STORAGE_PRIVATE: enquanto != '1' é NO-OP (devolve a URL
// pública, que funciona). Setar '1' no MESMO passo do flip — junto da env server
// STORAGE_PRIVATE=1 e da migration de privatização.

const PUBLIC_MARKER = '/storage/v1/object/public/'
const PRIVATE_BUCKETS = new Set(['space-mestres', 'architect-identity', 'spacenode-media'])

function active(): boolean {
  return process.env.NEXT_PUBLIC_STORAGE_PRIVATE === '1'
}

function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host.toLowerCase()
  } catch {
    return ''
  }
}

/** URL pública de bucket privado → `/api/media` (proxy autenticado que redireciona
 *  pra signed URL). FAL/externas/públicas e qualquer coisa fora do padrão passam
 *  direto. NO-OP enquanto NEXT_PUBLIC_STORAGE_PRIVATE != '1'. */
export function toMediaProxyUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null
  if (!active()) return url
  let u: URL
  try { u = new URL(url) } catch { return url }
  if (u.host.toLowerCase() !== supabaseHost()) return url
  const i = u.pathname.indexOf(PUBLIC_MARKER)
  if (i === -1) return url
  const rest = decodeURIComponent(u.pathname.slice(i + PUBLIC_MARKER.length))
  const slash = rest.indexOf('/')
  if (slash < 1) return url
  const bucket = rest.slice(0, slash)
  const key = rest.slice(slash + 1)
  if (!PRIVATE_BUCKETS.has(bucket)) return url
  return `/api/media?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`
}
