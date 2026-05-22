'use client'

// Wrapper de upload de imagem usado pelo canvas principal e também pelo
// painel "Cena guiada" (frame final). Reaproveita o hook useImageUpload.

import { useRef, useState } from 'react'
import { useImageUpload } from '../_hooks/useImageUpload'

interface Props {
  label?:        string                                           // ex: "Imagem do projeto"
  hint?:         string                                           // ex: "Frame inicial obrigatório"
  preview:       string | null
  wasCropped?:   boolean
  onLoaded:      (file: File, preview: string, wasCropped: boolean) => void
  onClear?:      () => void
  onError?:      (msg: string) => void
  disabled?:     boolean
  compact?:      boolean                                          // versão pequena para painel
}

export default function ReferenceFrameUploader({
  label,
  hint,
  preview,
  wasCropped,
  onLoaded,
  onClear,
  onError,
  disabled,
  compact,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { loadFile } = useImageUpload({
    onLoaded: r => onLoaded(r.file, r.preview, r.wasCropped),
    onError,
  })

  const baseMinHeight = compact ? 92 : 140

  return (
    <div>
      {label && (
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.40)',
          marginBottom: 8,
        }}>
          {label}
        </div>
      )}

      <div
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          if (disabled) return
          const f = e.dataTransfer.files[0]
          if (f) loadFile(f)
        }}
        style={{
          border: `1.5px dashed ${
            isDragging      ? 'rgba(255,255,255,0.4)' :
            preview         ? 'rgba(255,255,255,0.18)' :
                              'rgba(255,255,255,0.10)'
          }`,
          borderRadius:   10,
          overflow:       'hidden',
          padding:        preview ? 0 : (compact ? '18px 12px' : '24px 16px'),
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          cursor:         disabled ? 'default' : 'pointer',
          background:     isDragging ? 'rgba(255,255,255,0.04)' : 'transparent',
          transition:     'border-color 0.15s, background 0.15s',
          minHeight:      preview ? 0 : baseMinHeight,
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            style={{
              width:     '100%',
              display:   'block',
              maxHeight: compact ? 120 : 220,
              objectFit: 'cover',
            }}
          />
        ) : (
          <>
            <svg width={compact ? 18 : 22} height={compact ? 18 : 22} viewBox="0 0 24 24"
              fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
              {hint ?? 'Arraste ou clique para enviar'}
            </span>
            {!compact && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>
                PNG, JPG, WEBP — até 20 MB
              </span>
            )}
          </>
        )}
      </div>

      {preview && !disabled && (
        <div style={{
          marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {wasCropped ? (
            <span style={{ fontSize: 10, color: 'rgba(255,200,50,0.65)' }}>
              Recortada automaticamente
            </span>
          ) : <span />}
          {onClear && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onClear() }}
              style={{
                fontSize: 10,
                color:    'rgba(255,255,255,0.3)',
                background: 'none', border: 'none',
                cursor:   'pointer', padding: 0,
              }}
            >
              Trocar imagem
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
      />
    </div>
  )
}
