'use client'

// Extrai um frame de um vídeo (default: último frame) em um Blob/File
// que pode ser passado como nova imagem inicial pra reanimação.
//
// Funciona no client via <video> + <canvas>. Precisa de um URL de vídeo
// que aceite CORS — vídeos do fal.media servem com headers ok hoje.

import { useCallback, useState } from 'react'

export interface ExtractedFrame {
  file:    File
  preview: string
}

export function useFrameExtractor() {
  const [isExtracting, setIsExtracting] = useState(false)

  const extract = useCallback(async (
    videoUrl: string,
    position: 'last' | 'first' = 'last',
  ): Promise<ExtractedFrame | null> => {
    setIsExtracting(true)
    try {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.preload     = 'metadata'
      video.muted       = true
      video.src         = videoUrl

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror          = () => reject(new Error('Falha ao carregar vídeo'))
      })

      const targetTime = position === 'last'
        ? Math.max(0, video.duration - 0.05)
        : 0

      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve()
        video.onerror  = () => reject(new Error('Falha ao posicionar vídeo'))
        video.currentTime = targetTime
      })

      const canvas = document.createElement('canvas')
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas indisponível')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92)
      )
      if (!blob) throw new Error('Falha ao gerar imagem')

      const file = new File([blob], `frame-${Date.now()}.jpg`, { type: 'image/jpeg' })
      return { file, preview: dataUrl }
    } catch (err) {
      console.error('[useFrameExtractor] falhou:', err)
      return null
    } finally {
      setIsExtracting(false)
    }
  }, [])

  return { extract, isExtracting }
}
