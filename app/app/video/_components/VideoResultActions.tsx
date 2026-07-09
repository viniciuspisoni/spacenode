'use client'

// Tela de resultado — o momento de maior valor percebido do módulo.
// Player grande, comparação com a imagem base, resumo legível da
// configuração e ações claras. O vídeo é tratado como um ativo pronto
// para apresentação, redes ou proposta comercial.

import { useState } from 'react'
import { getVideoModel } from '@/lib/video/models'
import { CAMERA_MOTIONS } from '@/lib/video/cameraPresets'
import { getVideoTypePreset } from '@/lib/video/videoPresets'
import type { CameraIntensity } from '@/lib/video/cameraPresets'
import type { GenerationResult } from '../_hooks/useAnimateState'

const INTENSITY_LABELS: Record<CameraIntensity, string> = {
  subtle:     'Sutil',
  normal:     'Moderado',
  cinematic:  'Cinematográfico',
  pronounced: 'Dinâmico',
}

function formatLabel(aspectRatio: string): string {
  return aspectRatio === 'auto' ? 'Original' : aspectRatio
}

// Download pelo proxy /api/download (Content-Disposition: attachment). Link
// direto pro CDN abriria uma aba fora do site — o atributo download de <a>
// é ignorado em URLs cross-origin.
function downloadHref(url: string): string {
  return `/api/download?url=${encodeURIComponent(url)}&filename=spacenode-animacao.mp4`
}

interface Props {
  result:           GenerationResult
  onGenerateAgain:  () => void
  onAdjust:         () => void
  onUseAsReference: () => void
}

