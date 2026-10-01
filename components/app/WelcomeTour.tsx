'use client'

// Tour de boas-vindas do /app — orientação curta até a primeira imagem.
// Abre sozinho no primeiro acesso (profiles.onboarding_completed_at IS NULL) e
// pode ser revisto a qualquer momento pelo "Como usar" da sidebar: já no /app,
// o item dispara o evento `spn:tour:start`; de outras rotas, navega a /app#tour
// e o tour abre ao chegar (pushState não emite hashchange, por isso o evento).
// driver.js (~5 kB, sem dependências); popover tematizado em globals.css
// (.spn-tour) no material de vidro — acompanha os temas claro e escuro.
//
// A ordem das etapas é a narrativa do produto, não a da página: o Renderizar
// abre o tour e fecha o CTA. Ele é a ferramenta mais forte e a única que leva
// alguém de um print do SketchUp à primeira imagem sem decisão nenhuma no
// caminho — o Space vem logo atrás, como o que acontece quando o projeto passa
// a ter mais de uma vista pra manter coerente. Até 09/26 o tour começava pelos
// Spaces e terminava mandando criar um: pedia ao recém-chegado a decisão mais
// cara antes de ele ter visto uma imagem sair. O Space não perdeu espaço na
// virada — perdeu a posição de pedágio.

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { driver, type Driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { createClient } from '@/lib/supabase/client'
import { isModuleEnabled } from '@/lib/nav/modules-config'
import { track } from '@/lib/analytics/client'

export const TOUR_START_EVENT = 'spn:tour:start'

const DASHBOARD = '/app'
const GENERATE_URL = '/app/generate'
const TOUR_HASH = '#tour'

export default function WelcomeTour({ needsOnboarding }: { needsOnboarding: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const driverRef = useRef<Driver | null>(null)
  const autoStartedRef = useRef(false)
  // Grava no perfil só a primeira conclusão; re-execuções via "Como usar" não escrevem.
  const pendingPersistRef = useRef(needsOnboarding)

  const markCompleted = useCallback((outcome: 'dismissed' | 'skipped' | 'started_render' = 'dismissed') => {
    if (!pendingPersistRef.current) return
    pendingPersistRef.current = false
    track('onboarding_completed', { surface: 'dashboard_tour', outcome })
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
    track('cta_clicked', { cta: 'onboarding_tour_started' })

    // Spaces desativado temporariamente (ver lib/nav/modules-config.ts) —
    // sem o módulo enabled não existe [data-tour="spaces"] no DOM, então a
    // etapa some da lista em vez de travar o tour numa âncora inexistente.
    const spacesStep: DriveStep | null = isModuleEnabled('spaces') ? {
      // Âncora no cartão do módulo, não na faixa "Continuar de onde parou":
      // a faixa só existe em conta com Space, e o tour precisa rodar igual
      // no primeiro acesso, quando o dashboard está vazio. É o cartão
      // vizinho ao do Renderizar — a transição é de um passo.
      element: '[data-tour="spaces"]',
      popover: {
        title: 'Depois, o Space',
        description: 'Quando o projeto tiver mais vistas, reúna as imagens em um Space para manter a linguagem visual coerente.',
        side: 'top',
        align: 'start',
      },
    } : null

    const d = driver({
      popoverClass: 'spn-tour',
      stagePadding: 8,
      stageRadius: 14,
      popoverOffset: 12,
      // Véu mais leve que o padrão da lib: o popover é de vidro e precisa ter
      // o que borrar atrás dele — véu fechado demais e o material some.
      overlayColor: '#000',
      overlayOpacity: 0.48,
      // Clique no véu não encerra: sair do onboarding é decisão explícita
      // (Pular tour, ×, Esc ou concluir) — evita "perder" o tour por engano.
      overlayClickBehavior: () => {},
      smoothScroll: true,
      disableActiveInteraction: true,
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Avançar',
      prevBtnText: 'Voltar',
      doneBtnText: 'Criar minha primeira imagem',
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
          markCompleted('skipped')
          track('cta_clicked', { cta: 'onboarding_tour_skipped' })
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
          element: '[data-tour="renderizar"]',
          popover: {
            title: 'Comece pelo Renderizar',
            description:
              'Envie um print do SketchUp, render básico ou foto do projeto. A primeira visualização começa por aqui.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="criar"]',
          popover: {
            title: 'Continue na mesma imagem',
            description:
              'Depois da render, ajuste detalhes no Editar, finalize para entrega, amplie ou anime. Escolha o próximo passo quando vir o resultado.',
            side: 'top',
            align: 'start',
          },
        },
        ...(spacesStep ? [spacesStep] : []),
        {
          element: '[data-tour="renderizar"]',
          popover: {
            title: 'Seu primeiro projeto começa aqui',
            description: 'No Renderizar, envie a referência e ajuste apenas o que quiser mudar. A geometria do projeto orienta o resultado.',
            side: 'top',
            align: 'start',
            onDoneClick: () => {
              track('cta_clicked', { cta: 'onboarding_first_render' })
              markCompleted('started_render')
              d.destroy()
              router.push(GENERATE_URL)
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
    // A âncora esperada é a da PRIMEIRA etapa (o cartão do Renderizar): ela
    // vem da lista de módulos, que é a mesma em conta nova e conta antiga.
    const timers: number[] = []
    const tryStart = (attempt: number) => {
      if (document.querySelector('[data-tour="renderizar"]')) {
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
