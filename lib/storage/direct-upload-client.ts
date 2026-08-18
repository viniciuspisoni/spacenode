// lib/storage/direct-upload-client.ts
//
// Lado do browser do upload direto (ver lib/storage/direct-upload.ts):
// sign → PUT direto no Storage → confirm. O arquivo NUNCA trafega pela Vercel
// (Functions rejeitam corpo > 4,5 MB com 413 em texto puro).
//
// Uso típico (upload puro — precisa da URL):
//   const { url } = await uploadDirect(file, 'finalizar-asset', { kind: 'source' })
//
// Rotas de trabalho que consomem a key (upscale, video…): pule o confirm —
// a própria rota valida/baixa o objeto:
//   const { key } = await uploadDirect(file, 'upscale-source', {}, { confirm: false })
//
// Lança Error com mensagem amigável (pronta pra setError/UI) em qualquer etapa.

import { createClient } from '@/lib/supabase/client'
import { jsonOrNull, errMsg } from '@/lib/http/fetch-json'
import { track } from '@/lib/analytics/client'
import type { DirectUploadAreaId } from '@/lib/storage/direct-upload'

export interface DirectUploadResult {
  key: string
  /** URL pública (null quando confirm: false). */
  url: string | null
  size?: number
  mime?: string
  /** Medidos pelo confirm em áreas com probe (ex.: retocar-reference). */
  width?: number | null
  height?: number | null
}

export async function uploadDirect(
  file: Blob,
  area: DirectUploadAreaId,
  params: Record<string, string> = {},
  opts: { confirm?: boolean } = {},
): Promise<DirectUploadResult> {
  // 1. sign
  const signRes = await fetch('/api/uploads/sign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ area, contentType: file.type, sizeBytes: file.size, params }),
  })
  const signData = await jsonOrNull(signRes)
  const bucket = signData?.bucket
  const key    = signData?.key
  const token  = signData?.token
  if (!signRes.ok || typeof bucket !== 'string' || typeof key !== 'string' || typeof token !== 'string') {
    throw new Error(errMsg(signData, 'Erro ao preparar upload'))
  }

  // 2. PUT direto browser → Storage
  const supabase = createClient()
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(key, token, file, { contentType: file.type })
  if (uploadErr) {
    throw new Error('Erro ao enviar o arquivo. Verifique a conexão e tente novamente.')
  }

  // Funil: upload concluído — ÚNICA porta browser→Storage do produto, então
  // uma chamada aqui cobre todas as superfícies. Só a área (nunca o arquivo).
  track('image_uploaded', { area })

  if (opts.confirm === false) return { key, url: null }

  // 3. confirm — valida o objeto e devolve a URL pública
  const confirmRes = await fetch('/api/uploads/confirm', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ area, key, params }),
  })
  const confirmData = await jsonOrNull(confirmRes)
  const url = confirmData?.url
  if (!confirmRes.ok || typeof url !== 'string') {
    throw new Error(errMsg(confirmData, 'Erro ao confirmar upload'))
  }
  return {
    key,
    url,
    size:   typeof confirmData?.size === 'number' ? confirmData.size : undefined,
    mime:   typeof confirmData?.mime === 'string' ? confirmData.mime : undefined,
    width:  typeof confirmData?.width  === 'number' ? confirmData.width  : null,
    height: typeof confirmData?.height === 'number' ? confirmData.height : null,
  }
}
