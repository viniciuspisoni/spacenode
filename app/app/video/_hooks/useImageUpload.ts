'use client'

// Upload + normalização de imagem do módulo Animar. Duas garantias:
//
//   1. PROPORÇÃO — os motores de vídeo aceitam aspect ratio 0.4–2.5;
//      fora disso fazemos center-crop (com aviso ao usuário).
//   2. PESO/DIMENSÃO — o pipeline HTTP tem tetos reais de body
//      (middleware do Next bufferiza multipart em ~10MB em dev; Vercel
//      tem limite próprio em prod) e os motores geram a 1080p — nada
//      acima de ~2560px agrega qualidade. Imagens grandes são
//      redimensionadas p/ máx. 2560px e re-encodadas em JPEG até ficar
//      abaixo de ~3.5MB. Resultado: upload rápido e geração idêntica.
//
// A imagem ORIGINAL do usuário nunca é alterada — só o que sobe p/ o servidor.

import { useCallback, useState } from 'react'

const MAX_FILE_BYTES   = 20 * 1024 * 1024   // teto do arquivo de entrada
const MIN_RATIO        = 0.4
const MAX_RATIO        = 2.5
const MAX_DIMENSION    = 2560               // maior lado após otimização
const TARGET_BYTES     = 3.5 * 1024 * 1024  // alvo do payload enviado
const JPEG_QUALITIES   = [0.92, 0.85, 0.78] // tentativas de re-encode

export interface UploadResult {
  file:       File
  preview:    string
  wasCropped: boolean
  wasResized: boolean
}

export type UploadCallback = (result: UploadResult) => void
export type UploadErrorCallback = (message: string) => void

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

export function useImageUpload(opts: {
  onLoaded:  UploadCallback
  onError?:  UploadErrorCallback
}) {
  const [isProcessing, setIsProcessing] = useState(false)

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      opts.onError?.('Arquivo deve ser uma imagem.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      opts.onError?.('Imagem muito grande. Máximo 20 MB.')
      return
    }

    setIsProcessing(true)
    const reader = new FileReader()
    reader.onload = e => {
      const src = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        void (async () => {
          const ratio     = img.width / img.height
          const needsCrop = ratio < MIN_RATIO || ratio > MAX_RATIO

          // Região de origem (center-crop quando a proporção estoura o range)
          let sx = 0, sy = 0, sw = img.width, sh = img.height
          if (needsCrop) {
            if (ratio < MIN_RATIO) {
              sh = Math.round(img.width / MIN_RATIO)
              sy = Math.round((img.height - sh) / 2)
            } else {
              sw = Math.round(img.height * MAX_RATIO)
              sx = Math.round((img.width - sw) / 2)
            }
          }

          // Escala p/ o maior lado ficar em MAX_DIMENSION
          const scale       = Math.min(1, MAX_DIMENSION / Math.max(sw, sh))
          const needsResize = scale < 1
          const needsRecode = file.size > TARGET_BYTES

          // Caminho feliz: nada a fazer — sobe o arquivo original.
          if (!needsCrop && !needsResize && !needsRecode) {
            opts.onLoaded({ file, preview: src, wasCropped: false, wasResized: false })
            setIsProcessing(false)
            return
          }

          const canvas  = document.createElement('canvas')
          canvas.width  = Math.round(sw * scale)
          canvas.height = Math.round(sh * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            opts.onError?.('Falha ao processar a imagem.')
            setIsProcessing(false)
            return
          }
          // JPEG não tem alpha — funde transparência (raro em render) sobre branco.
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

          // Re-encode em JPEG reduzindo qualidade até caber no alvo.
          let blob: Blob | null = null
          for (const q of JPEG_QUALITIES) {
            blob = await canvasToBlob(canvas, 'image/jpeg', q)
            if (blob && blob.size <= TARGET_BYTES) break
          }
          if (!blob) {
            opts.onError?.('Falha ao processar a imagem.')
            setIsProcessing(false)
            return
          }

          const outName = file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
          const out     = new File([blob], outName, { type: 'image/jpeg' })
          opts.onLoaded({
            file:       out,
            preview:    canvas.toDataURL('image/jpeg', 0.9),
            wasCropped: needsCrop,
            wasResized: needsResize,
          })
          setIsProcessing(false)
        })()
      }
      img.onerror = () => {
        opts.onError?.('Falha ao ler a imagem.')
        setIsProcessing(false)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }, [opts])

  return { loadFile, isProcessing }
}
