'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  ChoiceGroup,
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
  MOODBOARD_AMBIENTS,
  MOODBOARD_STYLES,
  MOODBOARD_PALETTES,
  MOODBOARD_LEVELS,
  MOODBOARD_FORMATS,
  type MoodboardAmbient,
  type MoodboardStyle,
  type MoodboardPalette,
  type MoodboardLevel,
  type MoodboardFormat,
  type MoodboardResult,
} from '@/lib/apresentar/config'
import MoodboardCanvas from './MoodboardCanvas'
import { svgElementToPngBlob, downloadBlob } from '@/lib/apresentar/svg-to-png'
import { useObjectUrls } from '@/lib/browser/object-url'

interface Props {
  initialCredits: number
  studioName?:    string | null
}

const TOOL = APRESENTAR_TOOLS.moodboard

const LOADING_TEXTS = [
  'Analisando referências…',
  'Compondo paleta de cores…',
  'Selecionando materiais…',
  'Escrevendo conceito visual…',
  'Refinando moodboard…',
]

/* As pílulas do kit mostram a própria string que recebem; os presets são
   pares id/label. Converte-se nas bordas — o id é o que viaja na API. */
const AMBIENT_LABELS = MOODBOARD_AMBIENTS.map(a => a.label)
const STYLE_LABELS   = MOODBOARD_STYLES.map(s => s.label)
const PALETTE_LABELS = MOODBOARD_PALETTES.map(p => p.label)

type SheetId = 'cena' | 'estilo' | 'saida'

