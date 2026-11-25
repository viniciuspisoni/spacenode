'use client'

// Widget do Cloudflare Turnstile (renderização explícita, sem dependência
// extra). Modo `interaction-only`: na maioria das visitas nada aparece; só
// quem parece automação recebe a caixinha de verificação.
//
// Uso:
//   const captcha = useRef<TurnstileHandle>(null)
//   <TurnstileWidget ref={captcha} />
//   const captchaToken = await captcha.current?.getToken()  // string | undefined
//   ...chamada ao Supabase com options.captchaToken...
//   captcha.current?.reset()                                // token é de uso único
//
// Ver lib/auth/turnstile.ts para o desenho (nunca bloqueia o envio sozinho).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTheme } from '@/lib/theme/ThemeProvider'
import { TURNSTILE_SCRIPT_SRC, TURNSTILE_SITE_KEY, TURNSTILE_WAIT_MS } from '@/lib/auth/turnstile'

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export interface TurnstileHandle {
  /** Token atual; se a verificação ainda estiver rodando, espera um pouco.
   *  undefined = sem token (script bloqueado, erro, tempo esgotado). */
  getToken: () => Promise<string | undefined>
  /** Descarta o token usado e pede um novo. */
  reset: () => void
}

// Mesmo padrão do script do Google na tela de login: uma Promise única; no
// erro remove a tag e libera nova tentativa.
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      script.addEventListener('load', () => resolve(), { once: true })
      script.addEventListener('error', () => {
        scriptPromise = null
        script.remove()
        reject(new Error('turnstile script'))
      }, { once: true })
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

interface TurnstileWidgetProps {
  /** `gap` do flex onde o widget mora: enquanto a caixinha está escondida
   *  (quase sempre), uma margem negativa devolve esse espaço ao layout. */
  gap?: number
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(function TurnstileWidget({ gap = 0 }, ref) {
  const { resolvedTheme } = useTheme()
  // O Cloudflare só mostra a caixinha quando exige interação.
  const [interactive, setInteractive] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | undefined>(undefined)
  // Verdadeiro enquanto o widget existe e não falhou: só então vale esperar.
  const pendingRef = useRef(false)
  const waitersRef = useRef<Array<(token: string | undefined) => void>>([])

  function settle(token: string | undefined) {
    tokenRef.current = token
    const waiters = waitersRef.current
    waitersRef.current = []
    waiters.forEach(resolve => resolve(token))
  }

  useImperativeHandle(ref, () => ({
    getToken() {
      if (tokenRef.current || !pendingRef.current) return Promise.resolve(tokenRef.current)
      return new Promise(resolve => {
        const timer = window.setTimeout(() => {
          waitersRef.current = waitersRef.current.filter(w => w !== done)
          resolve(tokenRef.current)
        }, TURNSTILE_WAIT_MS)
        const done = (token: string | undefined) => {
          window.clearTimeout(timer)
          resolve(token)
        }
        waitersRef.current.push(done)
      })
    },
    reset() {
      tokenRef.current = undefined
      if (widgetIdRef.current && window.turnstile) {
        pendingRef.current = true
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }), [])

  useEffect(() => {
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        const el = containerRef.current
        if (cancelled || !el || !window.turnstile) return
        pendingRef.current = true
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: resolvedTheme,
          size: 'flexible',
          appearance: 'interaction-only',
          language: 'pt-br',
          callback: (token: string) => { pendingRef.current = false; settle(token) },
          // Expirou (300 s): o próprio widget renova; até lá, sem token.
          'expired-callback': () => { pendingRef.current = true; tokenRef.current = undefined },
          'error-callback': () => { pendingRef.current = false; settle(undefined) },
          'before-interactive-callback': () => setInteractive(true),
          'after-interactive-callback': () => setInteractive(false),
        })
      })
      .catch(() => {
        // Script bloqueado/fora do ar: segue sem token (ver lib/auth/turnstile.ts).
        pendingRef.current = false
        settle(undefined)
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = null
      tokenRef.current = undefined
      setInteractive(false)
    }
  }, [resolvedTheme])

  return <div ref={containerRef} style={{ width: '100%', marginTop: interactive ? 0 : -gap }} />
})
