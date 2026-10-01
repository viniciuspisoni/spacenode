'use client'

// Root client do Animar.
//
// A casca é a `.spn-tool` do kit de vidro (globals.css): painel de config à
// esquerda com scroll próprio e dock colado embaixo, palco à direita. Era um
// sexto clone do shell de 420px que já estava copiado em cinco telas — agora
// é a mesma peça, e a media query de 900px vem junto.
//
// O papel de parede passa a ser a imagem de origem: o vidro do painel refrata
// o projeto do usuário, como no painel v1 do plugin.

import { useEffect, useState } from 'react'
import { VIDEO_FLAGS } from '@/lib/video/flags'
import { summarize, useAmbient } from '@/components/app/glass'
import AnimateHeader from './_components/AnimateHeader'
import VideoCreationCanvas from './_components/VideoCreationCanvas'
import VideoHistoryCarousel from './_components/VideoHistoryCarousel'
import type { VideoHistoryItem } from './_components/VideoHistoryCarousel'
import AnimatePanel from './_components/AnimatePanel'
import { formatLabel } from './_components/animateLabels'
import { useAnimateState } from './_hooks/useAnimateState'
import { useImageUpload } from './_hooks/useImageUpload'
import { useReferenceAnalysis } from './_hooks/useReferenceAnalysis'
import { useVideoGeneration } from './_hooks/useVideoGeneration'
import { VIDEO_TYPE_PRESETS } from '@/lib/video/videoPresets'
import { EditV2ImportModal } from '@/components/editar/EditV2ImportModal'
import { toMediaProxyUrl } from '@/lib/storage/media-url'

interface AnimateClientProps {
  initialCredits: number
}

export default function AnimateClient({ initialCredits }: AnimateClientProps) {
  const { state, dispatch, model, resolvedMotion, nodeCost } = useAnimateState(initialCredits)
  const { analyze }  = useReferenceAnalysis(dispatch)
  const { generate } = useVideoGeneration(state, dispatch, nodeCost)
  const [importOpen, setImportOpen] = useState(false)

  // O papel de parede é a imagem em foco. Depois de gerar, o resultado é um
  // vídeo — que não serve de background-image; fica a origem, que é o mesmo
  // projeto e a mesma paleta.
  useAmbient(state.imagePreview ?? state.result?.inputUrl ?? null)

  // Import do histórico: baixa a imagem escolhida e injeta no MESMO pipeline
  // do upload (validação de tipo/tamanho + auto-crop de proporção + preview).
  const { loadFile: loadImportedFile } = useImageUpload({
    onLoaded: r => dispatch({ type: 'setImage', file: r.file, preview: r.preview, wasCropped: r.wasCropped }),
    onError:  message => dispatch({ type: 'generationError', message }),
  })

  // Dispara análise automática quando uma nova imagem é carregada,
  // se a flag estiver ligada. Caso contrário, segue direto (defaults do preset).
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
  }, [state.imageFile, state.status, state.analysis, state.analysisError, analyze])

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
    dispatch({ type: 'nextVariation' })
  }

  async function handleImportFromHistory(url: string) {
    setImportOpen(false)
    try {
      // Proxy same-origin quando o bucket for privado; URLs FAL/públicas
      // passam direto (CORS liberado nesses hosts).
      const res = await fetch(toMediaProxyUrl(url) ?? url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
      const ext  = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const file = new File([blob], `historico.${ext}`, { type })
      loadImportedFile(file)
    } catch (err) {
      console.error('[Animar] import do histórico falhou:', err)
      dispatch({
        type:    'generationError',
        message: 'Não foi possível importar esta imagem do histórico. Baixe o arquivo e envie manualmente.',
      })
    }
  }

  // O histórico antigo pode conter motores e presets que saíram da vitrine.
  // Ao reutilizar, converte para um dos dois destinos atuais.
  function handleReuseHistory(item: VideoHistoryItem) {
    dispatch({ type: 'applyPreset', videoType: item.settings?.video_type === 'reels' ? 'reels' : 'cinematic' })
  }

  const configLine = summarize([
    VIDEO_TYPE_PRESETS[state.videoType].label,
    resolvedMotion.label,
    formatLabel(state.aspectRatio),
    `${state.duration}s`,
  ])

  return (
    <div className="spn-animar-shell" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <AnimateHeader />

      <div className="spn-tool">
        <AnimatePanel
          state={state}
          dispatch={dispatch}
          model={model}
          nodeCost={nodeCost}
          onGenerate={generate}
        />

        {/* Palco: o que está em foco (imagem, geração, resultado) e, embaixo,
            os últimos vídeos. Dois cartões de vidro, não uma coluna solta. */}
        <div style={{
          minWidth: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <section
            className="spn-tool-stage spn-glass"
            style={{ flex: 1, alignItems: 'stretch' }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <VideoCreationCanvas
                state={state}
                configLine={configLine}
                onImagePicked={handleImagePicked}
                onImageError={handleImageError}
                onPickFromHistory={() => setImportOpen(true)}
                onClearImage={handleClearImage}
                onGenerateAgain={handleGenerateAgain}
                onClearError={handleClearError}
              />
            </div>
          </section>

          <VideoHistoryCarousel onReuse={handleReuseHistory} />
        </div>
      </div>

      {/* Importar imagem do histórico (renders, vistas, edições, ampliadas) */}
      <EditV2ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSelect={url => void handleImportFromHistory(url)}
        includeUpscales
      />
    </div>
  )
}
