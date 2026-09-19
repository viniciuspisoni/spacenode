'use client'

// Aviso de consentimento em DUAS CAMADAS. Aparece só enquanto o visitante não
// escolheu; some assim que escolhe, e a escolha persiste 180 dias no cookie
// sn_consent (lib/analytics/consent.ts).
//
//   1ª camada — a pergunta genérica, sem citar fornecedor nenhum, com as três
//      saídas: "Minhas opções", "Recusar opcionais" e "Aceitar todos".
//   2ª camada — as três categorias, cada uma com uma frase de gente e os NOMES
//      dos serviços que estão de fato ativos naquele build. A lista é derivada
//      da configuração de verdade (env vars + o ID fixo do Google Ads), não de
//      um texto solto: se um pixel não está configurado, ele não é anunciado.
//
// O QUE NÃO ENTRA AQUI (2026-09-19): nome de cookie (sn_aid, sn_consent…), ID
// de medição (AW-…, G-…) e a lista completa de finalidades. Isso é detalhe
// técnico e mora na cláusula 7 de /privacidade, que o link acima abre — o
// painel é para DECIDIR, não para documentar.
//
// Continua não sendo uma CMP: três categorias, duas delas opcionais, sem
// vendor list negociável e sem TCF. Os "Necessários" não têm interruptor
// porque não há terceiro ali — é sessão, preferência de interface e os cookies
// first-party de atribuição.
//
// Não bloqueia a página, de propósito: é aviso, não modal.
//
// Estilo em .spn-consent* (globals.css) e não em utilitário do Tailwind: o
// reset `*` não-layered do globals zera padding das utilities no Tailwind v4.

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { GA4_ID } from '@/lib/analytics/adapters/ga4'
import { META_PIXEL_ID } from '@/lib/analytics/adapters/meta-pixel'
import {
  CONSENT_ALL,
  CONSENT_NONE,
  writeConsentState,
  type ConsentCategory,
  type ConsentState,
} from '@/lib/analytics/consent'
import { useConsentState } from './useMarketingConsent'

interface CategorySpec {
  /** `null` = necessários, que não têm interruptor. */
  key: ConsentCategory | null
  title: string
  description: string
  /** Só os NOMES dos serviços ativos. Vazio = nada de terceiro nesta categoria. */
  services: string[]
}

// Serviços REAIS, derivados de quem de fato carrega:
//   • Google Ads — ID fixo em lib/gtag.ts, injetado por components/GoogleTag.tsx
//     (só em produção; em dev a tag não carrega, mas o serviço do produto
//     continua sendo esse);
//   • Google Analytics e Meta — só existem com a env var presente no build, que
//     é a mesma trava dos adapters.
const CATEGORIES: CategorySpec[] = [
  {
    key: null,
    title: 'Necessários',
    description: 'Mantêm o login, a sessão, as preferências e o funcionamento básico da SpaceNode.',
    services: ['SpaceNode'],
  },
  {
    key: 'analytics',
    title: 'Análise e desempenho',
    description: 'Ajudam a entender como a plataforma é usada e melhorar sua estabilidade.',
    services: GA4_ID ? ['Google Analytics'] : [],
  },
  {
    key: 'marketing',
    title: 'Marketing e atribuição',
    description: 'Ajudam a medir campanhas e entender a origem dos cadastros.',
    services: ['Google Ads', ...(META_PIXEL_ID ? ['Meta'] : [])],
  },
]

export default function ConsentBanner() {
  const saved = useConsentState()
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Opt-in: nada vem pré-marcado. Só vira `true` por ação explícita.
  const [draft, setDraft] = useState<ConsentState>(CONSENT_NONE)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const panelId = useId()
  const descIdBase = useId()

  // "Minhas opções" desaparece ao abrir o painel — sem isto o foco do teclado
  // cairia no <body>. Leva o foco para o título do painel, que é o começo do
  // conteúdo novo.
  useEffect(() => {
    if (detailsOpen) panelHeadingRef.current?.focus()
  }, [detailsOpen])

  // `null` no servidor e no primeiro render do cliente — o banner só aparece
  // depois da hidratação, quando dá pra ler o cookie de verdade.
  if (saved !== null) return null

  const toggle = (key: ConsentCategory) => setDraft((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="spn-consent">
      <section
        role="region"
        aria-labelledby={titleId}
        className="spn-consent-card spn-glass spn-glass--chrome"
      >
        <h2 id={titleId} className="spn-consent-title">
          Controle sua privacidade
        </h2>

        <p className="spn-consent-text">
          Usamos cookies e tecnologias semelhantes para manter a SpaceNode funcionando, analisar o
          uso da plataforma e medir nossas campanhas. Você escolhe quais categorias deseja
          permitir.{' '}
          <Link href="/privacidade" className="spn-consent-link">
            Política de Privacidade
          </Link>
        </p>

        <div id={panelId} className="spn-consent-panel" hidden={!detailsOpen}>
          <h3 ref={panelHeadingRef} tabIndex={-1} className="spn-consent-panel-title">
            Categorias de cookies
          </h3>

          <ul className="spn-consent-cats">
            {CATEGORIES.map((cat, i) => {
              const descId = `${descIdBase}-${i}`
              const on = cat.key === null ? true : draft[cat.key]

              return (
                <li key={cat.title} className="spn-consent-cat">
                  <div className="spn-consent-cat-head">
                    <span className="spn-consent-cat-title">{cat.title}</span>

                    {cat.key === null ? (
                      <span className="spn-consent-always">
                        <span className="spn-consent-always-dot" aria-hidden="true" />
                        Sempre ativos
                      </span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={cat.title}
                        aria-describedby={descId}
                        className="spn-consent-switch"
                        onClick={() => toggle(cat.key as ConsentCategory)}
                      >
                        <span className="spn-consent-knob" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <p id={descId} className="spn-consent-cat-desc">
                    {cat.description}
                  </p>

                  <p className="spn-consent-services">
                    {cat.services.length > 0 ? (
                      <>
                        Serviços: <span className="spn-consent-service">{cat.services.join(' · ')}</span>
                      </>
                    ) : (
                      'Serviços: nenhum ativo'
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="spn-consent-actions">
          {!detailsOpen && (
            <button
              type="button"
              className="spn-consent-btn spn-consent-btn--ghost"
              aria-expanded={false}
              aria-controls={panelId}
              onClick={() => setDetailsOpen(true)}
            >
              Minhas opções
            </button>
          )}

          <button
            type="button"
            className="spn-consent-btn spn-consent-btn--ghost"
            onClick={() => writeConsentState(CONSENT_NONE)}
          >
            Recusar opcionais
          </button>

          <button
            type="button"
            className={`spn-consent-btn ${detailsOpen ? 'spn-consent-btn--ghost' : 'spn-consent-btn--primary'}`}
            onClick={() => writeConsentState(CONSENT_ALL)}
          >
            Aceitar todos
          </button>

          {detailsOpen && (
            <button
              type="button"
              className="spn-consent-btn spn-consent-btn--primary"
              onClick={() => writeConsentState(draft)}
            >
              Salvar preferências
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
