'use client'

// Painel de ações pós-geração. Aparece embaixo do player de vídeo
// quando o estado é 'success'. Inclui as ações solicitadas no brief:
// baixar, gerar variação, melhorar prompt, reanimar com outro movimento,
// usar como referência para próximo vídeo.

import { getVideoModel } from '@/lib/video/models'
import { CAMERA_MOTIONS, type CameraMotionId } from '@/lib/video/cameraPresets'
import { SCENE_TYPES, type SceneTypeId } from '@/lib/video/scenes'
import type { GenerationResult } from '../_hooks/useAnimateState'

interface Props {
  result:          GenerationResult
  onGenerateAgain: () => void
  onTryAnotherMotion: () => void
  onUseAsReference: () => void
  onImprovePrompt: () => void
}

export default function VideoResultActions({
  result,
  onGenerateAgain,
  onTryAnotherMotion,
  onUseAsReference,
  onImprovePrompt,
}: Props) {
  const model  = getVideoModel(result.modelId)
  const motion = result.motionId ? CAMERA_MOTIONS[result.motionId] : undefined
  const scene  = result.sceneType ? SCENE_TYPES[result.sceneType] : undefined

  return (
    <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <video
        src={result.outputUrl}
        autoPlay
        loop
        muted
        playsInline
        controls
        style={{
          width:        '100%',
          borderRadius: 12,
          display:      'block',
          background:   'var(--color-preview-bg)',
        }}
      />

      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            10,
      }}>
        <div style={{
          fontSize: 11,
          color:    'var(--color-text-tertiary)',
          letterSpacing: '0.04em',
        }}>
          {model?.label ?? 'Animação'} · {result.duration}s
          {motion ? ` · ${motion.label}` : ''}
          {scene  ? ` · ${scene.label}`  : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={result.outputUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={primaryBtn}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Baixar vídeo
          </a>
          <button type="button" onClick={onGenerateAgain}    style={ghostBtn}>Gerar variação</button>
          <button type="button" onClick={onTryAnotherMotion} style={ghostBtn}>Outro movimento</button>
          <button type="button" onClick={onImprovePrompt}    style={ghostBtn}>Melhorar prompt</button>
          <button type="button" onClick={onUseAsReference}   style={ghostBtn}>Usar como referência</button>
        </div>
      </div>
    </div>
  )
}

const baseBtn: React.CSSProperties = {
  fontSize:      11,
  fontWeight:    500,
  padding:       '7px 13px',
  borderRadius:  7,
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
