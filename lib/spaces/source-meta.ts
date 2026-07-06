// lib/spaces/source-meta.ts
//
// Metadados da imagem-fonte (Vista Mestre) — largura/altura/aspect ratio/hash.
// Servem a dois propósitos da revisão Preserve V2:
//   1) rastreabilidade: cada vista gerada carrega de qual source veio e qual era
//      o aspect ratio original (provenance source→generated);
//   2) validação: comparar o aspect ratio gerado contra o original.
//
// Best-effort por design: qualquer falha (fetch, decode) devolve null nos campos
// que não deu pra calcular — NUNCA lança, pra não derrubar a geração só por não
// ter conseguido medir a origem.

import sharp from 'sharp'
import { createHash } from 'crypto'
import { fetchStorageBuffer } from '@/lib/storage/fetch'

export interface SourceMeta {
  url:          string
  width:        number | null
  height:       number | null
  aspectRatio:  number | null   // width / height
  hash:         string | null   // sha256 hex dos bytes da origem
}

const FETCH_TIMEOUT_MS = 12_000

function emptyMeta(url: string): SourceMeta {
  return { url, width: null, height: null, aspectRatio: null, hash: null }
}

export async function computeSourceMeta(url: string): Promise<SourceMeta> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let buf: Buffer
    try {
      // Via storage API se bucket privado nosso (após o flip); senão fetch HTTP
      // com o mesmo timeout. Falha cai no catch externo → emptyMeta (best-effort).
      buf = await fetchStorageBuffer(url, ctrl.signal)
    } finally {
      clearTimeout(timer)
    }

    const hash = createHash('sha256').update(buf).digest('hex')

    let width: number | null = null
    let height: number | null = null
    try {
      const meta = await sharp(buf).metadata()
      width  = meta.width  ?? null
      height = meta.height ?? null
    } catch {
      // decode falhou — mantém dims null, hash ainda é útil
    }

    const aspectRatio = width && height ? width / height : null
    return { url, width, height, aspectRatio, hash }
  } catch {
    return emptyMeta(url)
  }
}

// Aspect ratio "humano" aproximado (ex.: "16:9", "4:3", "3:2", "1:1") a partir
// do número — só pra exibição/registro. Cai em "w:h" reduzido quando não bate
// num formato comum.
export function aspectRatioLabel(ar: number | null): string | null {
  if (!ar || !isFinite(ar) || ar <= 0) return null
  const common: Array<[string, number]> = [
    ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:10', 16 / 10],
    ['16:9', 16 / 9], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16],
    ['21:9', 21 / 9],
  ]
  for (const [label, value] of common) {
    if (Math.abs(ar - value) / value <= 0.03) return label
  }
  return ar.toFixed(3)
}