export default function VideoResultActions({
  result,
  onGenerateAgain,
  onAdjust,
  onUseAsReference,
}: Props) {
  const [view, setView] = useState<'video' | 'base'>('video')
  // Estado do player: alguns navegadores (extensões, tracking prevention,
  // autoplay bloqueado) impedem a mídia sem erro visível — sem isto o
  // usuário vê uma caixa preta muda e acha que a geração falhou.
  const [playback, setPlayback] = useState<'loading' | 'ready' | 'failed'>('loading')

  // Nova geração (outro outputUrl) → player recomeça do zero. Reset durante o
  // render (padrão do React p/ "state derivado de prop"), não em effect.
  const [prevUrl, setPrevUrl] = useState(result.outputUrl)
  if (prevUrl !== result.outputUrl) {
    setPrevUrl(result.outputUrl)
    setPlayback('loading')
  }

  const model  = getVideoModel(result.modelId)
  const motion = result.motionId ? CAMERA_MOTIONS[result.motionId] : undefined
  const preset = getVideoTypePreset(result.videoType)

  const meta: { label: string; value: string }[] = [
    { label: 'Tipo',        value: preset?.label ?? 'Vídeo de projeto' },
    { label: 'Movimento',   value: motion?.label ?? 'Automático' },
    { label: 'Formato',     value: formatLabel(result.aspectRatio) },
    { label: 'Duração',     value: `${result.duration}s` },
    { label: 'Intensidade', value: INTENSITY_LABELS[result.intensity] },
    { label: 'Consumo',     value: `${result.nodesCharged} Nodes` },
  ]
  if (model) meta.splice(5, 0, { label: 'Motor', value: model.label })

  return (
    <div style={{
      width: '100%', maxWidth: 760,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Cabeçalho: status + comparação */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            10,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-accent-green-bg)',
            border: '1px solid var(--color-accent-green-border)',
          }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
              stroke="var(--color-accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 L6.5 12 L13 4.5"/>
            </svg>
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'var(--color-text-primary)',
          }}>
            Seu vídeo está pronto
          </span>
        </div>

        <div style={{
          display:      'flex',
          gap:          3,
          padding:      3,
          borderRadius: 8,
          background:   'var(--color-surface)',
          border:       '0.5px solid var(--color-border)',
        }}>
          {([['video', 'Resultado'], ['base', 'Imagem base']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              style={{
                padding:       '5px 12px',
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: '-0.01em',
                borderRadius:  6,
                border:        'none',
                background:    view === id ? 'var(--color-surface-hover)' : 'transparent',
                color:         view === id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                cursor:        'pointer',
                transition:    'background 0.15s, color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Player / comparação — dimensionamento intrínseco: um 9:16 aparece
          alto e centrado (não uma faixa letterboxed), um 16:9 preenche. */}
      <div style={{
        position:       'relative',
        borderRadius:   14,
        overflow:       'hidden',
        background:     'var(--color-preview-bg)',
        border:         '0.5px solid var(--color-border)',
        boxShadow:      'var(--shadow-lg, 0 18px 50px rgba(0,0,0,0.35))',
        display:        'flex',
        justifyContent: 'center',
        minHeight:      240,
      }}>
        {view === 'video' ? (
          <>
            <video
              key={result.outputUrl}
              src={result.outputUrl}
              autoPlay
              loop
              muted
              playsInline
              controls
              onLoadedData={() => setPlayback('ready')}
              onCanPlay={() => setPlayback(p => (p === 'failed' ? p : 'ready'))}
              onError={() => setPlayback('failed')}
              style={{
                maxHeight: '56vh',
                maxWidth:  '100%',
                width:     'auto',
                height:    'auto',
                display:   playback === 'failed' ? 'none' : 'block',
              }}
            />

            {playback === 'loading' && (
              <div style={{
                position:       'absolute',
                inset:          0,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            10,
                pointerEvents:  'none',
              }}>
                <div style={{
                  width:     28, height: 28, borderRadius: '50%',
                  border:    '2px solid rgba(255,255,255,0.12)',
                  borderTop: '2px solid rgba(255,255,255,0.7)',
                  animation: 'spin 0.9s linear infinite',
                }} />
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
                  Carregando vídeo…
                </div>
              </div>
            )}

            {playback === 'failed' && (
              <div style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            12,
                padding:        '48px 32px',
                textAlign:      'center',
              }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  O navegador bloqueou a reprodução aqui
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', maxWidth: 340, lineHeight: 1.55 }}>
                  O vídeo foi gerado normalmente. Extensões ou a proteção de
                  rastreamento podem impedir o player embutido — baixe o
                  arquivo para assistir.
                </div>
                <a
                  href={downloadHref(result.outputUrl)}
                  style={{
                    fontSize:      11.5,
                    fontWeight:    500,
                    padding:       '8px 14px',
                    borderRadius:  8,
                    textDecoration:'none',
                    background:    'var(--color-surface-hover)',
                    color:         'var(--color-text-primary)',
                    border:        '1px solid var(--color-border-strong)',
                  }}
                >
                  Baixar o vídeo
                </a>
              </div>
            )}
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key="base"
            src={result.inputUrl}
            alt="Imagem base do projeto"
            style={{
              maxHeight: '56vh',
              maxWidth:  '100%',
              width:     'auto',
              height:    'auto',
              display:   'block',
            }}
          />
        )}
      </div>

      {/* Resumo da geração */}
      <div style={{
        display:      'flex',
        flexWrap:     'wrap',
        gap:          0,
        borderRadius: 10,
        border:       '1px solid var(--color-border)',
        background:   'var(--color-surface-subtle)',
        overflow:     'hidden',
      }}>
        {meta.map((m, i) => (
          <div key={m.label} style={{
            flex:       '1 1 auto',
            minWidth:   96,
            padding:    '10px 14px',
            borderLeft: i === 0 ? 'none' : '1px solid var(--color-border)',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              color: 'var(--color-text-quaternary)',
            }}>
              {m.label}
            </div>
            <div style={{
              fontSize: 11.5, fontWeight: 500, letterSpacing: '-0.01em',
              color: 'var(--color-text-secondary)',
              marginTop: 3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Ações */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            10,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={downloadHref(result.outputUrl)}
            style={primaryBtn}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Baixar vídeo
          </a>
          <button type="button" onClick={onGenerateAgain}  style={ghostBtn}>Gerar nova versão</button>
          <button type="button" onClick={onAdjust}         style={ghostBtn}>Ajustar configurações</button>
          <button type="button" onClick={onUseAsReference} style={ghostBtn}>Continuar do último frame</button>
        </div>

        <div style={{
          display:    'inline-flex',
          alignItems: 'center',
          gap:        6,
          fontSize:   10.5,
          color:      'var(--color-text-tertiary)',
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5 L6.5 12 L13 4.5"/>
          </svg>
          Salvo no histórico
          <a href="/app/history" style={{
            color: 'var(--color-text-secondary)',
            textDecoration: 'none',
            borderBottom: '1px solid var(--color-border-strong)',
          }}>
            Ver histórico
          </a>
        </div>
      </div>
    </div>
  )
}

const baseBtn: React.CSSProperties = {
  fontSize:      11.5,
  fontWeight:    500,
  padding:       '8px 14px',
  borderRadius:  8,
  letterSpacing: '-0.005em',
  cursor:        'pointer',
  display:       'inline-flex',
  alignItems:    'center',
  gap:           6,
  textDecoration:'none',
  transition:    'background 0.15s, border-color 0.15s, color 0.15s',
}

const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: 'var(--color-inverse)',
  color:      'var(--color-inverse-foreground)',
  border:     '1px solid var(--color-inverse)',
}

const ghostBtn: React.CSSProperties = {
  ...baseBtn,
  background: 'transparent',
  color:      'var(--color-text-secondary)',
  border:     '1px solid var(--color-border-strong)',
}
