'use client'

// Leitura reativa da escolha de consentimento (cookie sn_consent) para os
// componentes que injetam ou disparam terceiros.
//
// useSyncExternalStore porque a fonte da verdade é externa ao React (cookie) e
// muda por um evento de window. O snapshot do SERVIDOR é sempre `null`: no SSR
// não há cookie do visitante, então nada de terceiro é renderizado no HTML
// inicial e a hidratação bate. O script só entra depois que o cliente monta e
// confirma a categoria.
//
// Dois níveis de leitura, de propósito:
//   • useConsentState() — o estado por categoria, para o aviso de consentimento;
//   • useMarketingConsent() — a pergunta binária "pode marketing?", que é tudo
//     o que GoogleTag/MetaPixel/SignupConversionPing precisam saber. Mantida
//     com a mesma forma de antes ('granted' | 'denied' | null) para que a
//     entrada de categorias não mexa em quem só consulta o gate.

import { useSyncExternalStore } from 'react'
import {
  readConsentState,
  subscribeConsent,
  type ConsentChoice,
  type ConsentState,
} from '@/lib/analytics/consent'

/** Estado por categoria. `null` = o visitante ainda não escolheu. */
export function useConsentState(): ConsentState | null {
  return useSyncExternalStore(subscribeConsent, readConsentState, () => null)
}

/** `null` enquanto não há escolha; depois, a decisão sobre marketing. */
export function useMarketingConsent(): ConsentChoice | null {
  const state = useConsentState()
  if (state === null) return null
  return state.marketing ? 'granted' : 'denied'
}
