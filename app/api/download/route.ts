import { NextRequest, NextResponse } from 'next/server'

// Proxy de download. Recebe a URL da imagem (CDN do FAL), busca server-side
// e devolve com header Content-Disposition: attachment, forçando o browser a
// salvar em vez de abrir. Resolve o problema de o atributo download em <a>
// ser ignorado pra URLs cross-origin sem CORS.
//
// Restrito a hosts confiáveis por segurança — sem isso vira open proxy:
// CDNs da fal + o Storage do próprio projeto (vídeos do Veo/Vertex são
// re-hospedados lá — ver lib/video/adapters/vertexVeoAdapter.ts).

const ALLOWED_HOSTS = ['fal.media', 'v2.fal.media', 'v3.fal.media']

function supabaseHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url      = req.nextUrl.searchParams.get('url')
  const filename = req.nextUrl.searchParams.get('filename') ?? 'spacenode-render.jpg'

  if (!url) {
    return new NextResponse('missing url', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse('invalid url', { status: 400 })
  }

  const allowedHosts = [...ALLOWED_HOSTS]
  const sbHost = supabaseHost()
  if (sbHost) allowedHosts.push(sbHost)

  if (!allowedHosts.some(h => parsed.host === h || parsed.host.endsWith(`.${h}`))) {
    return new NextResponse('forbidden host', { status: 403 })
  }

  try {
    const upstream = await fetch(parsed.toString())
    if (!upstream.ok) {
      return new NextResponse('upstream error', { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
    const buffer      = await upstream.arrayBuffer()

    // Sanitiza filename pra evitar header injection
    const safeName = filename.replace(/[^\w.\-]/g, '_').slice(0, 120)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch {
    return new NextResponse('fetch failed', { status: 500 })
  }
}
