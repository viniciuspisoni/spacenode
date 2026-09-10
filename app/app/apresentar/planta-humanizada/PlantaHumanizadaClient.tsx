'use client'

import { useRef, useState } from 'react'
import {
  ChoiceGroup,
  MultiPillGroup,
  PillGroup,
  RowIcon,
  Segmented,
  SettingGroup,
  SettingRow,
  Sheet,
  summarize,
  useAmbient,
} from '@/components/app/glass'
import { CostDock, DownloadIcon, formatFileSize, SourceDrop, StageLoading, ToolHeader } from '../_shell/ToolShell'
import {
  APRESENTAR_TOOLS,
  HUMANIZED_PLAN_PROJECT_TYPES,
  HUMANIZED_PLAN_STYLES,
  HUMANIZED_PLAN_LEVELS,
  HUMANIZED_PLAN_DEFAULT_OPTIONS,
  type HumanizedPlanProjectType,
  type HumanizedPlanStyle,
  type HumanizedPlanLevel,
  type HumanizedPlanOptions,
} from '@/lib/apresentar/config'

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

/* As seis opções da API viram seis pílulas de múltipla escolha. O payload
   continua sendo o mesmo objeto de booleanos — só o controle mudou. */
const OPTION_LABEL: Record<keyof HumanizedPlanOptions, string> = {
  addFurniture:       'Mobiliário',
  addVegetation:      'Vegetação',
  applyFloorTextures: 'Texturas de piso',
  addSoftShadows:     'Sombras suaves',
  preserveLines:      'Linhas técnicas',
  addRoomLabels:      'Nomes dos ambientes',
}
const OPTION_KEYS   = Object.keys(OPTION_LABEL) as (keyof HumanizedPlanOptions)[]
const OPTION_LABELS = OPTION_KEYS.map(k => OPTION_LABEL[k])

/* As pílulas do kit mostram a própria string que recebem; os presets são
   pares id/label. Converte-se nas bordas — o id é o que viaja na API. */
const TYPE_LABELS = HUMANIZED_PLAN_PROJECT_TYPES.map(t => t.label)

type SheetId = 'cena' | 'estilo' | 'direcao'

export default function PlantaHumanizadaClient({ initialCredits }: Props) {
  // Entrada
  const [imageFile,       setImageFile]       = useState<File | null>(null)
  const [imagePreview,    setImagePreview]    = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)

  // Parâmetros — mesmos nomes e tipos que viajam para /api/apresentar/humanized-plan
  const [projectType, setProjectType] = useState<HumanizedPlanProjectType>('apartamento')
  const [style,       setStyle]       = useState<HumanizedPlanStyle>('imobiliario_premium')
  const [level,       setLevel]       = useState<HumanizedPlanLevel>('equilibrado')
  const [options,     setOptions]     = useState<HumanizedPlanOptions>(HUMANIZED_PLAN_DEFAULT_OPTIONS)
  const [additionalInstructions, setAdditionalInstructions] = useState('')

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

  // O papel de parede é o trabalho em foco: a planta que saiu, ou a que entrou.
  useAmbient(resultUrl ?? imagePreview)

  const styleLabel = HUMANIZED_PLAN_STYLES.find(s => s.id === style)?.label ?? ''
  const levelSpec  = HUMANIZED_PLAN_LEVELS.find(l => l.id === level)
  const typeLabel  = HUMANIZED_PLAN_PROJECT_TYPES.find(t => t.id === projectType)?.label ?? ''
  const onCount    = OPTION_KEYS.filter(k => options[k]).length

  function setOptionsFromLabels(labels: string[]) {
    setOptions(OPTION_KEYS.reduce((acc, key) => {
      acc[key] = labels.includes(OPTION_LABEL[key])
      return acc
    }, {} as HumanizedPlanOptions))
  }

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
    formData.append('image',       imageFile)
    formData.append('projectType', projectType)
    formData.append('style',       style)
    formData.append('level',       level)
    formData.append('options',     JSON.stringify(options))
    if (additionalInstructions.trim()) {
      formData.append('additionalInstructions', additionalInstructions.trim())
    }

    try {
      const res  = await fetch('/api/apresentar/humanized-plan', { method: 'POST', body: formData })
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

          <SettingGroup>
            <SettingRow icon={<RowIcon name="scene" />} title="Cena"
                        value={summarize([typeLabel])}
                        onOpen={() => setSheet('cena')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Estilo"
                        value={summarize([
                          styleLabel,
                          onCount < OPTION_KEYS.length ? `${onCount} de ${OPTION_KEYS.length} elementos` : '',
                        ])}
                        onOpen={() => setSheet('estilo')} />
            <SettingRow icon={<RowIcon name="direction" />} title="Direção"
                        value={summarize([additionalInstructions.trim()])}
                        onOpen={() => setSheet('direcao')} />
          </SettingGroup>

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
                Planta humanizada · {styleLabel} · {levelSpec?.label}
              </span>
              {/* Proxy /api/download força attachment — o atributo download é
                  ignorado cross-origin e abriria a imagem fora do site. */}
              <a className="spn-ghost"
                 style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
                 href={`/api/download?url=${encodeURIComponent(resultUrl)}&filename=spacenode-planta-humanizada.jpg`}>
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

      {/* ── Folhas ─────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'cena'} title="Cena" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Tipo de projeto</span>
          <PillGroup
            label="Tipo de projeto"
            options={TYPE_LABELS}
            value={typeLabel}
            onChange={(label) => {
              const found = HUMANIZED_PLAN_PROJECT_TYPES.find(t => t.label === label)
              if (found) setProjectType(found.id)
            }}
          />
          <p className="spn-hint">Ajusta o repertório de mobiliário e de vegetação.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'estilo'} title="Estilo" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Estilo visual</span>
          <ChoiceGroup
            label="Estilo visual"
            cols={2}
            value={style}
            onChange={setStyle}
            options={HUMANIZED_PLAN_STYLES.map(s => ({ value: s.id, title: s.label, note: s.desc }))}
          />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Elementos</span>
          <MultiPillGroup
            label="Elementos"
            options={OPTION_LABELS}
            values={OPTION_KEYS.filter(k => options[k]).map(k => OPTION_LABEL[k])}
            onChange={setOptionsFromLabels}
          />
          <p className="spn-hint">Tudo ligado é o padrão. Desligue o que não quiser na planta.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'direcao'} title="Direção" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Instruções adicionais</span>
          <textarea
            className="spn-textarea"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value.slice(0, 400))}
            placeholder="Ex.: mobiliário contemporâneo, nomes dos ambientes grandes, sem vegetação, destacar áreas molhadas…"
          />
          <p className="spn-hint">{additionalInstructions.length}/400 — em branco, o estilo decide sozinho.</p>
        </div>
      </Sheet>
    </div>
  )
}
