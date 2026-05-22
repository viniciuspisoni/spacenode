'use client'

// Estado "Analisando imagem do projeto..." que aparece logo após o upload.
// Sobrepõe o preview com fundo escurecido + spinner + texto rotativo.

import { useEffect, useState } from 'react'

const LOADING_TEXTS = [
  'Analisando imagem do projeto…',
  'Identificando tipo de ambiente…',
  'Sugerindo movimento de câmera…',
  'Calibrando modelo recomendado…',
]

interface Props {
  preview: string | null
}

export default function AnalyzingOverlay({ preview }: Props) {
  const [textIdx, setTextIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTextIdx(i => (i + 1) % LOADING_TEXTS.length), 1800)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      position:       'relative',
      width:          '100%',
      borderRadius:   12,
      overflow:       'hidden',
    }}>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="preview"
          style={{ width: '100%', display: 'block', filter: 'brightness(0.35) saturate(0.7)' }}
        />
      )}
      <div style={{
        position:       'absolute',
        inset:          0,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            14,
      }}>
        <div style={{
          width:      32, height: 32, borderRadius: '50%',
          border:     '2px solid rgba(255,255,255,0.12)',
          borderTop:  '2px solid rgba(255,255,255,0.7)',
          animation:  'spin 0.9s linear infinite',
        }} />
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.85)',
          letterSpacing: '-0.005em', fontWeight: 500,
        }}>
          {LOADING_TEXTS[textIdx]}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Levamos cerca de 10 segundos.
        </div>
      </div>
    </div>
  )
}
