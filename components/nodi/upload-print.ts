import { createClient } from '@/lib/supabase/client'
import type { NodiAttachment } from '@/lib/nodi/v2/types'

export async function uploadPrint(file: File): Promise<NodiAttachment> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
    throw new Error('Use JPG, PNG ou WebP de até 8 MB.')
  }
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/nodi/v2/upload', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) throw new Error(data?.error || 'Não foi possível enviar o print. Tente novamente.')
    return data
  }
  const signed = await post({ step: 'sign', mime: file.type, size: file.size })
  if (signed.bucket !== 'spacenode-media' || typeof signed.key !== 'string' || typeof signed.token !== 'string') {
    throw new Error('Não foi possível preparar o envio.')
  }
  const { error } = await createClient().storage.from(signed.bucket)
    .uploadToSignedUrl(signed.key, signed.token, file, { contentType: file.type })
  if (error) throw new Error('Não foi possível enviar o print. Confira sua conexão e tente novamente.')
  const confirmed = await post({ step: 'confirm', key: signed.key })
  if (confirmed.attachment?.kind !== 'upload' || typeof confirmed.attachment.id !== 'string') {
    throw new Error('Não foi possível conferir o print. Envie novamente.')
  }
  return confirmed.attachment
}
