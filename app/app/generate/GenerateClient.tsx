'use client'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ProjectType, ProjectMaterials,
  getSegments, getEnvironments, getLighting, getBackgrounds, getSceneElements,
} from '@/lib/prompts'

interface GenerateClientProps {
  initialCredits:    number
  initialMaterials?: ProjectMaterials
}

interface GenerateResult {
  outputUrl: string
  credits:   number
  error?:    string
}

const LOADING_TEXTS = [
  'analisando geometria...',
  'aplicando materiais reais...',
  'ajustando iluminação...',
  'renderizando fotorrealismo...',
  'finalizando detalhes...',
]

const SPN_ENGINES = [
  { id: 'nano-banana-pro', name: 'Vega',   tag: 'PADRÃO',  desc: 'Rápido e eficiente'          },
  { id: 'gpt-image-2',     name: 'Quasar', tag: 'PREMIUM', desc: 'Mais realismo e refinamento'  },
]

const OUTPUT_QUALITIES = [
  { id: 'hd', label: 'HD',  nodes: 4,  desc: 'Rápido para testes'       },
  { id: '2k', label: '2K',  nodes: 8,  desc: 'Ideal para apresentação'  },
  { id: '4k', label: '4K',  nodes: 20, desc: 'Máxima definição'         },
]

