'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ContentAsset } from '@/lib/marketing/types'

// Upload direto browser → bucket privado marketing-assets (sign → PUT →
// confirm; o binário nunca passa pela Vercel) e listagem/arquivamento dos
// assets de marca.

const KINDS = [
  { value: 'logo',       label: 'Logo' },
  { value: 'brand_file', label: 'Arquivo de marca' },
  { value: 'image',      label: 'Imagem' },
  { value: 'cover',      label: 'Capa' },
  { value: 'reference',  label: 'Referência' },
  { value: 'video',      label: 'Vídeo' },
]

export function BrandAssetsClient({ initialAssets }: { initialAssets: ContentAsset[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState('image')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      // 1. sign (valida kind/MIME/tamanho e emite key+token)
      const signRes = await fetch('/api/admin/marketing/assets/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, content_type: file.type, size_bytes: file.size }),
      })
      const sign = await signRes.json()
      if (!signRes.ok) throw new Error(sign.error ?? 'Falha ao preparar upload')

      // 2. PUT direto no Storage (signed upload URL)
      const sb = createClient()
      const { error: upErr } = await sb.storage
        .from('marketing-assets')
        .uploadToSignedUrl(sign.key, sign.token, file, { contentType: file.type })
      if (upErr) throw new Error(`Falha no upload: ${upErr.message}`)

      // 3. confirm (revalida metadata real e registra o asset)
      const confirmRes = await fetch('/api/admin/marketing/assets/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, key: sign.key, original_filename: file.name }),
      })
      const confirm = await confirmRes.json()
      if (!confirmRes.ok) throw new Error(confirm.error ?? 'Falha ao confirmar upload')

      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function archive(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/marketing/assets/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Falha ao arquivar')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assets de marca</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Logos, arquivos de marca, capas e referências — bucket privado, exibição por URL assinada.
            Gerações do produto são vinculadas direto no briefing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="rounded-lg border border-input-border bg-input px-2 py-2 text-sm outline-none"
          >
            {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept={kind === 'video' ? 'video/mp4' : kind === 'brand_file' ? 'application/pdf,image/*' : 'image/jpeg,image/png,image/webp'}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-inverse-foreground transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar arquivo'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">{error}</p>}

      {initialAssets.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum asset de marca ainda. Máx. 25 MB por arquivo — imagens, PDF ou MP4.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {initialAssets.map(asset => (
            <div key={asset.id} className="group overflow-hidden rounded-lg border border-border bg-bg-elevated">
              {asset.display_url && asset.mime_type?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL dinâmica de bucket privado
                <img src={asset.display_url} alt={asset.original_filename ?? asset.asset_type} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center px-2 text-center text-xs text-text-tertiary">
                  {asset.original_filename ?? asset.asset_type}
                </div>
              )}
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-text-tertiary">
                <span className="truncate" title={asset.original_filename ?? ''}>{KINDS.find(k => k.value === asset.asset_type)?.label ?? asset.asset_type}</span>
                <button onClick={() => archive(asset.id)} disabled={busy} className="opacity-0 transition-opacity hover:text-text-secondary group-hover:opacity-100">
                  arquivar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-text-tertiary">
        Validação: tipo e tamanho verificados na emissão e reconfirmados contra a metadata real do objeto.
        Nada aqui é público — o bucket é privado e o acesso é exclusivo do painel.
      </p>
    </div>
  )
}
