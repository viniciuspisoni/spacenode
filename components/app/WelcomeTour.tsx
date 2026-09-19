'use client'

// Tour de boas-vindas do /app — 5 etapas ancoradas no dashboard via [data-tour].
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
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { createClient } from '@/lib/supabase/client'

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

  const markCompleted = useCallback(() => {
    if (!pendingPersistRef.current) return
    pendingPersistRef.current = false
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
      doneBtnText: pendingPersistRef.current ? 'Criar minha primeira imagem' : 'Abrir o Renderizar',
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
          element: '[data-tour="renderizar"]',
          popover: {
            title: 'Comece pelo Renderizar',
            description:
              'Envie um print do SketchUp, uma foto ou uma planta e receba a imagem pronta. É o caminho mais curto do seu modelo à primeira visualização — e, na primeira vez, um guia de três passos acompanha você dentro da ferramenta.',
            side: 'top',
            align: 'start',
          },
        },
        {
          // Âncora no cartão do módulo, não na faixa "Continuar de onde parou":
          // a faixa só existe em conta com Space, e o tour precisa rodar igual
          // no primeiro acesso, quando o dashboard está vazio. É o cartão
          // vizinho ao do Renderizar — a transição é de um passo.
          element: '[data-tour="spaces"]',
          popover: {
            title: 'Depois, o Space',
            description:
              'A partir da segunda vista do mesmo espaço, o Space entra: ele guarda o DNA do projeto para que todas as imagens conversem entre si. Dá para criar um a partir de qualquer render — não precisa decidir isso agora.',
            side: 'top',
            align: 'start',
          },
        },
        {
          element: '[data-tour="criar"]',
          popover: {
            title: 'O resto do atelier',
            description:
              'Com a imagem na mão: Editar ajusta uma área sem mexer no resto e também finaliza e exporta, Ampliar leva à resolução de entrega, Animar transforma em vídeo e a Planta humanizada veste a planta técnica com materiais reais.',
            side: 'top',
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