const EMPTY_MATERIALS: ProjectMaterials = {
  fachada: '', piso: '', esquadrias: '', elementos: '', outros: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function firstOf(arr: string[]): string { return arr[0] ?? '' }

function deriveDefaults(projectType: ProjectType, segment: string) {
  const envs   = getEnvironments(projectType, segment)
  const lights = getLighting(projectType, segment)
  const bgs    = getBackgrounds(projectType)
  return {
    environment: firstOf(envs),
    lighting:    firstOf(lights),
    background:  firstOf(bgs),
  }
}

export function GenerateClient({ initialCredits, initialMaterials }: GenerateClientProps) {
  const supabase = createClient()

  // ── Global state
  const [credits,     setCredits]     = useState(initialCredits)
  const [loading,     setLoading]     = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [error,       setError]       = useState<string | null>(null)

  // ── Dark mode
  // Server always renders isDark=false (no document). useLayoutEffect syncs
  // the correct value on the client before the first paint — no visible flash.
  const [isDark, setIsDark] = useState(false)
  useLayoutEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    const newDark = !html.classList.contains('dark')
    html.classList.toggle('dark', newDark)
    try { localStorage.setItem('theme', newDark ? 'dark' : 'light') } catch {}
    setIsDark(newDark)
  }

  // ── Tipo e Segmento
  const [projectType, setProjectType] = useState<ProjectType>('exterior')
  const [segment,     setSegment]     = useState<string>('Residencial')

  // ── Ambiente, Iluminação, Background
  const [environment, setEnvironment] = useState<string>('Fachada Residencial')
  const [lighting,    setLighting]    = useState<string>('Diurno')
  const [background,  setBackground]  = useState<string>('Preservar Original')

  // ── Elementos na Cena (múltipla seleção)
  const [sceneElements, setSceneElements] = useState<string[]>([])

  // ── Parâmetros técnicos
  const [geometryLock,   setGeometryLock]   = useState(85)
  const [selectedModel,  setSelectedModel]  = useState('nano-banana-pro')
  const [outputQuality,  setOutputQuality]  = useState('hd')

  // ── Materiais
  const [materiaisAberto, setMateriaisAberto] = useState(false)
  const [materials,       setMaterials]       = useState<ProjectMaterials>(initialMaterials ?? EMPTY_MATERIALS)
  const [salvando,        setSalvando]        = useState(false)
  const [salvoOk,         setSalvoOk]         = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Imagem e resultado
  const [imagePreview,      setImagePreview]      = useState<string | null>(null)
  const [outputUrl,         setOutputUrl]         = useState<string | null>(null)
  const [sliderPos,         setSliderPos]         = useState(50)
  const [isDraggingSlider,  setIsDraggingSlider]  = useState(false)
  const [isDraggingFile,    setIsDraggingFile]    = useState(false)

  const fileInputRef         = useRef<HTMLInputElement>(null)
  const compareRef           = useRef<HTMLDivElement>(null)
  const loadingTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDraggingSliderRef  = useRef(false)

  // ── Cascade: projectType → reset segment + children
  const handleProjectTypeChange = (type: ProjectType) => {
    const segs    = getSegments(type)
    const newSeg  = firstOf(segs)
    const defs    = deriveDefaults(type, newSeg)
    setProjectType(type)
    setSegment(newSeg)
    setEnvironment(defs.environment)
    setLighting(defs.lighting)
    setBackground(defs.background)
    setSceneElements([])
  }

  // ── Cascade: segment → reset environment + lighting + elements
  const handleSegmentChange = (seg: string) => {
    const defs = deriveDefaults(projectType, seg)
    setSegment(seg)
    setEnvironment(defs.environment)
    setLighting(defs.lighting)
    setSceneElements([])
  }

  // ── Toggle scene element
  const toggleElement = (el: string) => {
    setSceneElements(prev =>
      prev.includes(el) ? prev.filter(e => e !== el) : [...prev, el]
    )
  }

  // ── Loading texts
  const startLoadingTexts = () => {
    let i = 0; setLoadingText(LOADING_TEXTS[0])
    loadingTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_TEXTS.length; setLoadingText(LOADING_TEXTS[i])
    }, 1800)
  }
  const stopLoadingTexts = () => {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current)
  }
  useEffect(() => () => stopLoadingTexts(), [])

  // ── Auto-save materiais (debounce 1.5s)
  const handleMaterialChange = (field: keyof ProjectMaterials, value: string) => {
    const updated = { ...materials, [field]: value }
    setMaterials(updated)
    setSalvoOk(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSalvando(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').update({ project_materials: updated }).eq('id', user.id)
          setSalvoOk(true)
          setTimeout(() => setSalvoOk(false), 2000)
        }
      } catch (e) { console.error('Erro ao salvar materiais:', e) }
      finally { setSalvando(false) }
    }, 1500)
  }

  // ── Upload — plain functions; React Compiler handles memoization
  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setOutputUrl(null); setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]; if (file) loadImage(file)
  }

  // ── Geração
  const handleGenerate = async () => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits < nodeCost) { setError('Créditos insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64:   imagePreview,
          projectType,
          segment,
          environment,
          lighting,
          background,
          sceneElements,
          geometryLock,
          model:         selectedModel,
          materials:     Object.values(materials).some(v => v) ? materials : undefined,
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl); setCredits(data.credits); setSliderPos(50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally { setLoading(false); stopLoadingTexts() }
  }

  // ── Slider BeforeAfter — ref keeps event handler stable, avoids re-subscribing
  useEffect(() => { isDraggingSliderRef.current = isDraggingSlider }, [isDraggingSlider])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingSliderRef.current || !compareRef.current) return
      const rect = compareRef.current.getBoundingClientRect()
      setSliderPos(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)))
    }
    const onUp = () => setIsDraggingSlider(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleBuyCredits = async () => {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  // ── Computed
  const hasMaterials  = Object.values(materials).some(v => v && v.trim())
  const nodeCost      = OUTPUT_QUALITIES.find(q => q.id === outputQuality)?.nodes ?? 4
  const currentEngine = SPN_ENGINES.find(m => m.id === selectedModel)
  const segments      = getSegments(projectType)
  const environments  = getEnvironments(projectType, segment)
  const lightingOpts  = getLighting(projectType, segment)
  const backgrounds   = getBackgrounds(projectType)
  const elementsOpts  = getSceneElements(projectType, segment)
  const bgTitle       = projectType === 'exterior' ? 'BACKGROUND / PAISAGEM' : 'CONTEXTO VISUAL'
  const typeLabel     = projectType === 'exterior' ? 'Fotorrealismo Exterior' : 'Fotorrealismo Interior'

  // ── Summary lines
  const summaryLine1 = `${typeLabel} · ${segment} · ${environment}`
  const summaryLine2 = [lighting, background !== 'Preservar Original' ? background : null, sceneElements.join(', ')].filter(Boolean).join(' · ')
  const summaryLine3 = `${currentEngine?.name} · ${OUTPUT_QUALITIES.find(q => q.id === outputQuality)?.label}`

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.main}>

      {/* ── CONTROLES ── */}
      <div style={S.controls}>

        {/* Topbar */}
        <div style={S.topbar}>
          <span style={S.pageTitle}>GERAR</span>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <button onClick={toggleTheme} style={S.themeToggle} title={isDark ? 'Modo claro' : 'Modo escuro'} suppressHydrationWarning>
              {isDark ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <div style={S.credits}>
              <span style={S.creditDot}/>
              <span style={S.creditNum}>{credits}</span>
              <span>créditos</span>
              <button onClick={handleBuyCredits} style={S.buyBtn}>+ comprar</button>
            </div>
          </div>
        </div>

        {/* 1 — Tipo de Projeto */}
        <div style={S.section}>
          <div style={S.label}>TIPO DE PROJETO</div>
          <div style={S.typeGrid}>
            {(['exterior', 'interior'] as const).map(type => (
              <div
                key={type}
                style={projectType === type ? {...S.typeCard, ...S.typeCardActive} : S.typeCard}
                onClick={() => handleProjectTypeChange(type)}
              >
                <div style={{...S.typeIcon, ...(projectType === type ? {color:'var(--color-bg)'} : {})}}>
                  {type === 'exterior' ? '☀' : '⬛'}
                </div>
                <div style={{...S.typeLabel, ...(projectType === type ? {color:'var(--color-bg)'} : {})}}>
                  {type === 'exterior' ? 'Ambiente Exterior' : 'Ambiente Interior'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.divider}/>

        {/* 2 — Segmento */}
        <div style={S.section}>
          <div style={S.label}>SEGMENTO</div>
          <PillGroup options={segments} selected={segment} onChange={handleSegmentChange}/>
        </div>

        <div style={S.divider}/>

        {/* 3 — Ambiente */}
        <div style={S.section}>
          <div style={S.label}>AMBIENTE</div>
          <PillGroup options={environments} selected={environment} onChange={setEnvironment}/>
        </div>

        <div style={S.divider}/>

        {/* 4 — Iluminação */}
        <div style={S.section}>
          <div style={S.label}>ILUMINAÇÃO</div>
          <PillGroup options={lightingOpts} selected={lighting} onChange={setLighting}/>
        </div>

        <div style={S.divider}/>

        {/* 5 — Background / Contexto Visual */}
        <div style={S.section}>
          <div style={S.label}>{bgTitle}</div>
          <PillGroup options={backgrounds} selected={background} onChange={setBackground}/>
        </div>

        <div style={S.divider}/>

        {/* 6 — Materiais do Projeto */}
        <div style={S.section}>
          <button style={S.collapseBtn} onClick={() => setMateriaisAberto(!materiaisAberto)}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={S.label}>MATERIAIS DO PROJETO</span>
              {hasMaterials && <span style={S.materiaisBadge}>preenchido</span>}
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              {salvando && <span style={{fontSize:9, color:'var(--color-text-tertiary)'}}>salvando...</span>}
              {salvoOk  && <span style={{fontSize:9, color:'var(--color-accent-green)'}}>salvo ✓</span>}
              <span style={{fontSize:14, color:'var(--color-text-tertiary)', transform: materiaisAberto ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.2s'}}>▾</span>
            </div>
          </button>
          {materiaisAberto && (
            <div style={S.materiaisGrid}>
              {[
                { field: 'fachada'    as const, label: 'Revestimento de fachada', placeholder: 'ex: placas cimentícias texturizadas, ACM preto' },
                { field: 'piso'       as const, label: 'Piso externo / calçada',  placeholder: 'ex: porcelanato 90×90 cinza claro' },
                { field: 'esquadrias' as const, label: 'Esquadrias / caixilhos',  placeholder: 'ex: alumínio preto fosco' },
                { field: 'elementos'  as const, label: 'Elementos especiais',     placeholder: 'ex: painel de madeira ipê, brise metálico' },
                { field: 'outros'     as const, label: 'Observações adicionais',  placeholder: 'ex: estrutura em concreto aparente, laje invertida' },
              ].map(({ field, label, placeholder }) => (
                <div key={field} style={S.materialField}>
                  <div style={S.materialLabel}>{label}</div>
                  <input
                    type="text"
                    value={materials[field] ?? ''}
                    placeholder={placeholder}
                    onChange={e => handleMaterialChange(field, e.target.value)}
                    style={S.materialInput}
                  />
                </div>
              ))}
              <p style={S.infoNote}>Use esta seção apenas se quiser reforçar materiais específicos no resultado. Salvo automaticamente.</p>
            </div>
          )}
        </div>

        <div style={S.divider}/>

        {/* 7 — Elementos na Cena */}
        <div style={S.section}>
          <div style={S.label}>ELEMENTOS NA CENA</div>
          <MultiPillGroup
            options={elementsOpts}
            selected={sceneElements}
            onToggle={toggleElement}
          />
          {sceneElements.length > 0 && (
            <button
              style={{...S.buyBtn, fontSize:10, marginTop:4, textDecoration:'none', color:'var(--color-text-tertiary)'}}
              onClick={() => setSceneElements([])}
            >
              limpar seleção
            </button>
          )}
        </div>

        <div style={S.divider}/>

        {/* 8 — Geometry Lock */}
        <div style={S.section}>
          <div style={S.label}>FIDELIDADE AO PROJETO</div>
          <div style={S.sliderRow}>
            <span style={S.sliderEnd}>Livre</span>
            <input type="range" min={0} max={100} value={geometryLock} onChange={e => setGeometryLock(Number(e.target.value))} style={S.range}/>
            <span style={S.sliderEnd}>Fiel</span>
            <span style={S.sliderVal}>{geometryLock}%</span>
          </div>
          <p style={S.infoNote}>
            {geometryLock >= 76 ? 'Apenas materiais e luz mudam'
              : geometryLock >= 51 ? 'Câmera e proporções travadas'
              : geometryLock >= 26 ? 'Composição geral mantida'
              : 'Liberdade criativa'}
          </p>
        </div>

        {/* 9 — Motor de IA */}
        <div style={S.section}>
          <div style={S.label}>MOTOR DE IA</div>
          <div style={S.motorGrid}>
            {SPN_ENGINES.map(m => (
              <div key={m.id}
                style={{...S.motorOpt, ...(selectedModel === m.id ? S.motorOptActive : {})}}
                onClick={() => setSelectedModel(m.id)}
              >
                <div style={{...S.motorName, ...(selectedModel === m.id ? {color:'var(--color-bg)'} : {})}}>{m.name}</div>
                <span style={{...S.motorTag, ...(selectedModel === m.id ? {background:'rgba(128,128,128,0.25)', color:'var(--color-bg)'} : {})}}>{m.tag}</span>
                <div style={{...S.motorDesc, ...(selectedModel === m.id ? {color:'rgba(255,255,255,0.6)'} : {})}}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 10 — Qualidade de Saída */}
        <div style={S.section}>
          <div style={S.label}>QUALIDADE DE SAÍDA</div>
          <div style={S.qualityGrid}>
            {OUTPUT_QUALITIES.map(q => (
              <div key={q.id}
                style={{...S.qualityOpt, ...(outputQuality === q.id ? S.qualityOptActive : {})}}
                onClick={() => setOutputQuality(q.id)}
              >
                <div style={{...S.qualityRes, ...(outputQuality === q.id ? {color:'var(--color-bg)'} : {})}}>{q.label}</div>
                <span style={{...S.motorTag, ...(outputQuality === q.id ? {background:'rgba(128,128,128,0.25)', color:'var(--color-bg)'} : {})}}>{q.nodes} nodes</span>
                <div style={{...S.motorDesc, ...(outputQuality === q.id ? {color:'rgba(255,255,255,0.6)'} : {})}}>{q.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        {/* 12 — Botão Gerar */}
        <button
          style={loading || !imagePreview || credits < nodeCost
            ? {...S.genBtn, opacity:0.6, cursor:'not-allowed'}
            : S.genBtn}
          onClick={handleGenerate}
          disabled={loading || !imagePreview || credits < nodeCost}
        >
          <span>{loading ? loadingText : 'gerar render'}</span>
          <span style={S.genBtnMeta}>
            <span>{nodeCost} nodes</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="1.5">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      </div>

      {/* ── PREVIEW ── */}
      <div style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>ANTES / DEPOIS</span>
          {outputUrl && (
            <a href={outputUrl} download="spacenode-render.jpg" target="_blank" rel="noopener noreferrer" style={S.downloadLink}>
              baixar render ↓
            </a>
          )}
        </div>

        {!imagePreview && (
          <div
            style={isDraggingFile ? {...S.uploadZone, borderColor:'var(--color-text-primary)', background:'var(--color-surface)'} : S.uploadZone}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={S.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={S.uploadTitle}>arraste sua imagem aqui</div>
              <div style={S.uploadSub}>SketchUp · Render · 3D · JPG · PNG</div>
            </div>
            <button style={S.uploadBtn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
              escolher arquivo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}/>
          </div>
        )}

        {imagePreview && outputUrl && (
          <div ref={compareRef} style={S.compareWrap} onMouseDown={() => setIsDraggingSlider(true)}>
            <img src={imagePreview} alt="Antes" style={S.compareImg} draggable={false}/>
            <div style={{...S.compareAfterWrap, clipPath:`inset(0 ${100-sliderPos}% 0 0)`}}>
              <img src={outputUrl} alt="Depois" style={S.compareImg} draggable={false}/>
            </div>
            <div style={{...S.compareHandle, left:`${sliderPos}%`}}>
              <div style={S.compareHandleCircle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2">
                  <path d="M8 5l-5 7 5 7M16 5l5 7-5 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <span style={{...S.compareLabel, right:14}}>DEPOIS</span>
          </div>
        )}

        {imagePreview && !outputUrl && !loading && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={S.compareImg}/>
            <span style={{...S.compareLabel, left:14}}>ANTES</span>
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setOutputUrl(null) }}>
              trocar imagem
            </button>
          </div>
        )}

        {loading && imagePreview && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity:0.4}}/>
            <div style={S.loadingOverlay}>
              <div style={S.spinner}/>
              <span style={{fontSize:12, color:'#fafafa', letterSpacing:'0.05em'}}>{loadingText}</span>
            </div>
          </div>
        )}

        {/* 11 — Resumo da Geração */}
        <div style={S.promptPreview}>
          <div style={S.promptLabel}>RESUMO DA GERAÇÃO</div>
          <div style={S.promptText}>
            <span style={{color:'var(--color-text-primary)', fontWeight:500}}>{summaryLine1}</span>
            {hasMaterials && <span style={{color:'var(--color-accent-green)', fontSize:10, marginLeft:6}}>+ materiais</span>}
            <br/>
            <span style={{color:'var(--color-text-tertiary)'}}>{summaryLine2}</span>
            <br/>
            <span style={{color:'var(--color-text-tertiary)'}}>fidelidade: {geometryLock}% · {summaryLine3}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Pill components ────────────────────────────────────────────────────────────

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => (
        <button key={opt} style={selected === opt ? {...pill, ...pillActive} : pill} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function MultiPillGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => (
        <button key={opt} style={selected.includes(opt) ? {...pill, ...pillActive} : pill} onClick={() => onToggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}

const pill: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 20,
  border: '0.5px solid var(--color-border-strong)',
  fontSize: 11, color: 'var(--color-text-tertiary)',
  cursor: 'pointer', background: 'var(--color-bg-elevated)',
  letterSpacing: '-0.005em', fontFamily: 'inherit',
}
const pillActive: React.CSSProperties = {
  background: 'var(--color-text-primary)',
  color: 'var(--color-bg)',
  borderColor: 'var(--color-text-primary)',
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  main:              { display:'grid', gridTemplateColumns:'480px 1fr', height:'100%', overflow:'hidden' },
  controls:          { padding:'28px 24px', borderRight:'0.5px solid var(--color-border)', background:'var(--color-bg)', overflowY:'auto', display:'flex', flexDirection:'column', gap:20 },
  preview:           { padding:28, background:'var(--color-bg)', display:'flex', flexDirection:'column', gap:18 },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:         { fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  credits:           { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--color-text-tertiary)' },
  creditDot:         { width:5, height:5, borderRadius:'50%', background:'var(--color-accent-green)', boxShadow:'0 0 5px var(--color-accent-green-glow)', display:'inline-block' },
  creditNum:         { color:'var(--color-text-primary)', fontWeight:500, fontSize:12 },
  buyBtn:            { fontSize:'11px', color:'var(--color-text-tertiary)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', marginLeft:'6px', fontFamily:'inherit' },
  themeToggle:       { width:28, height:28, borderRadius:'50%', border:'0.5px solid var(--color-border-strong)', background:'var(--color-bg-elevated)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--color-text-tertiary)', padding:0, flexShrink:0 },
  section:           { display:'flex', flexDirection:'column', gap:10 },
  label:             { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  divider:           { height:'0.5px', background:'var(--color-border)' },
  typeGrid:          { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  typeCard:          { border:'0.5px solid var(--color-border-strong)', borderRadius:10, padding:'14px 12px', cursor:'pointer', textAlign:'center', background:'var(--color-bg-elevated)' },
  typeCardActive:    { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  typeIcon:          { fontSize:18, marginBottom:5, color:'var(--color-text-tertiary)' },
  typeLabel:         { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', lineHeight:1.3 },
  infoNote:          { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.6 },
  collapseBtn:       { display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%', fontFamily:'inherit' },
  materiaisBadge:    { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(48,180,108,0.12)', color:'var(--color-accent-green)', padding:'2px 7px', borderRadius:10 },
  materiaisGrid:     { display:'flex', flexDirection:'column', gap:10, paddingTop:4 },
  materialField:     { display:'flex', flexDirection:'column', gap:5 },
  materialLabel:     { fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'0.05em' },
  materialInput:     { padding:'8px 12px', border:'0.5px solid var(--color-border-strong)', borderRadius:8, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg-elevated)', fontFamily:'inherit', outline:'none' },
  sliderRow:         { display:'flex', alignItems:'center', gap:10 },
  sliderEnd:         { fontSize:11, color:'var(--color-text-tertiary)' },
  range:             { flex:1, accentColor:'var(--color-text-primary)', height:3 },
  sliderVal:         { fontSize:12, fontWeight:500, color:'var(--color-text-primary)', minWidth:34, textAlign:'right' },
  motorGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  motorOpt:          { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'10px 10px', cursor:'pointer', background:'var(--color-bg-elevated)' },
  motorOptActive:    { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  motorName:         { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', marginBottom:3 },
  motorTag:          { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'var(--color-border-strong)', color:'var(--color-text-tertiary)', padding:'2px 6px', borderRadius:4 },
  motorDesc:         { fontSize:10, color:'var(--color-text-tertiary)', marginTop:4 },
  qualityGrid:       { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  qualityOpt:        { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'10px 8px', cursor:'pointer', background:'var(--color-bg-elevated)', textAlign:'center' as const },
  qualityOptActive:  { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  qualityRes:        { fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4, letterSpacing:'-0.02em' },
  errorBox:          { fontSize:12, color:'#c0392b', background:'rgba(192,57,43,0.08)', border:'0.5px solid rgba(192,57,43,0.2)', borderRadius:8, padding:'10px 14px' },
  genBtn:            { width:'100%', padding:'13px 16px', background:'var(--color-text-primary)', color:'var(--color-bg)', border:'none', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' },
  genBtnMeta:        { display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--color-text-tertiary)' },
  uploadZone:        { border:'0.5px dashed var(--color-border-strong)', borderRadius:12, padding:'48px 20px', textAlign:'center', cursor:'pointer', background:'var(--color-bg-elevated)', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, minHeight:300 },
  uploadIcon:        { width:44, height:44, borderRadius:10, background:'var(--color-surface)', display:'flex', alignItems:'center', justifyContent:'center' },
  uploadTitle:       { fontSize:15, fontWeight:500, color:'var(--color-text-primary)', letterSpacing:'-0.02em' },
  uploadSub:         { fontSize:12, color:'var(--color-text-tertiary)', marginTop:4 },
  uploadBtn:         { padding:'7px 18px', border:'0.5px solid var(--color-border-strong)', borderRadius:20, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg-elevated)', cursor:'pointer', fontFamily:'inherit' },
  compareWrap:       { position:'relative', borderRadius:12, overflow:'hidden', flex:1, minHeight:300, background:'var(--color-surface)', userSelect:'none', cursor:'ew-resize' },
  compareImg:        { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none' },
  compareAfterWrap:  { position:'absolute', inset:0 },
  compareHandle:     { position:'absolute', top:0, bottom:0, width:2, background:'#ffffff', transform:'translateX(-50%)', display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  compareHandleCircle: { width:32, height:32, borderRadius:'50%', background:'#ffffff', border:'0.5px solid rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.12)' },
  compareLabel:      { position:'absolute', bottom:12, fontSize:9, letterSpacing:'0.12em', color:'#fafafa', textTransform:'uppercase', fontWeight:500, textShadow:'0 1px 3px rgba(0,0,0,0.5)', pointerEvents:'none' },
  changeImageBtn:    { position:'absolute', top:12, right:14, padding:'5px 12px', border:'0.5px solid rgba(255,255,255,0.4)', borderRadius:20, fontSize:10, color:'#fafafa', background:'rgba(0,0,0,0.35)', cursor:'pointer', fontFamily:'inherit' },
  loadingOverlay:    { position:'absolute', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 },
  spinner:           { width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#ffffff', animation:'spin 0.8s linear infinite' },
  promptPreview:     { background:'var(--color-bg-elevated)', border:'0.5px solid var(--color-border)', borderRadius:10, padding:'14px 16px' },
  promptLabel:       { fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500, marginBottom:8 },
  promptText:        { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.65 },
  downloadLink:      { fontSize:11, color:'var(--color-text-tertiary)', textDecoration:'none' },
}

export default GenerateClient
