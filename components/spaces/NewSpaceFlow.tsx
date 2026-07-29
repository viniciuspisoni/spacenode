'use client'

// Fluxo de criação de Space — multi-step state machine.
//   form       (Etapa 1 de 2: nome, categoria, motor)
//   upload     (Etapa 2 de 2: Vista Mestre + Analisar)
//   analyzing  (overlay full-screen, 8 nodes debitados)
//   reveal     (DNA exibido, "Travar DNA" final)
//   error      (estado terminal recuperável)
//
// Cada transição faz uma chamada de API. Estado vive 100% no cliente até
// o lock; depois redireciona pra /app/spaces/[id].

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ENGINES, ENGINE_ORDER, type EngineId } from '@/lib/engines'
import { EngineIcon } from '@/components/icons/engines'
import type { SpaceCategory, ProjectDNA } from '@/lib/spaces/types'
import { DNA_EXTRACTION_COST } from '@/lib/spaces/economy'
import { DnaPanel } from './DnaPanel'
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'

type Step = 'form' | 'upload' | 'analyzing' | 'reveal'

// Reduz uma imagem hospedada a um File adequado à Vista Mestre.
// O DNA é extraído por visão, então não precisamos da resolução cheia (que em
// ampliações 8×/Ultra passa dos 15 MB aceitos pelo upload). Limitamos o maior
// lado a MAX_DIM e reexportamos em JPEG. Imagens já pequenas passam sem reencode.
const MASTER_MAX_DIM = 2560

async function sourceUrlToMasterFile(url: string): Promise<File | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  const blob = await res.blob()

  const bitmap = await createImageBitmap(blob).catch(() => null)
  if (!bitmap) return null

  const { width, height } = bitmap
  const longest = Math.max(width, height)

  // Já dentro do limite de dimensão e de tamanho → mantém o original.
  if (longest <= MASTER_MAX_DIM && blob.size <= 14 * 1024 * 1024) {
    bitmap.close?.()
    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg'
    return new File([blob], `ampliada.${type.split('/')[1]}`, { type })
  }

  const scale = Math.min(1, MASTER_MAX_DIM / longest)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); return null }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const outBlob: Blob | null = await new Promise(resolve =>
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92),
  )
  if (!outBlob) return null
  return new File([outBlob], 'ampliada.jpg', { type: 'image/jpeg' })
}

