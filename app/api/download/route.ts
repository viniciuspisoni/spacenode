import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import {
  DOWNLOAD_MAX_BYTES,
  DOWNLOAD_MAX_REDIRECTS,
  allowedDownloadUrl,
  safeDownloadContentType,
  safeDownloadFilename,
} from '@/lib/http/download-proxy'

// Proxy de download. Recebe a URL da imagem (CDN do FAL ou Storage do próprio
// projeto — vídeos do Veo/Vertex são re-hospedados lá, ver
// lib/video/adapters/vertexVeoAdapter.ts), busca server-side e devolve com
// Content-Disposition: attachment, forçando o browser a salvar em vez de abrir.
// Resolve o atributo download em <a> ser ignorado pra URLs cross-origin.
//
// Endurecido na auditoria 2026-11-18 (S4) — antes era público, seguia
// redirects sem revalidar, aceitava qualquer path do host Supabase, repassava
// o Content-Type do upstream e bufferizava o arquivo inteiro em memória:
//   • exige sessão (cookie ou Bearer) — todos os links ficam dentro do /app;
//   • allowlist em lib/http/download-proxy.ts, revalidada a cada redirect;
//   • só imagem/vídeo no Content-Type; teto de tamanho; corpo em streaming.

export async function GET(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return new NextResponse('unauthorized', { status: 401 })

  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return new NextResponse('missing url', { status: 400 })

  const first = allowedDownloadUrl(raw)
  if (!first) return new NextResponse('forbidden url', { status: 403 })
  let target: URL = first

  try {
    let upstream: Response | null = null
    for (let hop = 0; hop <= DOWNLOAD_MAX_REDIRECTS; hop++) {
      const res = await fetch(target, { redirect: 'manual', cache: 'no-store' })
      if (res.status < 300 || res.status >= 400) {
        upstream = res
        break
      }
      const location: string | null = res.headers.get('location')
      const next: URL | null = location ? allowedDownloadUrl(new URL(location, target).toString()) : null
      if (!next) return new NextResponse('forbidden redirect', { status: 502 })
      target = next
    }
    if (!upstream) return new NextResponse('too many redirects', { status: 502 })
    if (!upstream.ok || !upstream.body) return new NextResponse('upstream error', { status: 502 })

    const length = Number(upstream.headers.get('content-length') ?? '')
    if (Number.isFinite(length) && length > DOWNLOAD_MAX_BYTES) {
      await upstream.body.cancel()
      return new NextResponse('file too large', { status: 413 })
    }

    const filename = safeDownloadFilename(req.nextUrl.searchParams.get('filename'))
    const headers = new Headers({
      'Content-Type':            safeDownloadContentType(upstream.headers.get('content-type')),
      'Content-Disposition':     `attachment; filename="${filename}"`,
      'Cache-Control':           'private, no-store',
      'X-Content-Type-Options':  'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })
    // fetch descomprime gzip/br sozinho: aí o content-length do upstream é do
    // corpo COMPRIMIDO e repassá-lo truncaria o arquivo.
    const encoding = (upstream.headers.get('content-encoding') ?? 'identity').toLowerCase()
    if (encoding === 'identity' && Number.isFinite(length) && length > 0) {
      headers.set('Content-Length', String(length))
    }

    return new NextResponse(upstream.body, { headers })
  } catch {
    return new NextResponse('fetch failed', { status: 502 })
  }
}
