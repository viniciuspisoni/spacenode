'use client'

import { useEffect, useState } from 'react'

/**
 * Papel de parede do app.
 *
 * O vidro só é vidro se houver algo passando por trás — sobre cor chapada
 * ele vira cinza. No plugin esse "algo" é o render atual, borrado
 * (`dialog.html:3828-3841`): é o que faz o painel assumir a paleta do
 * projeto. Aqui é a mesma ideia, com a fonte em três camadas:
 *
 * 1. A tela ativa manda a imagem que está em foco (o render que acabou de
 *    sair, a vista aberta) via `useAmbient()`.
 * 2. Sem isso, fica o último render do usuário, que o servidor entrega no
 *    layout — o app abre já com a cara do trabalho dele.
 * 3. Sem nem isso (conta nova), fica só o degradê neutro do CSS.
 *
 * A camada é `position: fixed` e não se move: o borrão é rasterizado uma vez
 * e depois só composto — rolar a página não refaz o filtro.
 */

const AMBIENT_EVENT = 'spn:ambient'

/**
 * Uma data URL grande custa duas vezes: o atributo `style` inteiro vai parar
 * no DOM e a foto é decodificada de novo só para o borrão. Um upload de
 * câmera (o teto é 20 MB) daria um engasgo visível logo depois do envio, e o
 * papel de parede é decoração — não vale um travamento. Acima deste tamanho
 * a camada simplesmente não entra e fica o degradê.
 */
const MAX_DATA_URL_BYTES = 1_500_000

function tooHeavy(url: string): boolean {
  return url.startsWith('data:') && url.length > MAX_DATA_URL_BYTES
}

/**
 * Troca o papel de parede. Chame de qualquer tela, com a URL da imagem em
 * foco — ou `null` para voltar ao padrão do usuário.
 *
 * Evento em vez de contexto de propósito: o `<Ambient/>` mora no layout
 * (server component) e os emissores são telas fundo de árvore; um provider
 * obrigaria a transformar o layout inteiro em client component.
 */
export function setAmbient(url: string | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AMBIENT_EVENT, { detail: url }))
}

/**
 * Liga uma tela ao papel de parede pelo tempo em que ela estiver montada, e
 * devolve o padrão ao sair.
 */
export function useAmbient(url: string | null | undefined) {
  useEffect(() => {
    setAmbient(url ?? null)
    return () => setAmbient(null)
  }, [url])
}

export interface AmbientProps {
  /** O que mostrar quando ninguém pediu nada — o último render do usuário. */
  fallbackUrl?: string | null
  /**
   * Modo controlado: ignora o barramento de eventos e usa só esta URL. É o
   * que a galeria de QA precisa — montada dentro do /app, ela tem o seu
   * próprio papel de parede de amostra, e sem isto trocá-lo trocaria também
   * o da página inteira, porque os dois `<Ambient/>` ouvem o mesmo evento.
   */
  url?: string | null
}

export function Ambient({ fallbackUrl, url: controlled }: AmbientProps) {
  const controlledMode = controlled !== undefined
  const [requested, setRequested] = useState<string | null>(fallbackUrl ?? null)
  // Guarda a URL que TERMINOU de carregar, em vez de um booleano resetado no
  // corpo do effect: evita o setState síncrono em effect e, de quebra, uma
  // URL assinada que expirou nunca chega a apagar a camada.
  const [loaded, setLoaded] = useState<string | null>(null)

  const url = controlledMode ? controlled : requested

  useEffect(() => {
    if (controlledMode) return
    const onSet = (ev: Event) => {
      const next = (ev as CustomEvent<string | null>).detail ?? fallbackUrl ?? null
      setRequested(prev => (prev === next ? prev : next))
    }
    window.addEventListener(AMBIENT_EVENT, onSet)
    return () => window.removeEventListener(AMBIENT_EVENT, onSet)
  }, [controlledMode, fallbackUrl])

  useEffect(() => {
    if (!url || tooHeavy(url)) return
    const img = new Image()
    // Sem crossOrigin: a imagem nunca é lida em canvas, só exibida. Pedir
    // CORS aqui quebraria em bucket sem cabeçalho e apagaria o papel.
    img.onload = () => setLoaded(url)
    img.onerror = () => {}
    img.src = url
    return () => { img.onload = null; img.onerror = null }
  }, [url])

  const showing = url && !tooHeavy(url) ? url : null

  return (
    <div className="spn-ambient" aria-hidden>
      {showing ? (
        <div
          className="spn-ambient-img"
          data-on={loaded === showing}
          // URL entre aspas: as assinadas do Supabase trazem `&`, `=` e `%`,
          // e uma sem aspas quebraria o valor no primeiro parêntese.
          style={{ backgroundImage: `url(${JSON.stringify(showing)})` }}
        />
      ) : null}
    </div>
  )
}

export default Ambient
