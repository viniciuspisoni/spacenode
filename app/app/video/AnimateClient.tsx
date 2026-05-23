'use client'

// Root client da nova tela Animar. Orquestra:
//   - estado compartilhado (useAnimateState)
//   - canvas grande à esquerda (VideoCreationCanvas)
//   - tabs dos 3 modos no topo (AnimateHeader)
//   - painel direito (varia conforme o modo ativo)
//   - upload + análise automática + geração
//
// IMPORTANTE: este client ainda não é renderizado pela page.tsx — a
// página continua placeholder até a Etapa 4. Estamos montando em paralelo.

import { useEffect } from 'react'
import { VIDEO_FLAGS } from '@/lib/video/flags'
import AnimateHeader from './_components/AnimateHeader'
import VideoCreationCanvas from './_components/VideoCreationCanvas'
import VideoHistoryCarousel from './_components/VideoHistoryCarousel'
import type { VideoHistoryItem } from './_components/VideoHistoryCarousel'
import AnimateImageMode from './_modes/AnimateImageMode'
import ArchCameraMode from './_modes/ArchCameraMode'
import GuidedSceneMode from './_modes/GuidedSceneMode'
import { useAnimateState } from './_hooks/useAnimateState'
import { useReferenceAnalysis } from './_hooks/useReferenceAnalysis'
import { useVideoGeneration } from './_hooks/useVideoGeneration'
import { useFrameExtractor } from './_hooks/useFrameExtractor'
import { getVideoModel } from '@/lib/video/models'

interface AnimateClientProps {
  initialCredits: number
}

export default function AnimateClient({ initialCredits }: AnimateClientProps) {
  const { state, dispatch, nodeCost } = useAnimateState(initialCredits)
  const { analyze }  = useReferenceAnalysis(dispatch)
  const { generate } = useVideoGeneration(state, dispatch, nodeCost)
  const { extract: extractFrame } = useFrameExtractor()

  // Dispara análise automática quando uma nova imagem é carregada,
  // se a flag estiver ligada. Caso contrário, vai direto para 'ready'.
  useEffect(() => {
    if (!state.imageFile)              return
    if (state.status === 'analyzing')  return
    if (state.analysis)                return
    if (state.analysisError)           return
    if (state.status === 'generating') return
    if (state.status === 'success')    return

    if (VIDEO_FLAGS.enableAutoVideoAnalysis) {
      void analyze(state.imageFile)
    }
    // Se a flag estiver desligada, ficamos em 'ready' implicitamente
    // (não disparamos análise). O usuário preenche manualmente.
  }, [state.imageFile, state.status, state.analysis, state.analysisError, analyze])

  // Limpa preview se imageFile foi removido (Trocar imagem)
  // — já tratado dentro do reducer via setImage(null,null)

  function handleImagePicked(file: File, preview: string, wasCropped: boolean) {
    dispatch({ type: 'setImage', file, preview, wasCropped })
  }

  function handleImageError(message: string) {
    dispatch({ type: 'generationError', message })
  }

  function handleClearImage() {
    dispatch({ type: 'setImage', file: null, preview: null, wasCropped: false })
    dispatch({ type: 'setEndImage', file: null, preview: null })
  }

  function handleClearError() {
    dispatch({ type: 'resetResult' })
  }

  function handleGenerateAgain() {
    dispatch({ type: 'resetResult' })
    // Mantém todos os parâmetros — usuário só clica novamente
  }

  function handleTryAnotherMotion() {
    dispatch({ type: 'resetResult' })
    dispatch({ type: 'setMode', mode: 'camera' })
  }

  async function handleUseAsReference() {
    if (!state.result?.outputUrl) return
    const frame = await extractFrame(state.result.outputUrl, 'last')
    if (!frame) {
      dispatch({ type: 'analysisFailed', message: 'Não foi possível extrair o frame do vídeo.' })
      return
    }
    // Carrega o último frame como nova imagem inicial — pronto para
    // gerar uma continuação. Mantém o modelo/movimento/duração atuais.
    dispatch({ type: 'setImage', file: frame.file, preview: frame.preview, wasCropped: false })
  }

  function handleImprovePrompt() {
    dispatch({ type: 'resetResult' })
    dispatch({ type: 'setMode', mode: 'guided' })
  }

  // Reutilizar config de um vídeo passado: aplica modelo + duração.
  // Motion/scene não estão persistidos no histórico hoje — usuário escolhe novamente.
  function handleReuseHistory(item: VideoHistoryItem) {
    const model = getVideoModel(item.style)
    if (!model || !model.isAvailable) return
    dispatch({ type: 'setModel', modelId: model.id })
    // lighting vem como '8s' — normaliza para '8'
    const durationRaw = item.lighting.replace(/s$/, '')
    if (model.supportedDurations.includes(durationRaw)) {
      dispatch({ type: 'setDuration', duration: durationRaw })
    }
  }

  return (
    <div style={{
      display:    'flex',
      width:      '100%',
      height:     '100%',
      overflow:   'hidden',
      background: '#0a0a0a',
      color:      '#ffffff',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Canvas à esquerda (área principal) ──────────────────────────── */}
      <section style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        minWidth:       0,
        overflow:       'hidden',
      }}>
        <AnimateHeader
          mode={state.mode}
          onChange={m => dispatch({ type: 'setMode', mode: m })}
        />
        <VideoCreationCanvas
          state={state}
          onImagePicked={handleImagePicked}
          onImageError={handleImageError}
          onClearImage={handleClearImage}
          onGenerateAgain={handleGenerateAgain}
          onTryAnotherMotion={handleTryAnotherMotion}
          onUseAsReference={handleUseAsReference}
          onImprovePrompt={handleImprovePrompt}
          onClearError={handleClearError}
        />
        <VideoHistoryCarousel onReuse={handleReuseHistory} />
      </section>

      {/* ── Painel direito (configurações) ──────────────────────────────── */}
      {state.mode === 'animate' && (
        <AnimateImageMode state={state} dispatch={dispatch} nodeCost={nodeCost} onGenerate={generate} />
      )}
      {state.mode === 'camera' && (
        <ArchCameraMode state={state} dispatch={dispatch} nodeCost={nodeCost} onGenerate={generate} />
      )}
      {state.mode === 'guided' && (
        <GuidedSceneMode state={state} dispatch={dispatch} nodeCost={nodeCost} onGenerate={generate} />
      )}
    </div>
  )
}
