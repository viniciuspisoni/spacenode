'use client'

import { useRef, useState } from 'react'
import {
  ChoiceGroup,
  PillGroup,
  RowIcon,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import { CostDock, DownloadIcon, formatFileSize, SourceDrop, StageLoading, ToolHeader } from '../_shell/ToolShell'
import {
  APRESENTAR_TOOLS,
  ISOMETRIC_ORIGINS,
  ISOMETRIC_TYPES,
  ISOMETRIC_STYLES,
  type IsometricOrigin,
  type IsometricType,
  type IsometricStyle,
} from '@/lib/apresentar/config'

interface Props {
  initialCredits: number
}

const TOOL = APRESENTAR_TOOLS.isometric

const LOADING_TEXTS = [
  'Analisando vista enviada…',
  'Calculando geometria isométrica…',
  'Aplicando estilo de apresentação…',
  'Refinando materiais…',
  'Finalizando…',
]

/* As pílulas do kit mostram a própria string que recebem; os presets são
   pares id/label. Converte-se nas bordas — o id é o que viaja na API. */
const ORIGIN_LABELS = ISOMETRIC_ORIGINS.map(o => o.label)

type SheetId = 'vista' | 'estilo' | 'origem'

export default function IsometricasClient({ initialCredits }: Props) {
  // Entrada
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)

  // Parâmetros — mesmos nomes e tipos que viajam para /api/apresentar/isometric
  const [origin, setOrigin] = useState<IsometricOrigin>('sketchup')
  const [type,   setType]   = useState<IsometricType>('mobiliada')
  const [style,  setStyle]  = useState<IsometricStyle>('premium_clean')

  const [sheet, setSheet] = useState<SheetId | null>(null)

  // Geração
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [resultUrl,   setResultUrl]   = useState<string | null>(null)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nodeCost  = TOOL.nodes ?? 0
  const canSubmit = !!imageFile && credits >= nodeCost && !isLoading

  // O papel de parede é o trabalho em foco: a isométrica que saiu, ou a vista
  // que entrou.
  useAmbient(resultUrl ?? imagePreview)

  const typeLabel   = ISOMETRIC_TYPES.find(t => t.id === type)?.label ?? ''
  const styleLabel  = ISOMETRIC_STYLES.find(s => s.id === style)?.label ?? ''
  const originLabel = ISOMETRIC_ORIGINS.find(o => o.id === origin)?.label ?? ''

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResultUrl(null)
    setError(null)
    setImageDimensions(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      const img = new Image()
      img.onload = () => setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  function resetImage() {
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
    formData.append('image',  imageFile)
    formData.append('origin', origin)
    formData.append('type',   type)
    formData.append('style',  style)

    try {
      const res  = await fetch('/api/apresentar/isometric', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro desconhecido')
        return
      }
      setResultUrl(data.url)
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
          desc="Uma vista do seu modelo vira isométrica de apresentação — volumetria, corte ou explodida."
        />

        <div className="spn-tool-panel-body">
          {/* A vista é o trabalho: fica na superfície, e sem ela o CTA não liga. */}
          <div className="spn-field">
            <span className="spn-field-label">Imagem base</span>
            <SourceDrop
              preview={imagePreview}
              label="Envie um screenshot ou vista do modelo"
              note="PNG, JPG, WEBP — até 20 MB"
              meta={[
                imageDimensions ? `${imageDimensions.w}×${imageDimensions.h}px` : '',
                imageFile ? formatFileSize(imageFile.size) : '',
              ].filter(Boolean).join(' · ')}
              onFile={loadImageFile}
              onClear={resetImage}
            />
          </div>

          <SettingGroup>
            <SettingRow icon={<RowIcon name="photo" />} title="Vista"
                        value={summarize([typeLabel])}
                        onOpen={() => setSheet('vista')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Estilo"
                        value={summarize([styleLabel])}
                        onOpen={() => setSheet('estilo')} />
            <SettingRow icon={<RowIcon name="precision" />} title="Origem"
                        value={summarize([originLabel])}
                        onOpen={() => setSheet('origem')} />
          </SettingGroup>

          <p className="spn-hint" style={{ marginTop: 14 }}>
            Vista em câmera paralela ou isométrica exportada do SketchUp/Revit dá o resultado mais fiel.
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
            <img src={resultUrl} alt="Isométrica"
                 style={{ maxWidth: '100%', borderRadius: 'var(--r-inner)', display: 'block' }} />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap', width: '100%', maxWidth: 860,
            }}>
              <span className="spn-hint" style={{ marginTop: 0 }}>
                Isométrica · {typeLabel} · {styleLabel}
              </span>
              {/* Proxy /api/download força attachment — o atributo download é
                  ignorado cross-origin e abriria a imagem fora do site. */}
              <a className="spn-ghost"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
                 href={`/api/download?url=${encodeURIComponent(resultUrl)}&filename=spacenode-isometrica.jpg`}>
                <DownloadIcon />
                Baixar
              </a>
            </div>
          </div>
        ) : null}

        {!isLoading && !resultUrl ? (
          <div className="spn-empty" style={{ maxWidth: 360 }}>
            Sua isométrica aparece aqui.
            <br />
            Envie uma vista do modelo e escolha o tipo.
          </div>
        ) : null}
      </div>

      {/* ── Folhas ─────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'vista'} title="Vista" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Tipo de isométrica</span>
          <ChoiceGroup
            label="Tipo de isométrica"
            cols={2}
            value={type}
            onChange={setType}
            options={ISOMETRIC_TYPES.map(t => ({ value: t.id, title: t.label, note: t.desc }))}
          />
        </div>
      </Sheet>

      <Sheet open={sheet === 'estilo'} title="Estilo" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Acabamento</span>
          <ChoiceGroup
            label="Acabamento"
            cols={2}
            value={style}
            onChange={setStyle}
            options={ISOMETRIC_STYLES.map(s => ({ value: s.id, title: s.label, note: s.desc }))}
          />
        </div>
      </Sheet>

      <Sheet open={sheet === 'origem'} title="Origem" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">De onde veio a imagem</span>
          <PillGroup
            label="Origem da imagem"
            options={ORIGIN_LABELS}
            value={originLabel}
            onChange={(label) => {
              const found = ISOMETRIC_ORIGINS.find(o => o.label === label)
              if (found) setOrigin(found.id)
            }}
          />
          <p className="spn-hint">
            Saber a origem melhora a fidelidade: cada software entrega linhas e sombras diferentes.
          </p>
        </div>
      </Sheet>
    </div>
  )
}
