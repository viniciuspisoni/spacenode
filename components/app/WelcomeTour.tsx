'use client'

// Tour de boas-vindas do /app — 5 etapas ancoradas no dashboard via [data-tour].
// Abre sozinho no primeiro acesso (profiles.onboarding_completed_at IS NULL) e
// pode ser revisto a qualquer momento pelo "Como usar" da sidebar: já no /app,
// o item dispara o evento `spn:tour:start`; de outras rotas, navega a /app#tour
// e o tour abre ao chegar (pushState não emite hashchange, por isso o evento).
// driver.js (~5 kB, sem dependências); popover tematizado em globals.css
// (.spn-tour) com os tokens semânticos — acompanha os temas claro e escuro.

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/analytics/client'

export const TOUR_START_EVENT = 'spn:tour:start'

const DASHBOARD = '/app'
const NEW_PROJECT_URL = '/app/spaces/new'
const TOUR_HASH = '#tour'

export default function WelcomeTour({ needsOnboarding }: { needsOnboarding: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)
  // Grava no perfil só a primeira conclusão; re-execuções via "Como usar" não escrevem.
  const pendingPersistRef = useRef(needsOnboarding)

  const markCompleted = useCallback(() => {
    if (!pendingPersistRef.current) return
    pendingPersistRef.current = false
    // Funil: onboarding concluído (só a PRIMEIRA conclusão — o guard acima
    // já filtra re-execuções via "Como usar").
    track('onboarding_completed')
    // Fire-and-forget, mesmo modelo do theme_preference (falhar não é fatal:
    // a coluna segue NULL e o tour volta a se oferecer no próximo acesso).
    void (async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase
          .from('profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', user.id)
      } catch {}
    })()
  }, [])

  const startTour = useCallback(() => {
    if (driverRef.current?.isActive()) return
    // Qualquer tour iniciado conta como o auto-start do primeiro acesso —
    // impede reabertura automática com prop ainda desatualizada na sessão.
    autoStartedRef.current = true

    const d = driver({
      popoverClass: 'spn-tour',
      stagePadding: 8,
      stageRadius: 14,
      popoverOffset: 12,
      overlayColor: '#000',
      overlayOpacity: 0.55,
      // Clique no véu não encerra: sair do onboarding é decisão explícita
      // (Pular tour, ×, Esc ou concluir) — evita "perder" o tour por engano.
      overlayClickBehavior: () => {},
      smoothScroll: true,
      disableActiveInteraction: true,
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Avançar',
      prevBtnText: 'Voltar',
      doneBtnText: pendingPersistRef.current ? 'Criar meu primeiro Space' : 'Criar novo Space',
      // "Pular tour" discreto junto aos botões (o popover é reaproveitado entre
      // etapas — daí o dedupe e a remoção na última, onde concluir é o caminho).
      onPopoverRender: (popover, opts) => {
        const existing = popover.footerButtons.querySelector('.spn-tour-skip')
        if (opts.driver.isLastStep()) {
          existing?.remove()
          return
        }
        if (existing) return
        const skip = document.createElement('button')
        skip.type = 'button'
        skip.className = 'spn-tour-skip'
        skip.textContent = 'Pular tour'
        skip.onclick = () => {
          markCompleted()
          opts.driver.destroy()
        }
        popover.footerButtons.insertBefore(skip, popover.footerButtons.firstChild)
      },
      // Qualquer saída (pular, ×, Esc ou concluir) conta como onboarding visto.
      // Pular e concluir também marcam explicitamente (o hook depende do estado
      // interno da lib e não dispara num destroy muito precoce); é idempotente.
      onDestroyed: () => markCompleted(),
      steps: [
        {
          element: '[data-tour="projetos"]',
          popover: {
            title: 'Spaces',
            description:
              'Seus Spaces moram aqui. Cada um reúne as vistas do espaço e preserva o DNA do projeto entre uma geração e outra.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="criar"]',
          popover: {
            title: 'Criar',
            description:
              'As ferramentas do atelier: renderize a partir da sua referência, edite com precisão, amplie a resolução, anime e finalize para entrega. Na primeira imagem, o Renderizar abre um guia que acompanha cada passo.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="apresentar"]',
          popover: {
            title: 'Apresentar',
            description:
              'Prepare o projeto para o cliente — a Planta humanizada, por exemplo, veste a planta técnica com materiais e mobiliário reais.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="historico"]',
          popover: {
            title: 'Histórico',
            description:
              'Nada se perde: tudo o que você gera fica guardado. As criações recentes aparecem aqui; o acervo completo está em Histórico, na barra lateral.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="nodes"]',
          popover: {
            title: 'Saldo de nodes',
            description:
              'Nodes são o combustível das gerações — cada criação consome alguns. Acompanhe o saldo aqui e no anel do seu avatar, na barra lateral.',
            side: 'bottom',
            align: 'start',
            onDoneClick: () => {
              markCompleted()
              d.destroy()
              router.push(NEW_PROJECT_URL)
            },
          },
        },
      ],
    })

    driverRef.current = d
    d.drive()
  }, [markCompleted, router])

  // Abertura: automática no primeiro acesso ao dashboard, ou manual ao chegar
  // em /app#tour (vindo do "Como usar" em outra rota, ou por URL direta).
  useEffect(() => {
    if (pathname !== DASHBOARD) return
    const manual = window.location.hash === TOUR_HASH
    if (manual) {
      // Limpa o hash: refresh não reabre e um novo clique volta a funcionar.
      window.history.replaceState(null, '', DASHBOARD)
    } else if (!needsOnboarding || autoStartedRef.current) {
      return
    }
    if (!manual) autoStartedRef.current = true

    // Espera as âncoras [data-tour] do dashboard estarem no DOM; o primeiro
    // acesso ganha uma pausa maior pra página assentar antes do overlay.
    const timers: number[] = []
    const tryStart = (attempt: number) => {
      if (document.querySelector('[data-tour="projetos"]')) {
        startTour()
      } else if (attempt < 10) {
        timers.push(window.setTimeout(() => tryStart(attempt + 1), 150))
      }
    }
    timers.push(window.setTimeout(() => tryStart(0), manual ? 150 : 700))

    return () => timers.forEach((t) => clearTimeout(t))
  }, [pathname, needsOnboarding, startTour])

  // "Como usar" com o dashboard já aberto: dispara sem navegação.
  useEffect(() => {
    const onStart = () => {
      if (window.location.pathname === DASHBOARD) startTour()
    }
    window.addEventListener(TOUR_START_EVENT, onStart)
    return () => window.removeEventListener(TOUR_START_EVENT, onStart)
  }, [startTour])

  // Saiu do dashboard com o tour aberto (ex.: voltar do navegador) → fecha.
  useEffect(() => {
    if (pathname === DASHBOARD) return
    if (driverRef.current?.isActive()) driverRef.current.destroy()
  }, [pathname])

  // Desmontagem do layout: garante que overlay/popover não fiquem órfãos.
  useEffect(() => () => driverRef.current?.destroy(), [])

  return null
}
