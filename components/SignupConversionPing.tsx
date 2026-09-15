'use client'

// Dispara as conversões de cadastro quando a URL chega com ?signup=1 (setado
// por app/auth/callback pra usuários novos) e depois limpa o parâmetro —
// refresh da página não deve disparar de novo.
//
// Dois destinos, um único gatilho:
//   • Google Ads — conversão de cadastro (lib/gtag.ts). Inerte sem
//     NEXT_PUBLIC_GADS_SIGNUP_LABEL.
//   • Meta Pixel — CompleteRegistration (lib/analytics/adapters/meta-pixel).
//     Inerte sem NEXT_PUBLIC_META_PIXEL_ID e sem o gate de consentimento.
//
// Sem CAPI: o cadastro é confirmado no servidor, mas o browser volta pra cá
// com ?signup=1 logo depois, então o mesmo fato vira evento client-side sem
// precisar de token de servidor. Um disparo por cadastro em cada plataforma.
//
// A corrida importa: gtag.js e fbevents.js carregam com strategy
// "afterInteractive" e este efeito pode rodar antes deles. Sem espera, a
// conversão do cadastro — justamente o evento que queremos medir — sumia em
// silêncio. whenReady faz uma espera curta e limitada pelo global aparecer.

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { reportSignupConversion } from '@/lib/gtag'
import { metaPixelTrack } from '@/lib/analytics/adapters/meta-pixel'
import { useMarketingConsent } from '@/components/analytics/useMarketingConsent'

const READY_TIMEOUT_MS = 5000
const READY_POLL_MS = 100

/** Chama `run` assim que `window[name]` virar função, desistindo em silêncio
 *  depois de READY_TIMEOUT_MS. Devolve o cancelador pro cleanup do efeito. */
function whenReady(name: 'gtag' | 'fbq', run: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  if (typeof (window as unknown as Record<string, unknown>)[name] === 'function') {
    run()
    return () => {}
  }

  const deadline = Date.now() + READY_TIMEOUT_MS
  const timer = setInterval(() => {
    if (typeof (window as unknown as Record<string, unknown>)[name] === 'function') {
      clearInterval(timer)
      run()
    } else if (Date.now() > deadline) {
      clearInterval(timer)
    }
  }, READY_POLL_MS)

  return () => clearInterval(timer)
}

export default function SignupConversionPing() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isSignup = searchParams.get('signup') === '1'
  const consent = useMarketingConsent()

  useEffect(() => {
    if (!isSignup) return

    // `null` = escolha ainda desconhecida (antes da hidratação ler o cookie, ou
    // banner ainda aberto). NÃO limpar o parâmetro aqui: se limpasse, `isSignup`
    // viraria false e a conversão sumiria quando a escolha chegasse depois.
    if (consent === null) return

    // Recusou: nenhum script de terceiro carrega, não há o que esperar —
    // limpa o parâmetro e sai.
    if (consent !== 'granted') {
      const clean = new URLSearchParams(searchParams.toString())
      clean.delete('signup')
      const cleanQuery = clean.toString()
      router.replace(cleanQuery ? `?${cleanQuery}` : window.location.pathname)
      return
    }

    const cancelGoogle = whenReady('gtag', reportSignupConversion)
    const cancelMeta = whenReady('fbq', () => metaPixelTrack('signup_completed', {}))

    const params = new URLSearchParams(searchParams.toString())
    params.delete('signup')
    const query = params.toString()
    router.replace(query ? `?${query}` : window.location.pathname)

    return () => {
      cancelGoogle()
      cancelMeta()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignup, consent])

  return null
}
