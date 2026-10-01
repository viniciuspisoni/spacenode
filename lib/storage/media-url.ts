// lib/storage/media-url.ts
//
// CLIENT-SAFE (sem nenhum import de server): converte uma URL pública do Storage
// no proxy /api/media (que autentica + assina) para imagens buscadas DIRETO no
// browser. Alguns client components fazem `supabase.from(...).select()` e
// renderizam `<img src={row.image_url}>` — nesses casos não há emissão
// server-side pra assinar (signStorageUrl), então o proxy é a saída.
//
// Os buckets antigos dependem de NEXT_PUBLIC_STORAGE_PRIVATE. spacenode-media
// já é privado desde a criação e sempre passa pelo proxy.

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
 *  direto. Para os buckets antigos, é NO-OP até o flip global. */
export function toMediaProxyUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null
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
  if (!active() && bucket !== 'spacenode-media') return url
  return `/api/media?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`
}
