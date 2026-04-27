'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Mode, MODE_LABELS, ProjectMaterials, SceneElements,
  ATM_OPTIONS, BG_OPTIONS, AMB_OPTIONS, LUZ_OPTIONS,
} from '@/lib/prompts'

// ── Logo com sinapses para o estado de loading ─────────────────
function LoadingLogo() {
  // As 4 interseções internas da grade do logo (viewBox 0 0 22 22)
  const nodes = [
    { cx: 7.33,  cy: 7.33,  delay: '0s',    dur: '2.8s' },
    { cx: 14.67, cy: 7.33,  delay: '0.65s', dur: '3.1s' },
    { cx: 14.67, cy: 14.67, delay: '1.3s',  dur: '2.6s' },
    { cx: 7.33,  cy: 14.67, delay: '2.0s',  dur: '3.3s' },
  ]
  return (
    <svg width="52" height="52" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
      {/* Grade */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.3">
        <line x1="7.33"  y1="1"  x2="7.33"  y2="21" />
        <line x1="14.67" y1="1"  x2="14.67" y2="21" />
        <line x1="1"     y1="7.33"  x2="21" y2="7.33"  />
        <line x1="1"     y1="14.67" x2="21" y2="14.67" />
      </g>
      {/* Sinapses nas interseções */}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={n.cx} cy={n.cy} r="1.3"
          fill="currentColor"
          style={{
            transformBox: 'fill-box' as React.CSSProperties['transformBox'],
            transformOrigin: 'center',
            animation: `synapse ${n.dur} ease-in-out ${n.delay} infinite`,
          }}
        />
      ))}
      {/* Letras */}
      <g fontFamily="var(--font-geist), sans-serif" fontSize="5" fontWeight="400"
         fill="currentColor" textAnchor="middle" dominantBaseline="central">
        <text x="3.67"  y="4.17">S</text>
        <text x="11"    y="4.17">P</text>
        <text x="18.33" y="4.17">A</text>
        <text x="3.67"  y="11">C</text>
        <text x="11"    y="11">E</text>
        <text x="18.33" y="11">N</text>
        <text x="3.67"  y="17.83">O</text>
        <text x="11"    y="17.83">D</text>
        <text x="18.33" y="17.83">E</text>
      </g>
    </svg>
  )
}

interface GenerateClientProps {
  initialCredits: number
  initialMaterials?: ProjectMaterials
}

interface GenerateResult {
  outputUrl: string
  renderId: string | null
  credits: number
  error?: string
}

const LOADING_TEXTS = [
  'analisando geometria...',
  'aplicando materiais reais...',
  'ajustando iluminação...',
  'renderizando fotorrealismo...',
  'aumentando resolução...',
  'finalizando detalhes...',
]

function IconExterior() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V13h6v8"/>
    </svg>
  )
}

function IconInterior() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 9V8a2 2 0 00-2-2H6a2 2 0 00-2 2v1"/>
      <path d="M2 9a2 2 0 012 2v3h16v-3a2 2 0 012-2"/>
      <rect x="4" y="14" width="16" height="4" rx="1"/>
      <path d="M7 18v1.5M17 18v1.5"/>
    </svg>
  )
}

// ── Elementos de cena ─────────────────────────────────────────
const SCENE_ELEMENTS_DEF: { key: keyof SceneElements; label: string }[] = [
  { key: 'ambientacao', label: 'Decoração'      },
  { key: 'pessoas',     label: 'Pessoas'        },
  { key: 'luzes',       label: 'Luzes Acesas'   },
  { key: 'carros',      label: 'Carros'         },
  { key: 'raiosSol',    label: 'Raios de Sol'   },
]

const MODES: { id: Mode; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'externo', label: 'Ambiente Exterior', Icon: IconExterior },
  { id: 'interno', label: 'Ambiente Interior', Icon: IconInterior },
]

const SPN_ENGINES = [
  { id: 'nano-banana-pro', name: 'Vega',   tag: 'PADRÃO',  desc: 'Fidelidade geométrica' },
  { id: 'gpt-image-2',     name: 'Quasar', tag: 'PREMIUM', desc: 'Ultra-realista'         },
]

