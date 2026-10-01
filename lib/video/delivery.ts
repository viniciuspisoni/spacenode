// Entrega técnica do vídeo: só aceita MP4 de hosts da fal, limita o download
// em memória e guarda uma cópia durável no bucket privado existente.
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'spacenode-media'
const MAX_BYTES = 120 * 1024 * 1024
const MIN_BYTES = 1024
const SOURCE_HOSTS = ['fal.media', 'fal.run']

export interface DeliveredVideo {
  storedUrl: string | null
  storageKey: string | null
  bytes: number
  // Se o Storage falhar, o arquivo verificado ainda pode ser entregue pela fal.
  status: 'stored' | 'provider_fallback'
}

function trustedSource(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl)
    return url.protocol === 'https:' && SOURCE_HOSTS.some(host =>
      url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

export function assertMp4(buffer: Buffer): void {
  // A box ftyp começa no byte 4 dos MP4 convencionais. Isto confirma apenas
  // o contêiner, não duração, codec ou fidelidade arquitetônica.
  if (buffer.byteLength < MIN_BYTES || buffer.toString('ascii', 4, 8) !== 'ftyp') {
    throw new Error('Vídeo inválido ou incompleto')
  }
  const firstBoxLength = buffer.readUInt32BE(0)
  if (firstBoxLength < 16 || firstBoxLength > buffer.byteLength) {
    throw new Error('Cabeçalho MP4 inválido')
  }
  let offset = 0
  let hasMedia = false
  let hasMetadata = false
  while (offset + 8 <= buffer.byteLength) {
    const size = buffer.readUInt32BE(offset)
    const kind = buffer.toString('ascii', offset + 4, offset + 8)
    // Aceita a box final de tamanho zero (estende-se até o fim do arquivo).
    const boxEnd = size === 0 ? buffer.byteLength : offset + size
    if (size !== 0 && size < 8 || boxEnd > buffer.byteLength) {
      throw new Error('Estrutura MP4 incompleta')
    }
    if (kind === 'mdat') hasMedia = true
    if (kind === 'moov' || kind === 'moof') hasMetadata = true
    offset = boxEnd
  }
  if (offset !== buffer.byteLength || !hasMedia || !hasMetadata) {
    throw new Error('Vídeo MP4 sem mídia ou metadados')
  }
}

async function boundedDownload(sourceUrl: string, fetcher: typeof fetch): Promise<Buffer> {
  let currentUrl = sourceUrl
  let response: Response | null = null
  const signal = AbortSignal.timeout(90_000)
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!trustedSource(currentUrl)) throw new Error('Origem do vídeo não autorizada')
    response = await fetcher(currentUrl, { redirect: 'manual', signal })
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get('location')
    if (!location || redirect === 3) throw new Error('Redirecionamento do vídeo inválido')
    currentUrl = new URL(location, currentUrl).toString()
  }
  if (!response) throw new Error('Vídeo indisponível')
  if (!response.ok || !response.body) throw new Error(`Download do vídeo falhou (${response.status})`)
  const declaredLength = Number(response.headers.get('content-length'))
  if (declaredLength > MAX_BYTES) {
    await response.body.cancel()
    throw new Error('Vídeo excede o limite de entrega')
  }
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (mime && mime !== 'video/mp4' && mime !== 'application/octet-stream') {
    await response.body.cancel()
    throw new Error('Formato do vídeo inesperado')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Vídeo excede o limite de entrega')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const buffer = Buffer.concat(chunks, size)
  assertMp4(buffer)
  return buffer
}

export async function deliverGeneratedVideo(
  admin: SupabaseClient,
  sourceUrl: string,
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<DeliveredVideo> {
  const buffer = await boundedDownload(sourceUrl, fetcher)
  const key = `${userId}/animar/${randomUUID()}.mp4`
  try {
    const { error } = await admin.storage.from(BUCKET).upload(key, buffer, {
      contentType: 'video/mp4', upsert: false,
    })
    if (error) throw error
    return {
      storedUrl: admin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl,
      storageKey: key,
      bytes: buffer.byteLength,
      status: 'stored',
    }
  } catch (error) {
    console.error('[video/delivery] re-hospedagem falhou:', error)
    return { storedUrl: null, storageKey: null, bytes: buffer.byteLength, status: 'provider_fallback' }
  }
}
