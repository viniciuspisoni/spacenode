import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { trackServerEvent } from '@/lib/analytics/server'

// Proxy de download. Recebe a URL da imagem (CDN do FAL), busca server-side
// e devolve com header Content-Disposition: attachment, forçando o browser a
// salvar em vez de abrir. Resolve o problema de o atributo download em <a>
// ser ignorado pra URLs cross-origin sem CORS.
//
// Restrito a hosts confiáveis por segurança — sem isso vira open proxy:
// CDNs da fal + o Storage do próprio projeto (vídeos do Veo/Vertex são
// re-hospedados lá — ver lib/video/adapters/vertexVeoAdapter.ts).
//
// É também o ponto ÚNICO de result_downloaded de quase todo o produto (todas
// as superfícies baixam por aqui; a exceção é o Editar V3, que baixa via blob
// e rastreia no client). O evento roda em after() — zero latência somada ao
// download — e o módulo de origem sai do prefixo do filename.

const ALLOWED_HOSTS = ['fal.media', 'v2.fal.media', 'v3.fal.media']

function supabaseHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host
  } catch {
    return null
  }
}

/** Módulo de origem inferido do padrão de filename usado pelas superfícies
 *  (spacenode-animacao.mp4, spacenode-isometrica.jpg, …). Best-effort. */
function featureFromFilename(name: string): string | null {
  const m = name.toLowerCase().match(/^spacenode[-_]([a-z]+)/)
  if (!m) return null
  const slug = m[1]
  if (slug === 'animacao') return 'animar'
  if (slug === 'isometrica' || slug === 'planta' || slug === 'prancha' || slug === 'moodboard') return 'apresentar'
  if (slug === 'editar') return 'editar'
  if (slug === 'ampliado' || slug === 'upscale') return 'ampliar'
  if (slug === 'render') return 'renderizar'
  return slug.slice(0, 20)
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

    // Funil: download efetivo = resultado entregue ao usuário. after() roda
    // depois da resposta — não soma latência; falha aqui nunca afeta o download.
    after(async () => {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const feature = featureFromFilename(safeName)
      await trackServerEvent(createAdminClient(), {
        event: 'result_downloaded',
        userId: user?.id ?? null,
        req,
        page: '/api/download',
        props: {
          filename: safeName,
          ...(feature ? { feature } : {}),
        },
      })
    })

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
