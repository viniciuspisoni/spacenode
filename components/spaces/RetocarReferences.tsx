'use client'

// Painel "Referências da edição" (V1) — texturas, objetos e imagens do projeto.
// Autocontido (não importa de RetocarStandaloneFlow pra evitar ciclo).

import { useState } from 'react'
import type { EditReferenceImage, EditReferenceRole } from '@/lib/spaces/edit-router'
import { MAX_EDIT_REFERENCES } from '@/lib/spaces/edit-router'

/** Opções do menu "+ Adicionar referência". O parent traduz kind → (role, mecanismo). */
export type RefMenuKind = 'material' | 'object' | 'original' | 'project_render' | 'vista_mestre' | 'custom'

export const REF_MENU: { kind: RefMenuKind; label: string }[] = [
  { kind: 'material',       label: 'Textura / Material' },
  { kind: 'object',         label: 'Objeto / Móvel' },
  { kind: 'original',       label: 'Imagem original' },
  { kind: 'project_render', label: 'Render do projeto' },
  { kind: 'vista_mestre',   label: 'Vista mestre' },
  { kind: 'custom',         label: 'Outra referência' },
]

export function refRoleLabel(role: EditReferenceRole): string {
  switch (role) {
    case 'material_texture':      return 'Textura / Material'
    case 'object_reference':      return 'Objeto / Móvel'
    case 'person_reference':      return 'Pessoa'
    case 'original_image':        return 'Imagem original'
    case 'restore_reference':     return 'Restaurar elemento'
    case 'project_render':        return 'Render do projeto'
    case 'consistency_reference': return 'Vista mestre / Consistência'
    case 'style_reference':       return 'Estilo'
    case 'lighting_reference':    return 'Iluminação'
    case 'landscape_reference':   return 'Paisagismo'
    default:                      return 'Referência'
  }
}

/** Pré-preenchimento inteligente do prompt por papel (#7). '' = não sugerir. */
export function suggestPromptForRole(role: EditReferenceRole): string {
  switch (role) {
    case 'material_texture':      return 'aplicar nesta área o material da referência'
    case 'project_render':
    case 'consistency_reference': return 'manter esta área consistente com a imagem de referência'
    case 'original_image':
    case 'restore_reference':     return 'restaurar este elemento para ficar igual à referência'
    case 'object_reference':      return 'substituir o objeto selecionado usando a referência'
    default:                      return ''
  }
}

function sourceLabel(source: EditReferenceImage['source']): string {
  return source === 'project' ? 'do projeto' : source === 'original' ? 'imagem original' : 'upload'
}

/** Identificador legível do arquivo (último segmento da URL), truncado no meio. */
function fileNameFromUrl(url: string): string {
  const last = (url.split('?')[0].split('/').pop() || url)
  return last.length > 30 ? `${last.slice(0, 14)}…${last.slice(-12)}` : last
}

/** Reduz a imagem NO BROWSER antes do upload: o limite de body das funções da
 *  Vercel é ~4.5MB, e texturas de alta-res (≥2k px PBR) passam disso → 413. 2000px
 *  é mais que suficiente pro IP-adapter, então downscale + JPEG mantém fidelidade
 *  e fica bem abaixo do limite. Fallback: devolve o arquivo original se algo falhar. */
export async function downscaleImageForUpload(file: File, maxDim = 2000, quality = 0.9): Promise<Blob> {
  try {
    const img = await createImageBitmap(file)
    const { width, height } = img
    const scale = Math.min(1, maxDim / Math.max(width, height))
    // Já pequeno o bastante (e leve)? não mexe.
    if (scale >= 1 && file.size <= 3.8 * 1024 * 1024) { img.close?.(); return file }
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { img.close?.(); return file }
    ctx.drawImage(img, 0, 0, w, h)
    img.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch { return file }
}

export function ReferencesPanel({ references, onAdd, onRemove, onClearAll, primaryRole, disabled }: {
  references:   EditReferenceImage[]
  onAdd:        (kind: RefMenuKind) => void
  onRemove:     (id: string) => void
  onClearAll?:  () => void
  /** Papel que o engine usa como referência principal (references[0]) p/ a ferramenta atual. */
  primaryRole?: EditReferenceRole | null
  disabled:     boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const full = references.length >= MAX_EDIT_REFERENCES

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
      }}>
        Referências da edição
      </div>
      <p style={{ fontSize: 10, color: 'var(--color-text-quaternary)', lineHeight: 1.5, marginTop: -2 }}>
        Adicione texturas, objetos ou imagens do projeto para orientar a edição. Para troca de material, texturas de <strong>≥1000px</strong> dão muito mais fidelidade.
      </p>

      {references.map(ref => {
        const isPrimary = primaryRole != null && ref.role === primaryRole
        return (
          <div key={ref.id} style={{
            display: 'flex', gap: 8, alignItems: 'center', padding: 8,
            background: 'var(--color-bg)',
            border: isPrimary ? '1px solid rgba(29,158,117,0.55)' : '0.5px solid var(--color-border)',
            borderRadius: 8,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ref.url} alt={refRoleLabel(ref.role)}
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
                  {refRoleLabel(ref.role)}
                </span>
                <span style={{
                  fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: '#1D9E75', background: 'rgba(29,158,117,0.12)',
                  padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap',
                }}>
                  {isPrimary ? '● ativa · principal' : '● ativa'}
                </span>
              </div>
              <div title={fileNameFromUrl(ref.url)} style={{ fontSize: 10, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fileNameFromUrl(ref.url)}
              </div>
              {ref.note && (
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ref.note}
                </div>
              )}
              <div style={{ fontSize: 9, color: 'var(--color-text-quaternary)' }}>{sourceLabel(ref.source)}</div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(ref.id)}
              disabled={disabled}
              title="Remover"
              style={{
                width: 24, height: 24, borderRadius: 6, flex: '0 0 auto',
                background: 'transparent', border: '0.5px solid var(--color-border-strong)',
                color: 'var(--color-text-secondary)', cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 13, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )
      })}

      {references.length > 0 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          disabled={disabled}
          style={{
            alignSelf: 'flex-start', background: 'transparent', border: 'none',
            color: 'var(--color-text-tertiary)', cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 10.5, padding: '2px 0', textDecoration: 'underline', fontFamily: 'inherit',
          }}
        >
          Remover todas as referências
        </button>
      )}

      {full ? (
        <div style={{ fontSize: 10, color: 'var(--color-text-quaternary)' }}>
          Máximo de {MAX_EDIT_REFERENCES} referências.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            disabled={disabled}
            className="spn-action spn-action--ghost"
            style={{ width: '100%', padding: '8px 14px', fontSize: 12 }}
          >
            + Adicionar referência
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5,
              background: 'var(--color-bg-elevated)', border: '0.5px solid var(--color-border-strong)',
              borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {REF_MENU.map(opt => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => { setMenuOpen(false); onAdd(opt.kind) }}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
