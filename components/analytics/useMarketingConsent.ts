'use client'

// Leitura reativa da escolha de consentimento (cookie sn_consent) para os
// componentes que injetam ou disparam terceiros.
//
// useSyncExternalStore porque a fonte da verdade é externa ao React (cookie) e
// muda por um evento de window. O snapshot do SERVIDOR é sempre `null`: no SSR
// não há cookie do visitante, então nada de terceiro é renderizado no HTML
// inicial e a hidratação bate. O script só entra depois que o cliente monta e
// confirma 'granted'.

import { useSyncExternalStore } from 'react'
import { readConsentChoice, subscribeConsent, type ConsentChoice } from '@/lib/analytics/consent'

export function useMarketingConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribeConsent, readConsentChoice, () => null)
}
