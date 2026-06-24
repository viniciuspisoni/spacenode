// lib/edit-v3/ssrf.ts
//
// Allowlist de origem para fetch server-side de imagens vindas do cliente (SSRF).
// V3 é Google-first e armazena tudo no Storage do Supabase — a origem padrão é o
// host do próprio Supabase. O CDN da FAL (*.fal.media) só é permitido quando o
// fallback FAL está ligado (imagens de histórico/legado). Próprio do V3 (não
// reusa o assertSafeImageUrl do v2, que carrega fal.media legado por padrão).

import { editV3FalFallbackEnabled } from './flags'

export class EditV3InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditV3InputError'
  }
}

function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Valida que a URL é segura para fetch server-side. Lança EditV3InputError. */
export function assertSafeImageUrl(url: string): void {
  if (url.startsWith('data:image/')) return // providers devolvem data: URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new EditV3InputError('URL de imagem inválida.')
  }
  if (parsed.protocol !== 'https:') {
    throw new EditV3InputError('Apenas URLs https são aceitas.')
  }
  const host = parsed.hostname.toLowerCase()
  const sb = supabaseHost()
  const falAllowed = editV3FalFallbackEnabled() && (host === 'fal.media' || host.endsWith('.fal.media'))
  if ((sb && host === sb) || falAllowed) return
  throw new EditV3InputError('Origem de imagem não permitida.')
}
