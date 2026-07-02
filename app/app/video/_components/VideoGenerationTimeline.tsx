'use client'

// Estado "Gerando vídeo..." — versão melhor que o spinner simples.
// Mostra preview da imagem com brilho reduzido, spinner, texto rotativo,
// timer, e barra de etapas estimadas com base no estimatedGenerationMs
// do modelo escolhido.

import { getVideoModel } from '@/lib/video/models'

const STEPS = [
  { at: 0.05, text: 'Enviando imagem…' },
  { at: 0.15, text: 'Configurando câmera…' },
  { at: 0.35, text: 'Gerando frames…' },
  { at: 0.65, text: 'Processando vídeo…' },
  { at: 0.85, text: 'Finalizando animação…' },
  { at: 0.96, text: 'Quase pronto…' },
]

function formatElapsed(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  preview:  string | null
  modelId:  string
  elapsed:  number
}

export default function VideoGenerationTimeline({ preview, modelId, elapsed }: Props) {
  const model = getVideoModel(modelId)
  const estimatedMs = model?.estimatedGenerationMs ?? 180_000
  const progress = Math.min(0.97, (elapsed * 1000) / estimatedMs)
  const currentStep = STEPS.slice().reverse().find(s => progress >= s.at) ?? STEPS[0]

  return (
    <div style={{
      width:          '100%',
      maxWidth:       560,
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      gap:            18,
    }}>
      {preview && (
        <div style={{
          position:     'relative',
          width:        '100%',
          borderRadius: 12,
          overflow:     'hidden',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="render"
            style={{ width: '100%', display: 'block', maxHeight: 360, objectFit: 'cover', filter: 'brightness(0.3)' }}
          />
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            12,
          }}>
            <div style={{
              width:      36, height: 36, borderRadius: '50%',
              border:     '2px solid rgba(255,255,255,0.12)',
              borderTop:  '2px solid rgba(255,255,255,0.7)',
              animation:  'spin 0.9s linear infinite',
            }} />
            <div style={{
              fontSize: 13, color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.01em', fontWeight: 500,
            }}>
              {currentStep.text}
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.45)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatElapsed(elapsed)}
            </div>
          </div>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{
          height:     4,
          width:      '100%',
          background: 'var(--color-surface)',
          borderRadius: 2,
          overflow:   'hidden',
        }}>
          <div style={{
            height:     '100%',
            width:      `${Math.round(progress * 100)}%`,
            background: 'var(--color-text-secondary)',
            transition: 'width 0.4s linear',
          }} />
        </div>
        <div style={{
          fontSize:   10.5,
          color:      'var(--color-text-tertiary)',
          marginTop:  10,
          textAlign:  'center',
          letterSpacing: '0.01em',
        }}>
          Vídeos de arquitetura levam entre 1 e 4 minutos. Mantenha esta aba aberta.
        </div>
      </div>
    </div>
  )
}