export default function MoodboardClient({ initialCredits, studioName: initialStudio = null }: Props) {
  // Entrada
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // Governa as URLs de blob das prévias: revoga a que sai e varre o resto
  // ao desmontar (uma object URL segura o arquivo em memória até alguém soltar).
  const objectUrls = useObjectUrls()
  const [projectName,  setProjectName]  = useState('')

  // Presets — mesmos nomes e tipos que viajam para /api/apresentar/moodboard
  const [ambient, setAmbient] = useState<MoodboardAmbient>('sala')
  const [style,   setStyle]   = useState<MoodboardStyle>('contemporaneo')
  const [palette, setPalette] = useState<MoodboardPalette>('neutra')
  const [level,   setLevel]   = useState<MoodboardLevel>('comercial')
  const [format,  setFormat]  = useState<MoodboardFormat>('portrait')

  const [sheet, setSheet] = useState<SheetId | null>(null)

  // Geração
  const [isLoading,   setIsLoading]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [result,      setResult]      = useState<MoodboardResult | null>(null)
  const [studioName,  setStudioName]  = useState<string | null>(initialStudio)
  const [credits,     setCredits]     = useState(initialCredits)
  const [error,       setError]       = useState<string | null>(null)

  // Export
  const [isExporting, setIsExporting] = useState(false)

  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasHostRef   = useRef<HTMLDivElement | null>(null)

  const nodeCost = TOOL.nodes ?? 0
  // Imagem é opcional — sempre dá pra gerar usando só os presets.
  const canSubmit = credits >= nodeCost && !isLoading

  // O papel de parede é o trabalho em foco: a capa que saiu, ou a referência
  // que entrou.
  useAmbient(result?.coverUrl ?? imagePreview)

  const ambientLabel = MOODBOARD_AMBIENTS.find(a => a.id === ambient)?.label ?? ''
  const styleLabel   = MOODBOARD_STYLES.find(s => s.id === style)?.label ?? ''
  const paletteLabel = MOODBOARD_PALETTES.find(p => p.id === palette)?.label ?? ''
  const levelSpec    = MOODBOARD_LEVELS.find(l => l.id === level)
  const formatSpec   = MOODBOARD_FORMATS.find(f => f.id === format)!

  function loadImageFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('O arquivo deve ser uma imagem.'); return }
    if (file.size > 20 * 1024 * 1024)    { setError('Imagem muito grande. Máximo 20 MB.'); return }

    setImageFile(file)
    setResult(null)
    setError(null)

    // Object URL, não data URL — ver lib/browser/object-url.ts.
    objectUrls.revoke(imagePreview)
    setImagePreview(objectUrls.create(file))
  }

  function resetImage() {
    objectUrls.revoke(imagePreview)
    setImageFile(null)
    setImagePreview(null)
  }

  function startLoadingTexts() {
    let i = 0
    setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 1500)
  }

  function stopLoadingTexts() {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    startLoadingTexts()

    try {
      const fd = new FormData()
      if (imageFile)          fd.append('image',       imageFile)
      if (projectName.trim()) fd.append('projectName', projectName.trim())
      fd.append('ambient', ambient)
      fd.append('style',   style)
      fd.append('palette', palette)
      fd.append('level',   level)
      fd.append('format',  format)

      const res  = await fetch('/api/apresentar/moodboard', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erro ao gerar moodboard')
        return
      }
      setResult(data.result as MoodboardResult)
      if (data.studioName && !studioName) setStudioName(data.studioName)
      if (typeof data.creditsRemaining === 'number') setCredits(data.creditsRemaining)
      else setCredits((c) => Math.max(0, c - nodeCost))
    } catch {
      setError('Falha de conexão. Tente novamente.')
    } finally {
      stopLoadingTexts()
      setIsLoading(false)
    }
  }

  async function handleDownload() {
    if (!result || !canvasHostRef.current) return
    const svg = canvasHostRef.current.querySelector('svg') as SVGSVGElement | null
    if (!svg) return

    setIsExporting(true)
    setError(null)
    try {
      const blob = await svgElementToPngBlob(svg, formatSpec.width, formatSpec.height)
      const safeName = (projectName.trim() || result.title || 'moodboard')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'moodboard'
      downloadBlob(blob, `${safeName}-${format}.png`)
    } catch (e) {
      setError(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="spn-tool">
      {/* ── Painel ─────────────────────────────────────────────────────────── */}
      <div className="spn-tool-panel spn-glass spn-glass--chrome">
        <ToolHeader
          title={TOOL.name}
          desc="Paleta, materiais e conceito escrito — a direção visual do projeto numa prancha só."
        />

        <div className="spn-tool-panel-body">
          <div className="spn-field">
            <span className="spn-field-label">Referência (opcional)</span>
            <SourceDrop
              height={110}
              preview={imagePreview}
              label="Arraste uma imagem ou render de referência"
              note="Sem ela, os presets decidem sozinhos"
              meta={imageFile ? formatFileSize(imageFile.size) : ''}
              onFile={loadImageFile}
              onClear={resetImage}
            />
          </div>

          {/* O nível reconfigura o tom de tudo o mais — fica na superfície. */}
          <div className="spn-field">
            <span className="spn-field-label">Nível</span>
            <Segmented
              label="Nível"
              value={level}
              onChange={setLevel}
              items={MOODBOARD_LEVELS.map(l => ({ value: l.id, label: l.label }))}
            />
            {levelSpec ? <p className="spn-hint">{levelSpec.desc}</p> : null}
          </div>

          <SettingGroup>
            <SettingRow icon={<RowIcon name="scene" />} title="Cena"
                        value={summarize([ambientLabel])}
                        onOpen={() => setSheet('cena')} />
            <SettingRow icon={<RowIcon name="materials" />} title="Estilo"
                        value={summarize([styleLabel, paletteLabel])}
                        onOpen={() => setSheet('estilo')} />
            <SettingRow icon={<RowIcon name="output" />} title="Saída"
                        value={summarize([formatSpec.label, projectName.trim()])}
                        onOpen={() => setSheet('saida')} />
          </SettingGroup>

          {error ? <div className="spn-error" style={{ marginTop: 14 }}>{error}</div> : null}
        </div>

        <CostDock cost={nodeCost} balance={credits}>
          <button type="button" className="spn-cta" onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading
              ? 'Gerando…'
              : credits < nodeCost
              ? 'Saldo insuficiente'
              : result
              ? 'Gerar de novo'
              : TOOL.ctaLabel}
          </button>
        </CostDock>
      </div>

      {/* ── Palco ──────────────────────────────────────────────────────────── */}
      <div className="spn-tool-stage spn-glass">
        {isLoading ? <StageLoading label={loadingText} /> : null}

        {!isLoading && !result ? (
          <div className="spn-empty" style={{ maxWidth: 360 }}>
            Seu moodboard aparece aqui.
            <br />
            Escolha ambiente, estilo e paleta — a referência é opcional.
          </div>
        ) : null}

        {!isLoading && result ? (
          <ResultView
            result={result}
            format={format}
            studioName={studioName}
            projectName={projectName.trim() || undefined}
            canvasHostRef={canvasHostRef}
            onDownload={handleDownload}
            isExporting={isExporting}
          />
        ) : null}
      </div>

      {/* ── Folhas ─────────────────────────────────────────────────────────── */}
      <Sheet open={sheet === 'cena'} title="Cena" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Ambiente</span>
          <PillGroup
            label="Ambiente"
            options={AMBIENT_LABELS}
            value={ambientLabel}
            onChange={(label) => {
              const found = MOODBOARD_AMBIENTS.find(a => a.label === label)
              if (found) setAmbient(found.id)
            }}
          />
        </div>
      </Sheet>

      <Sheet open={sheet === 'estilo'} title="Estilo" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Linguagem</span>
          <PillGroup
            label="Estilo"
            options={STYLE_LABELS}
            value={styleLabel}
            onChange={(label) => {
              const found = MOODBOARD_STYLES.find(s => s.label === label)
              if (found) setStyle(found.id)
            }}
          />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Paleta</span>
          <PillGroup
            label="Paleta"
            options={PALETTE_LABELS}
            value={paletteLabel}
            onChange={(label) => {
              const found = MOODBOARD_PALETTES.find(p => p.label === label)
              if (found) setPalette(found.id)
            }}
          />
        </div>
      </Sheet>

      <Sheet open={sheet === 'saida'} title="Saída" onClose={() => setSheet(null)}>
        <div className="spn-field">
          <span className="spn-field-label">Formato</span>
          <ChoiceGroup
            label="Formato"
            cols={3}
            value={format}
            onChange={setFormat}
            options={MOODBOARD_FORMATS.map(f => ({ value: f.id, title: f.label, note: f.desc }))}
          />
        </div>
        <div className="spn-field">
          <span className="spn-field-label">Nome do projeto</span>
          <input
            className="spn-input"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Ex.: Cobertura Itaim"
          />
          <p className="spn-hint">
            Aparece no rodapé da prancha.{' '}
            {studioName
              ? `No cabeçalho vai ${studioName}.`
              : (
                <>
                  O cabeçalho fica vazio até você configurar a{' '}
                  <Link href="/app/settings/identity" style={{ color: 'var(--color-text-secondary)' }}>
                    identidade do estúdio
                  </Link>.
                </>
              )}
          </p>
        </div>
      </Sheet>
    </div>
  )
}

