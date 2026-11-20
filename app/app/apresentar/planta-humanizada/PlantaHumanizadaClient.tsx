'use client'

import { useRef, useState } from 'react'
import { Segmented, useAmbient } from '@/components/app/glass'
import { CostDock, DownloadIcon, formatFileSize, SourceDrop, StageLoading, ToolHeader } from '../_shell/ToolShell'
import { APRESENTAR_TOOLS, HUMANIZED_PLAN_LEVELS, type HumanizedPlanLevel } from '@/lib/apresentar/config'
import { useObjectUrls } from '@/lib/browser/object-url'

interface Props {
  initialCredits: number
}

const TOOL = APRESENTAR_TOOLS.humanized_plan

const LOADING_TEXTS = [
  'Analisando a planta…',
  'Preservando paredes e aberturas…',
  'Adicionando mobiliário…',
  'Aplicando texturas…',
  'Refinando apresentação…',
]

export default function PlantaHumanizadaClient({ initialCredits }: Props) {
  // Entrada
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  // Governa as URLs de blob das prévias: revoga a que sai e varre o resto
  // ao desmontar (uma object URL segura o arquivo em memória até alguém soltar).
  const objectUrls = useObjectUrls()
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)

  const [level, setLevel] = useState<HumanizedPlanLevel>('equilibrado')

  // Geração
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [resultFormat, setResultFormat] = useState<'jpg' | 'png'>('jpg')
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nodeCost  = TOOL.nodes ?? 0
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  // O papel de parede é o trabalho em foco: a planta que saiu, ou a que entrou.
  useAmbient(resultUrl ?? imagePreview)

  const levelSpec = HUMANIZED_PLAN_LEVELS.find(l => l.id === level)

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setError(null)
    setImageDimensions(null)

    // Object URL, não data URL: a mesma foto vira um ponteiro de 60
    // caracteres em vez de ~27 MB de base64 no DOM — e o papel de parede
    // (useAmbient) deixa de decodificar o arquivo uma segunda vez só para
    // borrá-lo. Ver lib/browser/object-url.ts.
    objectUrls.revoke(imagePreview)
    const url = objectUrls.create(file)
    setImagePreview(url)
    const img = new Image()
    img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }

  function resetImage() {
    objectUrls.revoke(imagePreview)
    setImageFile(null)
    setImagePreview(null)
    setResultUrl(null)
    setImageDimensions(null)
  }

  function startLoadingTexts() {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 1800)
  }

  function stopLoadingTexts() {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }

  async function handleSubmit() {
    if (!canSubmit || !imageFile) return
    setIsLoading(true)
    setError(null)
    setResultUrl(null)
    startLoadingTexts()

    const formData = new FormData()
    formData.append('image',       imageFile)
    formData.append('level', level)

    try {
      const res  = await fetch('/api/apresentar/humanized-plan', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro desconhecido')
        return
      }
      setResultUrl(data.url)
      setResultFormat(data.format === 'png' ? 'png' : 'jpg')
      if (typeof data.creditsRemaining === 'number') {
        setCredits(data.creditsRemaining)
      } else {
        setCredits((c) => c - nodeCost)
      }
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  return (
    <div className="spn-tool">
      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      <div className="spn-tool-panel spn-glass spn-glass--chrome">
        <ToolHeader
          title={TOOL.name}
          desc="Mobiliário, vegetação e texturas sobre a sua planta técnica — paredes, aberturas e proporções ficam como estão."
        />

        <div className="spn-tool-panel-body">
          {/* A planta é o trabalho: fica na superfície, e sem ela o CTA não liga. */}
          <div className="spn-field">
            <span className="spn-field-label">Planta baixa</span>
            <SourceDrop
              preview={imagePreview}
              label="Arraste sua planta ou clique para enviar"
              note="PNG, JPG, WEBP — até 20 MB"
              meta={[
                imageDimensions ? `${imageDimensions.w}×${imageDimensions.h}px` : '',
                imageFile ? formatFileSize(imageFile.size) : '',
              ].filter(Boolean).join(' · ')}
              onFile={loadImageFile}
              onClear={resetImage}
            />
          </div>

          {/* O nível reconfigura o que todo o resto significa — fica na
              superfície, como segmentado de 30px, não como três cartões. */}
          <div className="spn-field">
            <span className="spn-field-label">Nível de humanização</span>
            <Segmented
              label="Nível de humanização"
              value={level}
              onChange={setLevel}
              items={HUMANIZED_PLAN_LEVELS.map(l => ({ value: l.id, label: l.label }))}
            />
            {levelSpec ? <p className="spn-hint">{levelSpec.desc}</p> : null}
          </div>

          <p className="spn-hint" style={{ marginTop: 14 }}>
            A IA humaniza, não redesenha: paredes, aberturas e proporções são preservadas.
          </p>

          {error ? <div className="spn-error" style={{ marginTop: 14 }}>{error}</div> : null}
        </div>

        <CostDock cost={nodeCost} balance={credits}>
          <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading ? 'Gerando…' : credits < nodeCost ? 'Saldo insuficiente' : TOOL.ctaLabel}
          </button>
        </CostDock>
      </div>

      {/* ── Palco ──────────────────────────────────────────────────────────── */}
      <div className="spn-tool-stage spn-glass">
        {isLoading ? <StageLoading label={loadingText} /> : null}

        {!isLoading && resultUrl ? (
          <div style={{
            alignSelf: 'stretch', flex: 1, minHeight: 0, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 20,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultUrl} alt="Planta humanizada"
                 style={{ maxWidth: '100%', borderRadius: 'var(--r-inner)', display: 'block' }} />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap', width: '100%', maxWidth: 860,
            }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                Planta humanizada · {levelSpec?.label}
              </span>
              {/* Proxy /api/download força attachment — o atributo download é
                  ignorado cross-origin e abriria a imagem fora do site. */}
              <a className="spn-ghost"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
                 href={`/api/download?url=${encodeURIComponent(resultUrl)}&filename=spacenode-planta-humanizada.${resultFormat}`}>
                <DownloadIcon />
                Baixar
              </a>
            </div>
          </div>
        ) : null}

        {!isLoading && !resultUrl ? (
          <div className="spn-empty" style={{ maxWidth: 360 }}>
            Sua planta humanizada aparece aqui.
            <br />
            Envie a planta técnica e escolha o nível.
          </div>
        ) : null}
      </div>

    </div>
  )
}
