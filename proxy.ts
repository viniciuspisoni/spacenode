import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { isModuleEnabled } from '@/lib/nav/modules-config'

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // O módulo foi descontinuado. Dados antigos continuam disponíveis para
  // leitura/exclusão, mas nenhuma rota legada pode iniciar novas operações.
  if (
    !isModuleEnabled('spaces') &&
    (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') &&
    (pathname === '/api/spaces' || pathname.startsWith('/api/spaces/') ||
      pathname === '/api/vistas' || pathname.startsWith('/api/vistas/'))
  ) {
    return NextResponse.json(
      { error: 'Spaces e Vistas foram descontinuados.' },
      { status: 410 }
    )
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && (pathname === '/app' || pathname.startsWith('/app/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // URLs antigas do módulo levam ao Dashboard; as rotas de leitura e exclusão
  // dos dados legados permanecem disponíveis na API.
  if (user && !isModuleEnabled('spaces') && (pathname === '/app/spaces' || pathname.startsWith('/app/spaces/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    // Honra ?next= (ex.: /login?next=/sketchup/connect?nonce=X vindo do
    // plugin) — antes o redirect descartava o destino e jogava em /app.
    // Path e query separados: o setter de pathname percent-encodaria o '?'.
    const target = safeNextPath(url.searchParams.get('next'))
    const qIndex = target.indexOf('?')
    url.pathname = qIndex >= 0 ? target.slice(0, qIndex) : target
    url.search = qIndex >= 0 ? target.slice(qIndex) : ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
