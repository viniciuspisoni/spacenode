'use client'

// Visita da landing de campanha registrada PELO BROWSER, além do `lp_view`
// que o servidor já grava no render.
//
// Por que os dois: o `lp_view` do servidor sai da request de HTML, sem o
// cookie sn_aid resolvido — então ele conta visitas, mas não liga a visita
// ao clique e ao cadastro da mesma pessoa. O `landing_view` daqui passa pelo
// coletor first-party, que lê sn_aid e sn_attribution da própria request e
// grava a visita na jornada anônima. É esse join que permite dizer "quem viu
// a LP X e assinou".
//
// Efeito colateral bom: o rastreador de link do Meta não executa JS, então
// este evento não carrega o ruído que domina o `lp_view` do servidor.

import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics/client'

export default function LpViewPing({ slug }: { slug: string }) {
  const fired = useRef(false)

  useEffect(() => {
    // StrictMode monta duas vezes em dev; a visita é uma só.
    if (fired.current) return
    fired.current = true
    track('landing_view', { lp: slug })
  }, [slug])

  return null
}
