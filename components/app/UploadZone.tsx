'use client'

import { useState, useCallback, useRef } from 'react'

interface UploadZoneProps {
  onUpload: (file: File, previewUrl: string) => void
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const url = URL.createObjectURL(file)
      setPreview(url)
      setFileName(file.name)
      onUpload(file, url)
    },
    [onUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-tertiary mb-3">
        PROJETO
      </p>

      <div
        role="button"
        tabIndex={0}
        className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-text-primary ${
          isDragging
            ? 'border-2 border-text-primary scale-[1.01] bg-surface'
            : preview
            ? 'border border-border'
            : 'border-2 border-dashed border-border hover:border-text-tertiary hover:bg-surface'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {preview ? (
          <div className="relative aspect-[4/3] group">
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center">
              <span className="text-white text-xs font-medium uppercase tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                trocar imagem
              </span>
            </div>
          </div>
        ) : (
          <div className="aspect-[4/3] flex flex-col items-center justify-center gap-4 p-8">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                isDragging ? 'bg-text-primary text-bg scale-110' : 'bg-surface text-text-tertiary'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 3v10M5 8l5-5 5 5M3 17h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">
                {isDragging ? 'solte aqui' : 'arraste ou clique'}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">PNG, JPG ou WEBP</p>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {fileName && (
        <p className="mt-2 text-xs text-text-tertiary truncate pl-1">{fileName}</p>
      )}
    </div>
  )
}
