'use client'

// Fluxo guiado até a primeira imagem — duas telas, nenhuma configuração.
//
// Decisões de produto que este arquivo carrega:
//
// 1. Duas telas, não cinco. Escolher a imagem e gerar são os únicos passos
//    obrigatórios; tudo que o /app/generate expõe (segmento, iluminação,
//    entorno, materiais, motor, resolução) tem default válido e fica fora.
//
// 2. Exemplos prontos. 45% dos cadastros nunca criaram nada — parte deles
//    simplesmente não tinha um arquivo à mão no primeiro acesso. Os exemplos
//    saem de /public (os mesmos da galeria da landing) e já vêm com o tipo de
//    projeto definido, então esse caminho pula direto pro botão de gerar.
//
// 3. Pulsar 2K (15 nodes), não o default Vega 2K (20). O saldo de cadastro é
//    40: com Vega a primeira geração come metade da conta e sobra uma única
//    tentativa. Pulsar é o motor rápido (timeout de 90s contra 180s) e deixa
//    saldo pra errar e tentar de novo — que é o que decide a ativação. A
//    qualidade máxima aparece depois, na tela de resultado, como próximo passo.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getEnvironments, getLighting, getBackgrounds,
  type ProjectType,
} from '@/lib/prompts'
import { getNodesCost } from '@/lib/engines'
import { compressImage } from '@/lib/images/compress-client'

const ENGINE     = 'pulsar' as const
const RESOLUTION = '2k' as const
const NODE_COST  = getNodesCost(ENGINE, RESOLUTION)

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const LOADING_TEXTS = [
  'Lendo a geometria do seu projeto...',
  'Ajustando iluminação...',
  'Refinando materiais...',
  'Aplicando fotorrealismo...',
  'Finalizando sua imagem...',
]

// Exemplos servidos de /public — mesmos arquivos da galeria da landing, que já
// são modelos "antes" de verdade (SketchUp/CAD), não renders prontas.
const EXAMPLES: {
  id: string
  src: string
  label: string
  hint: string
  projectType: ProjectType
}[] = [
  {
    id:          'exterior',
    src:         '/demo-sketch.jpg',
    label:       'Fachada residencial',
    hint:        'Modelo 3D sem textura',
    projectType: 'exterior',
  },
  {
    id:          'interior',
    src:         '/gallery-living-before.jpg',
    label:       'Sala de estar',
    hint:        'Modelo 3D de interior',
    projectType: 'interior',
  },
]

const TYPE_LABEL: Record<ProjectType, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
}

// Taxonomia: os mesmos defaults que o /app/generate aplica, derivados em
// runtime pra não hardcodar strings que vivem em lib/prompts.
function defaultsFor(projectType: ProjectType) {
  const segment = 'Residencial' // existe nas duas taxonomias (interior e exterior)
  return {
    segment,
    environment: getEnvironments(projectType, segment)[0] ?? '',
    lighting:    getLighting(projectType, segment)[0] ?? '',
    background:  getBackgrounds(projectType)[0] ?? 'Preservar Original',
  }
}

type Phase = 'imagem' | 'gerar' | 'gerando' | 'pronto'

