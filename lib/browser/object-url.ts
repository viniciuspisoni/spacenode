'use client'

import { useEffect, useMemo, useRef } from 'react'

/**
 * Prévia de arquivo local sem data URL.
 *
 * `FileReader.readAsDataURL` transforma a foto inteira em base64: numa imagem
 * de câmera (o teto dessas telas é 20 MB) isso vira um atributo `style` ou
 * `src` de ~27 MB no DOM, e o navegador decodifica o arquivo de novo a cada
 * consumidor. Com o papel de parede em cena são dois decodes e um `blur(48px)`
 * por cima — o engasgo aparece logo depois do upload.
 *
 * `URL.createObjectURL` devolve um ponteiro de ~60 caracteres para o mesmo
 * blob. O preço é ter de revogar: a URL segura o arquivo em memória até
 * alguém soltar. Este saco faz a contabilidade — revoga o que for trocado e
 * varre o resto ao desmontar.
 *
 * Uso:
 *   const urls = useObjectUrls()
 *   // ao trocar de arquivo:
 *   urls.revoke(preview); setPreview(urls.create(file))
 *   // ao limpar:
 *   urls.revoke(preview); setPreview(null)
 */
export function useObjectUrls() {
  const bag = useRef<Set<string>>(new Set())

  useEffect(() => {
    const set = bag.current
    return () => {
      set.forEach(url => URL.revokeObjectURL(url))
      set.clear()
    }
  }, [])

  return useMemo(
    () => ({
      create(file: Blob): string {
        const url = URL.createObjectURL(file)
        bag.current.add(url)
        return url
      },
      /** No-op em `null`, em URL de outra origem e em URL já revogada. */
      revoke(url: string | null | undefined): void {
        if (url && bag.current.delete(url)) URL.revokeObjectURL(url)
      },
    }),
    [],
  )
}
