'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter }                      from 'next/navigation'
import type { Vista, Space }              from '@/lib/spaces/types'
import { SPACES_MAX_UPLOAD_BYTES, SPACES_UPLOAD_SIZE_ERROR } from '@/lib/spaces/upload'

// ── UploadVistaDrawer ─────────────────────────────────────────────────────────
// Slide-in panel that lets the user upload a wireframe/draft image from any
// angle and generate a photorealistic render matching the Space's DNA.
// Sends input_image_base64 to /api/spaces/[spaceId]/evolve — the backend
// uploads it to fal.storage and uses it as the FAL input instead of the
// parent render's output_url.

interface UploadVistaDrawerProps {
  isOpen:    boolean
  onClose:   () => void
  space:     Space
  anchor:    Vista | null
  allVistas: Vista[]
  spaceId:   string
}

export function UploadVistaDrawer({
  isOpen,
  onClose,
  space,
  anchor,
  allVistas,
  spaceId,
}: UploadVistaDrawerProps) {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [imageBase64,   setImageBase64]   = useState<string | null>(null)
  const [imagePreview,  setImagePreview]  = useState<string | null>(null)
  const [referenceId,   setReferenceId]   = useState<string | null>(anchor?.id ?? null)
  const [vistaLabel,    setVistaLabel]    = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem.')
      return
    }
    if (file.size > SPACES_MAX_UPLOAD_BYTES) {
      setError(SPACES_UPLOAD_SIZE_ERROR)
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string
      setImagePreview(result)
      setImageBase64(result)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!imageBase64) {
      setError('Adicione uma imagem para continuar.')
      return
    }
    const effectiveParentId = referenceId ?? anchor?.id
    if (!effectiveParentId) {
      setError('Nenhuma vista de referência disponível.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/spaces/${spaceId}/evolve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_render_id:   effectiveParentId,
          vista_type:         'angulo',
          generation_mode:    'coerente',
          // geometry_lock=10 → no geometry prefix; composition guidance lives
          // inside the upload-specific prompt in buildVistaPrompt.ts
          geometry_lock:      10,
          vista_label:        vistaLabel ?? undefined,
          input_image_base64: imageBase64,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Erro ao gerar Vista')
        return
      }

      onClose()
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // ── Early exit ────────────────────────────────────────────────────────────

  if (!isOpen) return null

  const refOptions = [...(anchor ? [anchor] : []), ...allVistas]
  const canGenerate = !!imageBase64 && !loading

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420,
        background: '#111111',
        borderLeft: '0.5px solid rgba(255,255,255,0.1)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 80px rgba(0,0,0,0.5)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '24px 24px 20px',
          borderBottom: '0.5px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 600,
              color: '#fafafa', letterSpacing: '-0.02em', marginBottom: 4,
            }}>
              Upload de Ângulo
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.38)',
              letterSpacing: '-0.005em',
            }}>
              Renderize um rascunho com o DNA do projeto
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
              padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Upload zone */}
          <SectionLabel label="Imagem de Ângulo" />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {imagePreview ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="preview"
                style={{
                  width: '100%', aspectRatio: '16/9',
                  objectFit: 'cover', display: 'block',
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  color: '#fff', borderRadius: 6,
                  padding: '4px 10px', fontSize: 11,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Trocar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              style={{
                width: '100%', aspectRatio: '16/9',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'transparent',
                border: '0.5px dashed rgba(255,255,255,0.14)',
                borderRadius: 8, cursor: 'pointer',
                color: 'rgba(255,255,255,0.38)',
                fontFamily: 'inherit',
                marginBottom: 20,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#fafafa', marginBottom: 3 }}>
                  Arraste ou clique para enviar
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>
                  Rascunho, wireframe ou render 3D · JPG, PNG, WEBP até 10 MB
                </div>
              </div>
            </button>
          )}

          {/* Reference vista selector */}
          {refOptions.length > 0 && (
            <>
              <SectionLabel label="Vista de Referência" />
              <p style={{
                margin: '0 0 10px',
                fontSize: 10, color: 'rgba(255,255,255,0.25)',
                letterSpacing: '-0.003em', lineHeight: 1.5,
              }}>
                Vínculo de linhagem e contexto para a geração.
              </p>
              <div style={{
                display: 'flex', gap: 8,
                overflowX: 'auto', paddingBottom: 6,
                marginBottom: 20,
              }}>
                {refOptions.map(v => {
                  const isSelected = (referenceId ?? anchor?.id) === v.id
                  const label = v.vista_type === 'mestre'
                    ? 'Vista Mestre'
                    : (v.vista_label ?? v.vista_type)
                  return (
                    <button
                      key={v.id}
                      onClick={() => setReferenceId(v.id)}
                      title={label}
                      style={{
                        flexShrink: 0,
                        width: 76, padding: 0,
                        background: 'none',
                        border: `1.5px solid ${isSelected ? '#30b46c' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 7, overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 1px rgba(48,180,108,0.25)' : 'none',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{ aspectRatio: '4/3', overflow: 'hidden', position: 'relative' }}>
                        {v.output_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.output_url}
                            alt={label}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            background: 'rgba(255,255,255,0.04)',
                          }} />
                        )}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(48,180,108,0.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                              stroke="#30b46c" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      {/* Label */}
                      <div style={{
                        padding: '4px 5px',
                        fontSize: 9,
                        color: isSelected ? '#30b46c' : 'rgba(255,255,255,0.32)',
                        textAlign: 'center' as const,
                        letterSpacing: '-0.005em',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Vista label */}
          <SectionLabel label={<>Nome da Vista <span style={{ color: 'rgba(255,255,255,0.18)', fontWeight: 400 }}>(opcional)</span></>} />
          <input
            type="text"
            value={vistaLabel ?? ''}
            onChange={e => setVistaLabel(e.target.value || null)}
            placeholder="Ex: Fachada lateral, Vista jardim, Ângulo drone…"
            style={{
              width: '100%', padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${vistaLabel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 7, color: '#fafafa',
              fontSize: 12, fontFamily: 'inherit',
              letterSpacing: '-0.01em', outline: 'none',
              boxSizing: 'border-box' as const,
              transition: 'border-color 0.15s',
              marginBottom: 20,
            }}
          />

          {/* DNA hint */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: 7, padding: '8px 12px',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"
              style={{ marginTop: 1, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <span style={{
              fontSize: 10.5, color: 'rgba(255,255,255,0.35)',
              lineHeight: 1.5, letterSpacing: '-0.005em',
            }}>
              O DNA do projeto —{' '}
              {[
                space.project_dna.style,
                space.project_dna.materials,
                space.project_dna.lighting,
              ].filter(Boolean).join(' · ').slice(0, 80) || 'materiais, iluminação e estilo'}
              {' '}— é aplicado automaticamente.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 16,
              background: 'rgba(239,68,68,0.08)',
              border: '0.5px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 11.5, color: 'rgba(239,68,68,0.9)',
              letterSpacing: '-0.005em',
            }}>
              {error}
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 24px 24px',
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
        }}>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              width: '100%', padding: '12px 20px',
              background: canGenerate
                ? 'linear-gradient(180deg, #30b46c 0%, #258d54 100%)'
                : 'rgba(48,180,108,0.22)',
              color: canGenerate ? '#042818' : 'rgba(0,0,0,0.4)',
              border: 'none', borderRadius: 8,
              fontSize: 13.5, fontWeight: 600,
              fontFamily: 'inherit',
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              letterSpacing: '-0.005em',
              boxShadow: canGenerate
                ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 20px rgba(48,180,108,0.2)'
                : 'none',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: 'upload-vista-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
                Gerando Vista…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Gerar Vista
              </>
            )}
          </button>

          <div style={{
            marginTop: 8, textAlign: 'center' as const,
            fontSize: 10, color: 'rgba(255,255,255,0.2)',
            letterSpacing: '-0.005em',
          }}>
            4 créditos
          </div>
        </div>
      </div>

      <style>{`
        @keyframes upload-vista-spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
      `}</style>
    </>
  )
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 500,
      letterSpacing: '0.2em', textTransform: 'uppercase' as const,
      color: 'rgba(255,255,255,0.28)',
      marginBottom: 10,
    }}>
      {label}
    </div>
  )
}