const OUTPUT_QUALITIES = [
  { id: 'hd', label: 'HD',  nodes: 4,  desc: 'rascunho'     },
  { id: '2k', label: '2K',  nodes: 8,  desc: 'portfólio'    },
  { id: '4k', label: '4K',  nodes: 20, desc: 'entrega final' },
]

const EMPTY_MATERIALS: ProjectMaterials = {
  fachada: '', piso: '', esquadrias: '', elementos: '',
  marcenaria: '', bancadas: '', paredes: '', outros: '',
}

export function GenerateClient({ initialCredits, initialMaterials }: GenerateClientProps) {
  const supabase = createClient()

  // ── Estado global
  const [credits, setCredits]         = useState(initialCredits)
  const [loading, setLoading]         = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [error, setError]             = useState<string | null>(null)

  // ── Dark mode
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    const newDark = !html.classList.contains('dark')
    html.classList.toggle('dark', newDark)
    try { localStorage.setItem('theme', newDark ? 'dark' : 'light') } catch (e) {}
    setIsDark(newDark)
  }

  // ── Modo e opções
  const [mode, setMode]                       = useState<Mode>('externo')
  const [condition, setCondition]             = useState('Diurno')
  const [background, setBackground]           = useState('Preservar original')
  const [ambient, setAmbient]                 = useState('Sala de Estar')
  const [lighting, setLighting]               = useState('Clara e Natural')
  const [selectedModel, setSelectedModel]     = useState('nano-banana-pro')
  const [outputQuality, setOutputQuality]     = useState('hd')

  // ── Elementos de cena
  const [sceneElements, setSceneElements] = useState<SceneElements>({})
  const toggleScene = (key: keyof SceneElements) =>
    setSceneElements(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Materiais do projeto
  const [materiaisAberto, setMateriaisAberto] = useState(false)
  const [materials, setMaterials]             = useState<ProjectMaterials>(initialMaterials ?? EMPTY_MATERIALS)
  const [salvando, setSalvando]               = useState(false)
  const [salvoOk, setSalvoOk]                 = useState(false)
  const saveTimerRef                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Imagem e resultado
  const [imagePreview, setImagePreview]         = useState<string | null>(null)
  const [outputUrl, setOutputUrl]               = useState<string | null>(null)
  const [sliderPos, setSliderPos]               = useState(50)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const [isDraggingFile, setIsDraggingFile]     = useState(false)

  const fileInputRef    = useRef<HTMLInputElement>(null)
  const compareRef      = useRef<HTMLDivElement>(null)
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // ── Auto-save materiais com debounce 1.5s
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
          await supabase.from('profiles')
            .update({ project_materials: updated })
            .eq('id', user.id)
          setSalvoOk(true)
          setTimeout(() => setSalvoOk(false), 2000)
        }
      } catch (e) { console.error('Erro ao salvar materiais:', e) }
      finally { setSalvando(false) }
    }, 1500)
  }

  // ── Upload
  const loadImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    setOutputUrl(null); setError(null)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]; if (file) loadImage(file)
  }, [loadImage])

  // ── Geração
  const handleGenerate = async () => {
    if (!imagePreview) { setError('Faça upload de uma imagem primeiro.'); return }
    if (credits <= 0)  { setError('Nodes insuficientes.'); return }
    setError(null); setLoading(true); startLoadingTexts()
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview, mode, condition, background,
          ambient, lighting, model: selectedModel, outputQuality,
          materials: Object.values(materials).some(v => v) ? materials : undefined,
          sceneElements: Object.values(sceneElements).some(Boolean) ? sceneElements : undefined,
        }),
      })
      const data: GenerateResult = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro na geração')
      setOutputUrl(data.outputUrl); setCredits(data.credits); setSliderPos(50)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally { setLoading(false); stopLoadingTexts() }
  }

  // ── Slider BeforeAfter
  const handleCompareMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSlider || !compareRef.current) return
    const rect = compareRef.current.getBoundingClientRect()
    setSliderPos(Math.max(3, Math.min(97, ((e.clientX - rect.left) / rect.width) * 100)))
  }, [isDraggingSlider])

  useEffect(() => {
    window.addEventListener('mousemove', handleCompareMove)
    window.addEventListener('mouseup', () => setIsDraggingSlider(false))
    return () => { window.removeEventListener('mousemove', handleCompareMove) }
  }, [handleCompareMove])

  const getPromptLabel = () => {
    switch (mode) {
      case 'externo': return `${MODE_LABELS[mode]} · ${condition} · ${background}`
      case 'interno': return `${MODE_LABELS[mode]} · ${ambient} · ${lighting}`
      default:        return MODE_LABELS[mode]
    }
  }

  const handleBuyCredits = async () => {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }
  const hasMaterials = Object.values(materials).some(v => v && v.trim())
  const nodeCost     = OUTPUT_QUALITIES.find(q => q.id === outputQuality)?.nodes ?? 4

  return (
      <div style={S.main}>
      {/* ── CONTROLES ── */}
      <div style={S.controls}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>GERAR</span>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <button
              onClick={toggleTheme}
              style={S.themeToggle}
              title={isDark ? 'Modo claro' : 'Modo escuro'}
            >
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
              <span>nodes</span>
              <button onClick={handleBuyCredits} style={S.buyBtn}>+ comprar</button>
            </div>
          </div>
        </div>

        {/* Modos */}
        <div style={S.section}>
          <div style={S.label}>TIPO DE AMBIENTE</div>
          <div style={S.modesGrid}>
            {MODES.map(m => (
              <div key={m.id}
                style={mode === m.id ? {...S.modeCard, ...S.modeCardActive} : S.modeCard}
                onClick={() => setMode(m.id)}>
                <div style={{...S.modeIcon, ...(mode === m.id ? {color:'var(--color-bg)'} : {})}}><m.Icon /></div>
                <div style={{...S.modeLabel, ...(mode === m.id ? {color:'var(--color-bg)'} : {})}}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.divider}/>

        {/* Opções dinâmicas */}
        {mode === 'externo' && <>
          <div style={S.section}><div style={S.label}>CONDIÇÃO ATMOSFÉRICA</div><PillGroup options={ATM_OPTIONS} selected={condition} onChange={setCondition}/></div>
          <div style={S.section}><div style={S.label}>BACKGROUND / PAISAGEM</div><PillGroup options={BG_OPTIONS} selected={background} onChange={setBackground}/></div>
        </>}
        {mode === 'interno' && <>
          <div style={S.section}><div style={S.label}>AMBIENTE</div><PillGroup options={AMB_OPTIONS} selected={ambient} onChange={setAmbient}/></div>
          <div style={S.section}><div style={S.label}>ILUMINAÇÃO</div><PillGroup options={LUZ_OPTIONS} selected={lighting} onChange={setLighting}/></div>
        </>}

        <div style={S.divider}/>

        {/* ── MATERIAIS DO PROJETO (colapsável) ── */}
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
              {(mode === 'interno' ? [
                { field: 'piso'       as const, label: 'Piso / Revestimento',    placeholder: 'ex: porcelanato acetinado, piso vinílico amadeirado' },
                { field: 'marcenaria' as const, label: 'Marcenaria / Mobiliário', placeholder: 'ex: armários em MDF carvalho, painel ripado' },
                { field: 'bancadas'   as const, label: 'Bancadas / Pedras',      placeholder: 'ex: quartzo branco, granito escovado' },
                { field: 'paredes'    as const, label: 'Paredes / Teto',         placeholder: 'ex: pintura off-white, forro de gesso com sanca' },
                { field: 'outros'     as const, label: 'Observações adicionais', placeholder: 'ex: estilo minimalista, paleta neutra' },
              ] : [
                { field: 'fachada'    as const, label: 'Revestimento de fachada', placeholder: 'ex: placas cimentícias texturizadas, ACM preto' },
                { field: 'piso'       as const, label: 'Piso externo / calçada',  placeholder: 'ex: porcelanato 90×90 cinza claro' },
                { field: 'esquadrias' as const, label: 'Esquadrias / caixilhos',  placeholder: 'ex: alumínio preto fosco' },
                { field: 'elementos'  as const, label: 'Elementos especiais',     placeholder: 'ex: painel de madeira ipê, brise metálico' },
                { field: 'outros'     as const, label: 'Observações adicionais',  placeholder: 'ex: estrutura em concreto aparente, laje invertida' },
              ]).map(({ field, label, placeholder }) => (
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
              <p style={S.infoNote}>Salvo automaticamente. Usado em todas as gerações para manter fidelidade aos materiais do projeto.</p>
            </div>
          )}
        </div>

        <div style={S.divider}/>

        {/* ── ELEMENTOS NA CENA ── */}
        <div style={S.section}>
          <div style={S.label}>ELEMENTOS NA CENA</div>
          <div style={S.sceneList}>
            {SCENE_ELEMENTS_DEF.map(el => {
              const active = !!sceneElements[el.key]
              return (
                <button
                  key={el.key}
                  onClick={() => toggleScene(el.key)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 20,
                    border: `0.5px solid ${active ? 'var(--color-text-primary)' : 'var(--color-border-strong)'}`,
                    background: active ? 'var(--color-text-primary)' : 'transparent',
                    color: active ? 'var(--color-bg)' : 'var(--color-text-primary)',
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    letterSpacing: '-0.01em',
                    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                    whiteSpace: 'nowrap' as const,
                    flexShrink: 0,
                  }}
                >
                  {el.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={S.divider}/>

        {/* Motor */}
        <div style={S.section}>
          <div style={S.label}>MOTOR DE IA</div>
          <div style={S.motorGrid}>
            {SPN_ENGINES.map(m => (
              <div key={m.id}
                style={{...S.motorOpt, ...(selectedModel === m.id ? S.motorOptActive : {})}}
                onClick={() => setSelectedModel(m.id)}>
                <div style={{...S.motorName, ...(selectedModel === m.id ? {color:'var(--color-bg)'} : {})}}>{m.name}</div>
                <span style={{...S.motorTag, ...(selectedModel === m.id ? {background:'rgba(128,128,128,0.25)', color:'var(--color-bg)'} : {})}}>{m.tag}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Qualidade de Saída */}
        <div style={S.section}>
          <div style={S.label}>QUALIDADE DE SAÍDA</div>
          <div style={S.qualityGrid}>
            {OUTPUT_QUALITIES.map(q => (
              <div key={q.id}
                style={{...S.qualityOpt, ...(outputQuality === q.id ? S.qualityOptActive : {})}}
                onClick={() => setOutputQuality(q.id)}>
                <div style={{...S.qualityRes, ...(outputQuality === q.id ? {color:'var(--color-bg)'} : {})}}>{q.label}</div>
                <span style={{...S.motorTag, ...(outputQuality === q.id ? {background:'rgba(128,128,128,0.25)', color:'var(--color-bg)'} : {})}}>{q.nodes} nodes</span>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={S.errorBox}>{error}</div>}

        <button style={loading ? {...S.genBtn, opacity:0.7, cursor:'not-allowed'} : S.genBtn} onClick={handleGenerate} disabled={loading}>
          <span>{loading ? loadingText : 'gerar render'}</span>
          <span style={S.genBtnMeta}>
            <span>{nodeCost} nodes</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="1.5"><path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </button>
      </div>

      {/* ── PREVIEW ── */}
      <div style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>ANTES / DEPOIS</span>
          {outputUrl && <a href={outputUrl} download="spacenode-render.jpg" target="_blank" rel="noopener noreferrer" style={S.downloadLink}>baixar render ↓</a>}
        </div>

        {!imagePreview && (
          <div style={isDraggingFile ? {...S.uploadZone, borderColor:'var(--color-text-primary)', background:'var(--color-surface)'} : S.uploadZone}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}>
            <div style={S.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={S.uploadTitle}>arraste sua imagem aqui</div>
              <div style={S.uploadSub}>SketchUp · Render · 3D · JPG · PNG</div>
            </div>
            <button style={S.uploadBtn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>escolher arquivo</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}/>
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><path d="M8 5l-5 7 5 7M16 5l5 7-5 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setOutputUrl(null) }}>trocar imagem</button>
          </div>
        )}

        {loading && imagePreview && (
          <div style={S.compareWrap}>
            <style>{`
              @keyframes spn-pulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50%       { opacity: 1;   transform: scale(1.08); }
              }
              @keyframes synapse {
                0%        { opacity: 0;   transform: scale(0); }
                8%        { opacity: 1;   transform: scale(1); }
                28%       { opacity: 0.8; transform: scale(1); }
                55%, 100% { opacity: 0;   transform: scale(0); }
              }
            `}</style>
            <img src={imagePreview} alt="Input" style={{...S.compareImg, opacity:0.25}}/>
            <div style={S.loadingOverlay}>
              <div style={{ animation: 'spn-pulse 2s ease-in-out infinite', color: '#ffffff', display: 'flex' }}>
                <LoadingLogo />
              </div>
              <span style={{fontSize:11, color:'rgba(255,255,255,0.75)', letterSpacing:'0.08em'}}>{loadingText}</span>
            </div>
          </div>
        )}

        <div style={S.promptPreview}>
          <div style={S.promptLabel}>PROMPT GERADO</div>
          <div style={S.promptText}>
            <strong style={{color:'var(--color-text-primary)', fontWeight:500}}>{getPromptLabel()}</strong>
            {hasMaterials && <span style={{color:'var(--color-accent-green)', fontSize:10, marginLeft:6}}>+ materiais do projeto</span>}
            <br/>
            <span style={{color:'var(--color-text-tertiary)'}}>{SPN_ENGINES.find(m => m.id === selectedModel)?.name} · {OUTPUT_QUALITIES.find(q => q.id === outputQuality)?.label}</span>
          </div>
        </div>
      </div>
      </div>
  )
}

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
      {options.map(opt => (
        <button key={opt} style={selected === opt ? {...pill, ...pillActive} : pill} onClick={() => onChange(opt)}>{opt}</button>
      ))}
    </div>
  )
}

const pill: React.CSSProperties = {
  padding:'5px 12px', borderRadius:20,
  border:'0.5px solid var(--color-border-strong)',
  fontSize:11, color:'var(--color-text-tertiary)',
  cursor:'pointer', background:'var(--color-bg-elevated)',
  letterSpacing:'-0.005em', fontFamily:'inherit',
}
const pillActive: React.CSSProperties = {
  background:'var(--color-text-primary)',
  color:'var(--color-bg)',
  borderColor:'var(--color-text-primary)',
}

const S: Record<string, React.CSSProperties> = {
  root:              { display:'flex', height:'100vh', overflow:'hidden' },
  sidebar:           { background:'#0a0a0a', display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden', transition:'width 0.25s cubic-bezier(0.4,0,0.2,1)', borderRight:'0.5px solid rgba(255,255,255,0.06)', zIndex:10 },
  sidebarLogo:       { padding:'18px 18px 14px', display:'flex', alignItems:'center', gap:10, height:62, flexShrink:0 },
  sidebarLogoMark:   { width:26, height:26, borderRadius:6, background:'#ffffff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  sidebarLogoText:   { fontSize:11, fontWeight:600, color:'#ffffff', letterSpacing:'0.09em', textTransform:'uppercase', whiteSpace:'nowrap', transition:'opacity 0.18s' },
  sidebarNav:        { flex:1, display:'flex', flexDirection:'column', gap:2, padding:'4px 8px', overflowY:'auto' },
  sidebarItem:       { display:'flex', alignItems:'center', gap:12, padding:'0 10px', height:52, borderRadius:8, cursor:'pointer', transition:'background 0.15s', flexShrink:0 },
  sidebarItemActive: { background:'rgba(255,255,255,0.1)' },
  sidebarIcon:       { flexShrink:0, display:'flex' },
  sidebarLabel:      { fontSize:12, color:'rgba(255,255,255,0.75)', whiteSpace:'nowrap', transition:'opacity 0.18s', fontWeight:400, letterSpacing:'-0.01em' },
  sidebarFooter:     { padding:'10px 8px', borderTop:'0.5px solid rgba(255,255,255,0.07)', flexShrink:0 },
  sidebarUser:       { display:'flex', alignItems:'center', gap:10, padding:'4px 10px', height:52, borderRadius:8 },
  sidebarUserAvatar: { width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, fontWeight:600, color:'#ffffff' },
  sidebarUserName:   { fontSize:11, color:'#ffffff', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  sidebarUserPlan:   { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginTop:2 },
  main:              { display:'grid', gridTemplateColumns:'480px 1fr', flex:1, overflow:'hidden' },
  controls:          { padding:'18px 24px', borderRight:'0.5px solid var(--color-border)', background:'var(--color-bg)', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 },
  preview:           { padding:28, background:'var(--color-bg)', display:'flex', flexDirection:'column', gap:18 },
  topbar:            { display:'flex', justifyContent:'space-between', alignItems:'center' },
  pageTitle:         { fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  credits:           { display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--color-text-tertiary)' },
  creditDot:         { width:5, height:5, borderRadius:'50%', background:'var(--color-accent-green)', boxShadow:'0 0 5px var(--color-accent-green-glow)', display:'inline-block' },
  creditNum:         { color:'var(--color-text-primary)', fontWeight:500, fontSize:12 },
  buyBtn:            { fontSize:'11px', color:'var(--color-text-tertiary)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', marginLeft:'6px', fontFamily:'inherit' },
  themeToggle:       { width:28, height:28, borderRadius:'50%', border:'0.5px solid var(--color-border-strong)', background:'var(--color-bg-elevated)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--color-text-tertiary)', padding:0, flexShrink:0 },
  section:           { display:'flex', flexDirection:'column', gap:8 },
  label:             { fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500 },
  divider:           { height:'0.5px', background:'var(--color-border)' },
  modesGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  modeCard:          { border:'0.5px solid var(--color-border-strong)', borderRadius:10, padding:'9px 10px', cursor:'pointer', textAlign:'center', background:'var(--color-bg-elevated)' },
  modeCardActive:    { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  modeIcon:          { fontSize:16, marginBottom:4, color:'var(--color-text-tertiary)' },
  modeLabel:         { fontSize:10, fontWeight:500, color:'var(--color-text-primary)', lineHeight:1.3 },
  infoNote:          { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.6 },
  collapseBtn:       { display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer', padding:0, width:'100%', fontFamily:'inherit' },
  materiaisBadge:    { fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(48,180,108,0.12)', color:'var(--color-accent-green)', padding:'2px 7px', borderRadius:10 },
  materiaisGrid:     { display:'flex', flexDirection:'column', gap:10, paddingTop:4 },
  materialField:     { display:'flex', flexDirection:'column', gap:5 },
  materialLabel:     { fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'0.05em' },
  materialInput:     { padding:'8px 12px', border:'0.5px solid var(--color-border-strong)', borderRadius:8, fontSize:11, color:'var(--color-text-primary)', background:'var(--color-bg-elevated)', fontFamily:'inherit', outline:'none' },
  sceneList:         { display:'flex', flexWrap:'nowrap', gap:5 },
  motorGrid:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  motorOpt:          { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'8px 10px', cursor:'pointer', background:'var(--color-bg-elevated)' },
  motorOptActive:    { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  motorWide:         { gridColumn:'span 2' },
  qualityGrid:       { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 },
  qualityOpt:        { border:'0.5px solid var(--color-border-strong)', borderRadius:8, padding:'8px 8px', cursor:'pointer', background:'var(--color-bg-elevated)', textAlign:'center' as const },
  qualityOptActive:  { borderColor:'var(--color-text-primary)', background:'var(--color-text-primary)' },
  qualityRes:        { fontSize:14, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4, letterSpacing:'-0.02em' },
  motorName:         { fontSize:11, fontWeight:500, color:'var(--color-text-primary)', marginBottom:3 },
  motorTag:          { display:'inline-block', fontSize:9, letterSpacing:'0.08em', textTransform:'uppercase', background:'var(--color-border-strong)', color:'var(--color-text-tertiary)', padding:'2px 6px', borderRadius:4 },
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
  loadingOverlay:    { position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, backdropFilter:'blur(4px)' },
  promptPreview:     { background:'var(--color-bg-elevated)', border:'0.5px solid var(--color-border)', borderRadius:10, padding:'14px 16px' },
  promptLabel:       { fontSize:9, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--color-text-tertiary)', fontWeight:500, marginBottom:8 },
  promptText:        { fontSize:11, color:'var(--color-text-tertiary)', lineHeight:1.65 },
  downloadLink:      { fontSize:11, color:'var(--color-text-tertiary)', textDecoration:'none' },
}

export default GenerateClient