export default function FirstRunClient({
  firstName,
  availableNodes,
}: {
  firstName:      string
  availableNodes: number
}) {
  const router = useRouter()

  const [phase,       setPhase]       = useState<Phase>('imagem')
  const [imageData,   setImageData]   = useState<string | null>(null)
  const [projectType, setProjectType] = useState<ProjectType>('exterior')
  const [outputUrl,   setOutputUrl]   = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [noBalance,   setNoBalance]   = useState(false)
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0])
  const [dragging,    setDragging]    = useState(false)
  const [preparing,   setPreparing]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Encerra o fluxo pro servidor: o /app para de redirecionar pra cá. Vale
  // tanto pra quem gerou quanto pra quem dispensou — best-effort, um erro aqui
  // só faz o fluxo se oferecer de novo na próxima visita.
  const markDone = useCallback(async () => {
    try {
      await fetch('/api/users/me/first-run', { method: 'POST' })
    } catch {}
  }, [])

  const skip = useCallback(async () => {
    await markDone()
    router.push('/app')
  }, [markDone, router])

  // Texto rotativo durante a geração — o Pulsar 2K leva algumas dezenas de
  // segundos e a tela precisa dar sinal de vida.
  useEffect(() => {
    if (phase !== 'gerando') return
    let i = 0
    const id = window.setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length
      setLoadingText(LOADING_TEXTS[i])
    }, 4200)
    return () => clearInterval(id)
  }, [phase])

  const acceptFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Esse arquivo não é uma imagem. Use JPG, PNG ou WebP.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Imagem acima de 15 MB. Exporte em tamanho menor e tente de novo.')
      return
    }
    setPreparing(true)
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('READ_FAILED'))
        reader.readAsDataURL(file)
      })
      setImageData(await compressImage(raw))
      setPhase('gerar')
    } catch {
      setError('Não consegui ler essa imagem. Tente outro arquivo.')
    } finally {
      setPreparing(false)
    }
  }, [])

  // Exemplo: baixa o arquivo de /public e segue pelo mesmo caminho do upload
  // (base64), então funciona igual em produção e em dev — sem depender de a
  // Fal.ai conseguir acessar a URL pública.
  const pickExample = useCallback(async (example: (typeof EXAMPLES)[number]) => {
    setError(null)
    setPreparing(true)
    try {
      const res  = await fetch(example.src)
      const blob = await res.blob()
      const raw  = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('READ_FAILED'))
        reader.readAsDataURL(blob)
      })
      setImageData(await compressImage(raw))
      setProjectType(example.projectType)
      setPhase('gerar')
    } catch {
      setError('Não consegui carregar o exemplo. Tente enviar uma imagem sua.')
    } finally {
      setPreparing(false)
    }
  }, [])

  const generate = useCallback(async () => {
    if (!imageData) return
    setError(null)
    setNoBalance(false)
    setPhase('gerando')
    setLoadingText(LOADING_TEXTS[0])
    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageData,
          projectType,
          ...defaultsFor(projectType),
          fidelityLevel: 'maximum',
          engine:        ENGINE,
          resolution:    RESOLUTION,
        }),
      })
      const data = await res.json() as { outputUrl?: string; error?: string }
      if (res.status === 402) {
        setNoBalance(true)
        setError(data.error ?? 'Saldo insuficiente para gerar.')
        setPhase('gerar')
        return
      }
      if (!res.ok || data.error || !data.outputUrl) {
        throw new Error(data.error ?? 'Erro na geração')
      }
      setOutputUrl(data.outputUrl)
      setPhase('pronto')
      void markDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido na geração.')
      setPhase('gerar')
    }
  }, [imageData, projectType, markDone])

  const resetImage = () => {
    setImageData(null)
    setOutputUrl(null)
    setError(null)
    setNoBalance(false)
    setPhase('imagem')
  }

  const stepIndex = phase === 'imagem' ? 0 : 1

  return (
    <main className="spn-fr-main">
      <div className="spn-fr-wrap">

        {/* ── Cabeçalho + progresso ───────────────────────────────────────── */}
        <header className="spn-fr-head">
          <div className="spn-fr-steps" aria-label="Progresso">
            {['Sua imagem', 'Gerar'].map((label, i) => (
              <span
                key={label}
                className={i === stepIndex ? 'spn-fr-step spn-fr-step--on' : 'spn-fr-step'}
              >
                <span className="spn-fr-step-num">{i + 1}</span>
                {label}
              </span>
            ))}
          </div>

          <h1 className="spn-fr-title">
            {phase === 'pronto'
              ? 'Pronto — essa é sua primeira imagem.'
              : `Vamos gerar sua primeira imagem, ${firstName}.`}
          </h1>
          <p className="spn-fr-sub">
            {phase === 'pronto'
              ? 'Ela já está salva no seu histórico. Daqui dá pra baixar, refinar em qualidade máxima ou começar um projeto.'
              : 'Dois passos, sem configurar nada. Você escolhe a imagem, a gente cuida do resto.'}
          </p>
        </header>

        {/* ── 1 · Escolha da imagem ───────────────────────────────────────── */}
        {phase === 'imagem' && (
          <section className="spn-fr-card">
            <div
              className={dragging ? 'spn-fr-drop spn-fr-drop--over' : 'spn-fr-drop'}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void acceptFile(file)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            >
              <span className="spn-fr-drop-icon" aria-hidden>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </span>
              <div className="spn-fr-drop-title">
                {preparing ? 'Preparando sua imagem...' : 'Arraste sua imagem aqui'}
              </div>
              <div className="spn-fr-drop-desc">
                Print do modelo 3D, planta, sketch ou foto do espaço — JPG, PNG ou WebP até 15 MB.
              </div>
              <span className="spn-fr-drop-btn">Escolher arquivo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void acceptFile(file)
                  e.target.value = ''
                }}
              />
            </div>

            <div className="spn-fr-or"><span>ou comece por um exemplo nosso</span></div>

            <div className="spn-fr-examples">
              {EXAMPLES.map(ex => (
                <button
                  key={ex.id}
                  type="button"
                  className="spn-fr-example"
                  onClick={() => void pickExample(ex)}
                  disabled={preparing}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ex.src} alt={ex.label} />
                  <span className="spn-fr-example-body">
                    <span className="spn-fr-example-label">{ex.label}</span>
                    <span className="spn-fr-example-hint">{ex.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="spn-fr-error">{error}</p>}
          </section>
        )}

        {/* ── 2 · Confirmar e gerar ───────────────────────────────────────── */}
        {(phase === 'gerar' || phase === 'gerando') && imageData && (
          <section className="spn-fr-card">
            <div className="spn-fr-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageData} alt="Imagem escolhida" className="spn-fr-stage-img" />
              {phase === 'gerando' && (
                <div className="spn-fr-overlay">
                  <span className="spn-fr-spinner" aria-hidden />
                  <span className="spn-fr-overlay-text">{loadingText}</span>
                  <span className="spn-fr-overlay-hint">Costuma levar menos de um minuto.</span>
                </div>
              )}
            </div>

            {phase === 'gerar' && (
              <>
                <div className="spn-fr-typerow">
                  <span className="spn-fr-typelabel">Este projeto é</span>
                  <div className="spn-fr-typebtns">
                    {(['exterior', 'interior'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={projectType === t}
                        className={projectType === t ? 'spn-fr-typebtn spn-fr-typebtn--on' : 'spn-fr-typebtn'}
                        onClick={() => setProjectType(t)}
                      >
                        {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="spn-fr-error">
                    {error}
                    {noBalance && (
                      <> <Link href="/app/billing" className="spn-fr-error-link">Ver planos →</Link></>
                    )}
                  </p>
                )}

                <button type="button" className="spn-fr-cta" onClick={() => void generate()}>
                  Gerar minha primeira imagem
                  <span className="spn-fr-cta-cost">{NODE_COST} nodes</span>
                </button>

                <div className="spn-fr-foot">
                  <button type="button" className="spn-fr-link" onClick={resetImage}>
                    Trocar imagem
                  </button>
                  <span className="spn-fr-foot-sep" aria-hidden>·</span>
                  <span>
                    Você tem {availableNodes} nodes. Sobram {Math.max(0, availableNodes - NODE_COST)} depois desta.
                  </span>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── 3 · Resultado ───────────────────────────────────────────────── */}
        {phase === 'pronto' && outputUrl && imageData && (
          <section className="spn-fr-card">
            <div className="spn-fr-compare">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageData} alt="Imagem original" />
                <figcaption>Sua referência</figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputUrl} alt="Imagem gerada" />
                <figcaption>Gerada pelo Spacenode</figcaption>
              </figure>
            </div>

            <div className="spn-fr-done-actions">
              <a
                className="spn-fr-cta"
                href={`/api/download?url=${encodeURIComponent(outputUrl)}&filename=${encodeURIComponent('spacenode-primeira-imagem.jpg')}`}
              >
                Baixar imagem
              </a>
              <Link href={`/app/generate?source=${encodeURIComponent(outputUrl)}`} className="spn-btn-ghost">
                Refinar em qualidade máxima
              </Link>
              <Link href="/app" className="spn-btn-ghost">
                Ir para o atelier
              </Link>
            </div>

            <p className="spn-fr-next">
              Próximo passo natural: transformar isso num <strong>projeto</strong> — aí cada
              nova vista preserva os materiais e a geometria desta imagem.{' '}
              <Link href="/app/spaces/new" className="spn-fr-error-link">Criar projeto →</Link>
            </p>
          </section>
        )}

        {/* Saída sempre disponível — o fluxo não pode virar armadilha. */}
        {phase !== 'pronto' && (
          <button type="button" className="spn-fr-skip" onClick={() => void skip()}>
            Pular e ir direto para o atelier
          </button>
        )}
      </div>
    </main>
  )
}