// ── Resultado ───────────────────────────────────────────────────────────────
//
// O host do canvas mantém o fundo #1a1612 chapado de propósito: é cor de
// artefato IMPRESSO, não do app. E nada de vidro dentro do SVG — ele é
// serializado para PNG por lib/apresentar/svg-to-png.ts, e backdrop-filter
// não sobrevive à serialização (a tela e o arquivo exportado divergiriam).

function ResultView({
  result, format, studioName, projectName,
  canvasHostRef, onDownload, isExporting,
}: {
  result:        MoodboardResult
  format:        MoodboardFormat
  studioName:    string | null
  projectName?:  string
  canvasHostRef: React.RefObject<HTMLDivElement | null>
  onDownload:    () => void
  isExporting:   boolean
}) {
  const formatSpec = MOODBOARD_FORMATS.find(f => f.id === format)!

  return (
    <div style={{
      alignSelf: 'stretch', flex: 1, minHeight: 0, overflowY: 'auto',
      padding: '20px 24px 32px',
    }}>
      <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <span className="spn-field-label">Moodboard · {formatSpec.label}</span>
            <h2 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}>
              {result.title}
            </h2>
            <div className="spn-pills" style={{ marginTop: 10 }}>
              {result.tags.map((t) => (
                <span key={t} className="spn-pill" style={{ cursor: 'default' }}>{t}</span>
              ))}
            </div>
          </div>
          <button type="button" className="spn-ghost" onClick={onDownload} disabled={isExporting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
            <DownloadIcon />
            {isExporting ? 'Exportando…' : `Baixar PNG ${formatSpec.width}×${formatSpec.height}`}
          </button>
        </div>

        {/* Preview do canvas — host com o SVG escalado para o container. */}
        <div ref={canvasHostRef} style={{
          width: '100%',
          aspectRatio: `${formatSpec.width} / ${formatSpec.height}`,
          maxHeight: '64vh',
          margin: '0 auto',
          borderRadius: 'var(--r-inner)', overflow: 'hidden',
          border: '0.5px solid var(--glass-line)',
          background: '#1a1612',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MoodboardCanvas
            format={format}
            result={result}
            studioName={studioName ?? undefined}
            projectName={projectName}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <ResultPanel title="Paleta">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.palette.map((s) => (
                <div key={s.hex} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: s.hex, border: '0.5px solid var(--glass-line-strong)',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>{s.name}</div>
                    <div style={{
                      fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}>
                      {s.hex.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ResultPanel>

          <ResultPanel title="Conceito">
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              {result.concept}
            </p>
          </ResultPanel>
        </div>

        <ResultPanel title="Materiais sugeridos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
            {result.materials.map((m, i) => (
              <div key={`${m.category}-${i}`} className="spn-glass spn-glass--raised"
                   style={{ padding: '11px 13px', borderRadius: 'var(--r-inner)' }}>
                <span className="spn-field-label" style={{ marginBottom: 5 }}>{m.category}</span>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>{m.name}</div>
                {m.note ? <p className="spn-hint" style={{ marginTop: 3 }}>{m.note}</p> : null}
              </div>
            ))}
          </div>
        </ResultPanel>
      </div>
    </div>
  )
}

function ResultPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="spn-glass" style={{ borderRadius: 'var(--r-card)', padding: '16px 18px' }}>
      <span className="spn-field-label" style={{ marginBottom: 12 }}>{title}</span>
      {children}
    </section>
  )
}
