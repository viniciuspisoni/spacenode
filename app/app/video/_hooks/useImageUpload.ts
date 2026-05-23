'use client'

// Encapsula a lógica de upload + auto-crop de imagens para o módulo
// Animar. Os modelos de vídeo aceitam aspect ratio entre 0.4 e 2.5 —
// fora disso, fazemos center-crop antes de enviar para evitar erro do
// provider e dar feedback claro ao usuário.

import { useCallback, useState } from 'react'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MIN_RATIO      = 0.4
const MAX_RATIO      = 2.5

export interface UploadResult {
  file:       File
  preview:    string
  wasCropped: boolean
}

export type UploadCallback = (result: UploadResult) => void
export type UploadErrorCallback = (message: string) => void

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
        const ratio      = img.width / img.height
        const needsCrop  = ratio < MIN_RATIO || ratio > MAX_RATIO

        if (!needsCrop) {
          opts.onLoaded({ file, preview: src, wasCropped: false })
          setIsProcessing(false)
          return
        }

        // Center-crop para o limite mais próximo
        const canvas = document.createElement('canvas')
        const ctx    = canvas.getContext('2d')!
        if (ratio < MIN_RATIO) {
          canvas.width  = img.width
          canvas.height = Math.round(img.width / MIN_RATIO)
          ctx.drawImage(img, 0, -Math.round((img.height - canvas.height) / 2))
        } else {
          canvas.width  = Math.round(img.height * MAX_RATIO)
          canvas.height = img.height
          ctx.drawImage(img, -Math.round((img.width - canvas.width) / 2), 0)
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
        canvas.toBlob(blob => {
          if (!blob) {
            opts.onError?.('Falha ao processar a imagem.')
            setIsProcessing(false)
            return
          }
          const cropped = new File([blob], file.name, { type: 'image/jpeg' })
          opts.onLoaded({ file: cropped, preview: dataUrl, wasCropped: true })
          setIsProcessing(false)
        }, 'image/jpeg', 0.95)
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
