'use client'
import { useState, useRef } from 'react'

const INTENSIDADE_OPTS = ['Leve', 'Média', 'Forte']
const OBJETIVO_OPTS    = ['Mais realismo', 'Melhor iluminação', 'Mais nitidez']
const SAIDA_OPTS = [
  { id: 'hd', label: 'HD', nodes: 4,  desc: 'Rápido para testes'      },
  { id: '2k', label: '2K', nodes: 8,  desc: 'Ideal para apresentação' },
  { id: '4k', label: '4K', nodes: 20, desc: 'Máxima definição'        },
]

export default function EnhanceClient() {
  const [imagePreview,   setImagePreview]   = useState<string | null>(null)
  const [intensidade,    setIntensidade]    = useState('Média')
  const [objetivo,       setObjetivo]       = useState('Mais realismo')
  const [saida,          setSaida]          = useState('hd')
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [betaInfo,       setBetaInfo]       = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 3 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]
    if (file) loadImage(file)
  }

  const handleEnhance = () => {
    setBetaInfo(true)
  }

  const nodeCost = SAIDA_OPTS.find(q => q.id === saida)?.nodes ?? 4

  return (
    <div style={S.main}>

      {/* ── CONTROLES ── */}
      <div style={S.controls}>

        {/* Topbar */}
        <div style={S.topbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.pageTitle}>MELHORAR IMAGEM</span>
            <span style={S.betaBadge}>BETA</span>
          </div>
        </div>

        <p style={S.subtitle}>
          Refine realismo, iluminação e qualidade de uma imagem existente.
        </p>

        <div style={S.divider} />

        {/* Intensidade */}
        <div style={S.section}>
          <div style={S.label}>INTENSIDADE</div>
          <PillGroup options={INTENSIDADE_OPTS} selected={intensidade} onChange={setIntensidade} />
        </div>

        <div style={S.divider} />

        {/* Objetivo */}
        <div style={S.section}>
          <div style={S.label}>OBJETIVO</div>
          <PillGroup options={OBJETIVO_OPTS} selected={objetivo} onChange={setObjetivo} />
        </div>

        <div style={S.divider} />

        {/* Saída */}
        <div style={S.section}>
          <div style={S.label}>QUALIDADE DE SAÍDA</div>
          <div style={S.qualityGrid}>
            {SAIDA_OPTS.map(q => (
              <div
                key={q.id}
                style={{ ...S.qualityOpt, ...(saida === q.id ? S.qualityOptActive : {}) }}
                onClick={() => setSaida(q.id)}
              >
                <div style={{ ...S.qualityRes, ...(saida === q.id ? { color: 'var(--color-bg)' } : {}) }}>
                  {q.label}
                </div>
                <div style={{ ...S.motorDesc, ...(saida === q.id ? { color: 'var(--color-bg)', opacity: 0.6 } : {}) }}>
                  {q.nodes} Nodes
                </div>
                <div style={{ ...S.motorDesc, ...(saida === q.id ? { color: 'var(--color-bg)', opacity: 0.6 } : {}) }}>
                  {q.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {betaInfo && (
          <div style={S.betaMsg}>
            Ferramenta em beta. Endpoint de melhoria ainda não conectado.
          </div>
        )}

        {/* CTA */}
        <button
          style={!imagePreview ? { ...S.genBtn, opacity: 0.5, cursor: 'not-allowed' } : S.genBtn}
          onClick={handleEnhance}
          disabled={!imagePreview}
        >
          <span>Melhorar imagem</span>
          <span style={S.genBtnMeta}>
            <span>{nodeCost} Nodes por imagem</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="1.5">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

      </div>

      {/* ── PREVIEW ── */}
      <div style={S.preview}>
        <div style={S.topbar}>
          <span style={S.pageTitle}>PRÉVIA</span>
        </div>

        {!imagePreview && (
          <div
            style={isDraggingFile ? { ...S.uploadZone, borderColor: 'var(--color-text-primary)', background: 'var(--color-surface)' } : S.uploadZone}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={S.uploadIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.3">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div style={S.uploadTitle}>arraste sua imagem aqui</div>
              <div style={S.uploadSub}>Render · Foto · JPG · PNG</div>
            </div>
            <button style={S.uploadBtn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
              escolher arquivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadImage(f) }}
            />
          </div>
        )}

        {imagePreview && (
          <div style={S.compareWrap}>
            <img src={imagePreview} alt="Input" style={S.compareImg} draggable={false} />
            <button style={S.changeImageBtn} onClick={() => { setImagePreview(null); setBetaInfo(false) }}>
              trocar imagem
            </button>
          </div>
        )}

        {/* Info card */}
        <div style={S.infoCard}>
          <div style={S.infoCardTitle}>O que o Melhorar faz?</div>
          <ul style={S.infoList}>
            <li>Aumenta realismo e qualidade fotográfica</li>
            <li>Refina iluminação, sombras e reflexos</li>
            <li>Melhora nitidez e detalhes de materiais</li>
            <li>Preserva a composição original da imagem</li>
          </ul>
        </div>
      </div>

    </div>
  )
}

// ── Pill component ─────────────────────────────────────────────────────────────

function PillGroup({ options, selected, onChange }: { options: string[]; selected: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt}
          style={selected === opt ? { ...pill, ...pillActive } : pill}
          onClick={() => onChange(opt)}
        >
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
  border: '0.5px solid var(--color-text-primary)',
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  main:         { display: 'grid', gridTemplateColumns: '480px 1fr', height: '100%', width: '100%', overflow: 'hidden' },
  controls:     { padding: '28px 24px', borderRight: '0.5px solid var(--color-border)', background: 'var(--color-bg)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 },
  preview:      { padding: 28, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: 18 },
  topbar:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle:    { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },
  betaBadge:    { fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', padding: '2px 7px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.1)' },
  subtitle:     { fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.6, margin: 0 },
  section:      { display: 'flex', flexDirection: 'column', gap: 10 },
  label:        { fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500 },
  divider:      { height: '0.5px', background: 'var(--color-border)' },
  qualityGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 },
  qualityOpt:   { border: '0.5px solid var(--color-border-strong)', borderRadius: 8, padding: '10px 8px', cursor: 'pointer', background: 'var(--color-bg-elevated)', textAlign: 'center' as const },
  qualityOptActive: { border: '0.5px solid var(--color-text-primary)', background: 'var(--color-text-primary)' },
  qualityRes:   { fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4, letterSpacing: '-0.02em' },
  motorDesc:    { fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 },
  betaMsg:      { fontSize: 11, color: 'rgba(255,200,80,0.85)', background: 'rgba(255,200,80,0.07)', border: '0.5px solid rgba(255,200,80,0.2)', borderRadius: 8, padding: '10px 14px', lineHeight: 1.5 },
  genBtn:       { width: '100%', padding: '13px 16px', background: 'var(--color-text-primary)', color: 'var(--color-bg)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' },
  genBtnMeta:   { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--color-text-tertiary)' },
  uploadZone:   { border: '0.5px dashed var(--color-border-strong)', borderRadius: 12, padding: '48px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--color-bg-elevated)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 300 },
  uploadIcon:   { width: 44, height: 44, borderRadius: 10, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  uploadTitle:  { fontSize: 15, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' },
  uploadSub:    { fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 },
  uploadBtn:    { padding: '7px 18px', border: '0.5px solid var(--color-border-strong)', borderRadius: 20, fontSize: 11, color: 'var(--color-text-primary)', background: 'var(--color-bg-elevated)', cursor: 'pointer', fontFamily: 'inherit' },
  compareWrap:  { position: 'relative', borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 300, background: 'var(--color-surface)' },
  compareImg:   { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' },
  changeImageBtn: { position: 'absolute', top: 12, right: 14, padding: '5px 12px', border: '0.5px solid rgba(255,255,255,0.4)', borderRadius: 20, fontSize: 10, color: '#fafafa', background: 'rgba(0,0,0,0.35)', cursor: 'pointer', fontFamily: 'inherit' },
  infoCard:     { background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '14px 16px' },
  infoCardTitle:{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: 10 },
  infoList:     { fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.8, paddingLeft: 16, margin: 0 },
}
