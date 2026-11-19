// lib/http/download-proxy.ts
//
// Regras do proxy de download (/api/download), isoladas pra teste. O proxy
// busca server-side uma mídia nossa e devolve com Content-Disposition:
// attachment. Sem estas regras ele vira open proxy / SSRF (auditoria
// 2026-11-18, S4):
//   • só HTTPS, porta padrão, sem credenciais na URL;
//   • só o CDN da FAL ou o STORAGE do próprio projeto Supabase (o resto do
//     host — /auth, /rest, /functions — fica de fora);
//   • o Content-Type devolvido é só imagem/vídeo; qualquer outro vira
//     application/octet-stream (nunca text/html servido da nossa origem).

const FAL_MEDIA_HOST = 'fal.media'
const SUPABASE_STORAGE_PREFIX = '/storage/v1/object/'

/** Teto do arquivo baixado pelo proxy. Cobre o maior bucket de mídia
 *  (spacenode-media, 200 MB) com folga. */
export const DOWNLOAD_MAX_BYTES = 250 * 1024 * 1024

/** Redirects seguidos no máximo (cada um revalidado pela allowlist). */
export const DOWNLOAD_MAX_REDIRECTS = 3

function supabaseHostFromEnv(): string | null {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

/** URL parseada se puder ser baixada pelo proxy; null caso contrário. */
export function allowedDownloadUrl(
  raw: string,
  supabaseHost: string | null = supabaseHostFromEnv(),
): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (u.port !== '' || u.username !== '' || u.password !== '') return null

  const host = u.hostname.toLowerCase()
  if (host === FAL_MEDIA_HOST || host.endsWith(`.${FAL_MEDIA_HOST}`)) return u
  if (supabaseHost && host === supabaseHost && u.pathname.startsWith(SUPABASE_STORAGE_PREFIX)) {
    // Path já normalizado pelo parser WHATWG ('..' resolvido); o prefixo
    // continua valendo depois da normalização.
    return u
  }
  return null
}

/** Content-Type seguro para devolver da nossa origem. */
export function safeDownloadContentType(upstream: string | null): string {
  const type = (upstream ?? '').split(';')[0].trim().toLowerCase()
  if (/^(image|video)\/[a-z0-9.+-]+$/.test(type) && type !== 'image/svg+xml') return type
  return 'application/octet-stream'
}

/** Nome de arquivo sem caracteres que quebrem o header. */
export function safeDownloadFilename(raw: string | null): string {
  const name = (raw ?? '').replace(/[^\w.\-]/g, '_').slice(0, 120)
  return name.replace(/^\.+/, '') || 'spacenode-render.jpg'
}