const CATEGORIES: { id: SpaceCategory; label: string; description: string; defaultEngine: EngineId; icon: React.ReactNode }[] = [
  {
    id: 'residencial', label: 'Residencial',
    description: 'Casas, apartamentos, ambientes íntimos',
    defaultEngine: 'quasar',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  {
    id: 'comercial', label: 'Comercial',
    description: 'Escritórios, lojas, hospitalidade',
    defaultEngine: 'vega',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
  },
  {
    id: 'conceito', label: 'Conceito',
    description: 'Estudo, ideação, pavilhões',
    defaultEngine: 'pulsar',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M3 12h18"/></svg>,
  },
]

interface NewSpaceFlowProps {
  initialBalance: number
  /** URL https de uma imagem a pré-carregar como Vista Mestre (ex.: "Usar no Spaces" após Ampliar). */
  sourceUrl?: string
}

export function NewSpaceFlow({ initialBalance, sourceUrl }: NewSpaceFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('form')

  // Form data
  const [name, setName] = useState('')
  const [category, setCategory] = useState<SpaceCategory>('residencial')
  const [engine, setEngine] = useState<EngineId>('quasar')
  const [engineTouched, setEngineTouched] = useState(false)

  // Upload
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Pipeline state
  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [vistaMestreUrl, setVistaMestreUrl] = useState<string | null>(null)
  const [dna, setDna] = useState<ProjectDNA | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Pre-seleção de motor por categoria — só se user não tocou no engine
  function pickCategory(c: SpaceCategory) {
    setCategory(c)
    if (!engineTouched) {
      const def = CATEGORIES.find(cat => cat.id === c)?.defaultEngine ?? 'vega'
      setEngine(def)
    }
  }

  // Insufficient balance pra Sprint 1
  const balanceShort = initialBalance < DNA_EXTRACTION_COST

  // ── Step transitions ──────────────────────────────────────────

  async function handleContinueFromForm() {
    setError(null)
    if (!name.trim()) return setError('Dê um nome ao projeto antes de continuar')
    setSubmitting(true)
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, engine }),
      })
      const data = await jsonOrNull(res)
      const space = data?.space as { id?: string } | undefined
      if (!res.ok || typeof space?.id !== 'string') throw new Error(errMsg(data, 'Erro ao criar Space'))
      setSpaceId(space.id)
      setStep('upload')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAnalyze() {
    if (!file || !spaceId) return
    if (balanceShort) {
      setError(`Saldo insuficiente. Necessários ${DNA_EXTRACTION_COST} nodes.`)
      return
    }
    setError(null)
    setSubmitting(true)
    setStep('analyzing')

    try {
      // 1. signed upload URL — o arquivo vai direto pro Storage, sem passar
      //    pela Vercel (Functions rejeitam corpo > 4,5 MB com 413 texto puro)
      const signRes = await fetch(`/api/spaces/${spaceId}/upload-vista-mestre/sign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      })
      const signData = await jsonOrNull(signRes)
      const bucket = signData?.bucket
      const key    = signData?.key
      const token  = signData?.token
      if (!signRes.ok || typeof bucket !== 'string' || typeof key !== 'string' || typeof token !== 'string') {
        throw new Error(errMsg(signData, 'Erro ao preparar upload'))
      }

      // 2. PUT direto browser → Supabase Storage
      const supabase = createClient()
      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(key, token, file, { contentType: file.type })
      if (uploadErr) {
        throw new Error('Erro ao enviar a imagem. Verifique a conexão e tente novamente.')
      }

      // 3. confirma o upload e grava a referência no Space
      const confirmRes = await fetch(`/api/spaces/${spaceId}/upload-vista-mestre/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key }),
      })
      const confirmData = await jsonOrNull(confirmRes)
      const url = confirmData?.url
      if (!confirmRes.ok || typeof url !== 'string') {
        throw new Error(errMsg(confirmData, 'Erro ao salvar imagem'))
      }
      setVistaMestreUrl(url)

      // 4. extract DNA (debits 8 nodes)
      const dnaRes = await fetch(`/api/spaces/${spaceId}/extract-dna`, { method: 'POST' })
      const dnaData = await jsonOrNull(dnaRes)
      if (!dnaRes.ok) {
        if (dnaRes.status === 402) {
          throw new Error(typeof dnaData?.message === 'string' ? dnaData.message : 'Saldo insuficiente')
        }
        throw new Error(errMsg(dnaData, 'Falha na análise'))
      }
      if (!dnaData?.dna) throw new Error('Falha na análise')

      setDna(dnaData.dna as ProjectDNA)
      setStep('reveal')
    } catch (e) {
      setError((e as Error).message)
      setStep('upload') // volta pra etapa de upload com erro
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLock() {
    if (!spaceId) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/spaces/${spaceId}/lock`, { method: 'POST' })
      const data = await jsonOrNull(res)
      if (!res.ok) throw new Error(errMsg(data, 'Erro ao travar Space'))
      router.push(`/app/spaces/${spaceId}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // File picker handlers
  function onFilePicked(f: File | null) {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Formato não suportado. Use JPG, PNG ou WebP.')
      return
    }
    if (f.size > 15 * 1024 * 1024) {
      setError('Imagem maior que 15 MB.')
      return
    }
    setError(null)
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
  }

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [previewUrl])

  // Pré-carga via ?source= (ex.: "Usar no Spaces" após Ampliar). URL hospedada
  // → File → preview. Confia no próprio output (sem checar limite de tamanho).
  const sourcePreloadedRef = useRef(false)
  useEffect(() => {
    if (sourcePreloadedRef.current || !sourceUrl) return
    if (!/^https:\/\//i.test(sourceUrl)) return
    sourcePreloadedRef.current = true
    ;(async () => {
      try {
        const f = await sourceUrlToMasterFile(sourceUrl)
        if (!f) return
        setFile(f)
        setPreviewUrl(URL.createObjectURL(f))
      } catch {
        // Silencioso: o usuário ainda pode subir a imagem manualmente.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>
      {step === 'form' && (
        <FormStep
          name={name} setName={setName}
          category={category} pickCategory={pickCategory}
          engine={engine} setEngine={(e) => { setEngine(e); setEngineTouched(true) }}
          onContinue={handleContinueFromForm}
          submitting={submitting}
          error={error}
        />
      )}
      {step === 'upload' && (
        <UploadStep
          file={file} previewUrl={previewUrl} fileInputRef={fileInputRef}
          onFilePicked={onFilePicked}
          onAnalyze={handleAnalyze}
          balance={initialBalance}
          balanceShort={balanceShort}
          submitting={submitting}
          error={error}
        />
      )}
      {step === 'analyzing' && (
        <AnalyzingStep previewUrl={previewUrl} />
      )}
      {step === 'reveal' && dna && vistaMestreUrl && (
        <RevealStep
          dna={dna}
          vistaMestreUrl={vistaMestreUrl}
          onLock={handleLock}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  )
}

// ── Step 1 · form ─────────────────────────────────────────────

function FormStep(props: {
  name: string; setName: (v: string) => void
  category: SpaceCategory; pickCategory: (c: SpaceCategory) => void
  engine: EngineId; setEngine: (e: EngineId) => void
  onContinue: () => void
  submitting: boolean
  error: string | null
}) {
  const { name, setName, category, pickCategory, engine, setEngine, onContinue, submitting, error } = props

  return (
    <>
      <StepHeader index={1} total={2} title="Criar novo projeto" subtitle="Cada projeto é um Space — ele guarda o DNA visual que todas as vistas vão preservar." />

      <Section label="Nome do projeto">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Casa Campo, Apartamento Rio Branco"
          maxLength={80}
          style={{
            width: '100%', padding: '14px 16px',
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 10, color: 'var(--color-text-primary)',
            fontSize: 14, letterSpacing: '-0.01em',
            outline: 'none',
          }}
        />
      </Section>

      <Section label="Categoria">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {CATEGORIES.map(cat => (
            <SelectableCard
              key={cat.id}
              selected={category === cat.id}
              onClick={() => pickCategory(cat.id)}
              icon={cat.icon}
              label={cat.label}
              description={cat.description}
            />
          ))}
        </div>
      </Section>

      <Section
        label="Motor"
        helper="O motor fica gravado no projeto pra manter coerência. Trocar depois exige re-extração de DNA."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {ENGINE_ORDER.map(eId => {
            const cfg = ENGINES[eId]
            return (
              <SelectableCard
                key={eId}
                selected={engine === eId}
                onClick={() => setEngine(eId)}
                icon={<EngineIcon engine={eId} width={22} height={22} />}
                label={cfg.name}
                tag={cfg.tagline}
                description={cfg.description}
              />
            )
          })}
        </div>
      </Section>

      {error && <ErrorBox message={error} />}

      <Footer
        leftLabel={`Etapa 1 de 2`}
        right={
          <button
            onClick={onContinue}
            disabled={!name.trim() || submitting}
            className="spn-action spn-action--primary"
            style={{ width: 'auto', minWidth: 180, padding: '12px 24px' }}
          >
            {submitting ? 'Criando…' : 'Continuar →'}
          </button>
        }
      />
    </>
  )
}

// ── Step 2 · upload ───────────────────────────────────────────

function UploadStep(props: {
  file: File | null; previewUrl: string | null
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>
  onFilePicked: (f: File | null) => void
  onAnalyze: () => void
  balance: number
  balanceShort: boolean
  submitting: boolean
  error: string | null
}) {
  const { file, previewUrl, fileInputRef, onFilePicked, onAnalyze, balance, balanceShort, submitting, error } = props
  const [dragOver, setDragOver] = useState(false)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    onFilePicked(f ?? null)
  }

  return (
    <>
      <StepHeader index={2} total={2} title="Vista Mestre" subtitle="A imagem que define o DNA visual do projeto." />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => onFilePicked(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          aspectRatio: '4 / 3',
          background: dragOver ? 'rgba(48,209,88,0.04)' : 'var(--color-bg-elevated)',
          border: dragOver
            ? '1.5px dashed var(--color-accent-green)'
            : '0.5px dashed var(--color-border-strong)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', overflow: 'hidden',
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Vista Mestre"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 32,
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', letterSpacing: '-0.01em' }}>
              Solte a imagem ou clique para selecionar
            </div>
            <div style={{ fontSize: 11, letterSpacing: '0.02em' }}>
              JPG, PNG ou WebP · até 15 MB
            </div>
          </div>
        )}
        {file && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            padding: '6px 10px', borderRadius: 6,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            fontSize: 11, color: '#fff',
          }}>
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </div>
        )}
      </div>

      {file && (
        <div style={{
          marginTop: 12, fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center',
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
          >
            Trocar imagem
          </button>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      <Footer
        leftLabel={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span>Etapa 2 de 2</span>
            <span style={{
              padding: '3px 8px', borderRadius: 999,
              background: balanceShort ? 'rgba(163,45,45,0.18)' : 'var(--color-surface)',
              color: balanceShort ? '#e57373' : 'var(--color-text-tertiary)',
              fontSize: 10, letterSpacing: '0.02em',
            }}>
              {balance} nodes disponíveis
            </span>
          </span>
        }
        right={
          <button
            onClick={onAnalyze}
            disabled={!file || submitting || balanceShort}
            className="spn-action spn-action--primary"
            style={{ width: 'auto', minWidth: 220, padding: '12px 24px' }}
          >
            Analisar · {DNA_EXTRACTION_COST} nodes
          </button>
        }
      />

      {balanceShort && (
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          Você precisa de {DNA_EXTRACTION_COST} nodes pra extrair o DNA.{' '}
          <Link href="/app/billing" style={{ color: 'var(--color-accent-green)' }}>
            Ver planos →
          </Link>
        </div>
      )}
    </>
  )
}

// ── Step 3 · analyzing (overlay) ──────────────────────────────

const ANALYZING_PHASES = [
  'Analisando estilo arquitetônico…',
  'Identificando materiais dominantes…',
  'Mapeando paleta cromática…',
  'Detectando contexto e ambiente…',
]

function AnalyzingStep({ previewUrl }: { previewUrl: string | null }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % ANALYZING_PHASES.length), 3500)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
      paddingTop: 48,
    }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 540,
        aspectRatio: '4 / 3', borderRadius: 14, overflow: 'hidden',
        background: 'var(--color-bg-elevated)',
      }}>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {/* Overlay scan */}
        <div className="dna-scan" />
        <div style={{
          position: 'absolute', top: 14, left: 14,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: '#46d191', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          padding: '5px 10px', borderRadius: 4,
        }}>
          analisando
        </div>
      </div>

      <div style={{ textAlign: 'center', minHeight: 60 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.01em', marginBottom: 8,
          transition: 'opacity 300ms',
        }}>
          {ANALYZING_PHASES[phase]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          −{DNA_EXTRACTION_COST} nodes · ~15 segundos
        </div>
      </div>

      <style>{`
        .dna-scan {
          position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg,
            transparent 0%,
            rgba(70,209,145,0.15) 49%,
            rgba(70,209,145,0.45) 50%,
            rgba(70,209,145,0.15) 51%,
            transparent 100%);
          background-size: 100% 200%;
          animation: dnaScanMove 2.4s linear infinite;
        }
        @keyframes dnaScanMove {
          0%   { background-position: 0 -100%; }
          100% { background-position: 0 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dna-scan { animation: none; opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

// ── Step 4 · reveal ───────────────────────────────────────────

function RevealStep(props: {
  dna: ProjectDNA; vistaMestreUrl: string
  onLock: () => void; submitting: boolean; error: string | null
}) {
  const { dna, vistaMestreUrl, onLock, submitting, error } = props

  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(29,158,117,0.14)', color: '#46d191',
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#46d191' }} />
          DNA gerado
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
          letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8,
        }}>
          Análise concluída
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
          4 atributos detectados a partir da Vista Mestre. Revise antes de travar.
        </p>
      </div>

      <div style={{
        position: 'relative',
        marginBottom: 24,
        borderRadius: 14, overflow: 'hidden',
        background: 'var(--color-bg-elevated)',
        aspectRatio: '16 / 9',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={vistaMestreUrl} alt="Vista Mestre" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', top: 14, left: 14,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#fff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          padding: '5px 10px', borderRadius: 4,
        }}>
          análise completa
        </div>
      </div>

      <DnaPanel dna={dna} variant="reveal" />

      {error && <ErrorBox message={error} />}

      <Footer
        leftLabel={
          <button
            disabled
            style={{
              fontSize: 12, color: 'var(--color-text-quaternary)', background: 'none',
              cursor: 'not-allowed', padding: 0,
            }}
            title="Disponível em sprint futuro"
          >
            Refinar antes
          </button>
        }
        right={
          <button
            onClick={onLock}
            disabled={submitting}
            className="spn-action"
            style={{
              width: 'auto', minWidth: 220, padding: '12px 24px',
              background: '#1D9E75', color: '#042818',
              border: '0.5px solid rgba(0,0,0,0.18)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px rgba(29,158,117,0.18)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <rect x="4" y="11" width="16" height="10" rx="1.5"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
            {submitting ? 'Travando…' : 'Travar DNA do projeto'}
          </button>
        }
      />
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────

function StepHeader({ index, total, title, subtitle }: {
  index: number; total: number; title: string; subtitle: string
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--color-text-quaternary)', marginBottom: 14,
      }}>
        Etapa {index} de {total}
      </div>
      <h1 style={{
        fontSize: 28, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8,
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-tertiary)', letterSpacing: '-0.005em' }}>
        {subtitle}
      </p>
    </div>
  )
}

function Section({ label, helper, children }: {
  label: string; helper?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
      {helper && (
        <div style={{
          fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 10,
          letterSpacing: '-0.005em', lineHeight: 1.5,
        }}>
          {helper}
        </div>
      )}
    </div>
  )
}

function SelectableCard({ selected, onClick, icon, label, description, tag }: {
  selected:    boolean
  onClick:     () => void
  icon:        React.ReactNode
  label:       string
  description: string
  tag?:        string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '16px 18px',
        background: selected ? 'rgba(255,255,255,0.04)' : 'var(--color-bg-elevated)',
        border: selected
          ? '1.5px solid var(--color-text-primary)'
          : '0.5px solid var(--color-border-strong)',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'background 0.15s, border-color 0.15s',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--color-text-primary)', display: 'flex' }}>{icon}</span>
        {tag && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-surface)',
            padding: '3px 7px', borderRadius: 4,
          }}>
            {tag}
          </span>
        )}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)',
        letterSpacing: '-0.015em',
      }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
        {description}
      </div>
    </button>
  )
}

function Footer({ leftLabel, right }: { leftLabel: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      marginTop: 36, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{leftLabel}</div>
      <div>{right}</div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      marginTop: 16, padding: '10px 14px', borderRadius: 8,
      background: 'rgba(163,45,45,0.12)', border: '0.5px solid rgba(163,45,45,0.3)',
      color: '#e57373', fontSize: 13, letterSpacing: '-0.005em',
    }}>
      {message}
    </div>
  )
}
