// Verificação LOCAL (sem custo, sem API, sem upload) do re-encode de resultado
// do Editar v2 (P1). Replica a lógica de encodeResultForStorage de
// lib/edit-v2/pipeline.ts sobre um PNG grande de RUÍDO de alta frequência —
// pior caso de compressão, simula um painel ripado/render texturizado que
// estoura o limite de 15 MB do bucket em PNG lossless.
//
// Rodar: node scripts/test-storage-encode.mjs

import sharp from 'sharp'

const BUCKET_LIMIT = 15 * 1024 * 1024 // 15 MB (space-mestres.file_size_limit)
const STORAGE_MAX_BYTES = 14 * 1024 * 1024 // alvo conservador do helper
const mb = b => (b / 1024 / 1024).toFixed(2) + ' MB'

// Réplica fiel do helper (mantém em sincronia com pipeline.ts)
async function encodeResultForStorage(buf) {
  for (const quality of [92, 86, 80, 72]) {
    const out = await sharp(buf).jpeg({ quality, mozjpeg: true }).keepMetadata().toBuffer()
    if (out.length <= STORAGE_MAX_BYTES) return { out, quality, resized: null }
  }
  const meta = await sharp(buf).metadata()
  let width = meta.width ?? 0
  for (let i = 0; i < 6 && width > 1; i++) {
    width = Math.round(width * 0.85)
    const out = await sharp(buf).resize({ width }).jpeg({ quality: 82, mozjpeg: true }).keepMetadata().toBuffer()
    if (out.length <= STORAGE_MAX_BYTES) return { out, quality: 82, resized: width }
  }
  const out = await sharp(buf).resize({ width: Math.max(1, width) }).jpeg({ quality: 60, mozjpeg: true }).keepMetadata().toBuffer()
  return { out, quality: 60, resized: width }
}

async function main() {
  // 1) PNG de ruído 4000×3000 (incompressível): emula o pior caso real.
  const W = 4000, H = 3000
  const raw = Buffer.allocUnsafe(W * H * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0
  const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .withMetadata({ icc: 'srgb' })
    .png()
    .toBuffer()

  console.log(`PNG lossless ${W}×${H} (ruído):      ${mb(png.length)}  ${png.length > BUCKET_LIMIT ? '→ ESTOURA o limite de 15 MB (reproduz a falha)' : '(não estourou — aumentar o caso)'}`)

  // 2) Re-encode com o helper.
  const { out, quality, resized } = await encodeResultForStorage(png)
  const meta = await sharp(out).metadata()
  console.log(`JPEG armazenado (q=${quality}${resized ? `, resize→${resized}px` : ''}): ${mb(out.length)}  formato=${meta.format}  ${meta.width}×${meta.height}`)

  // 3) Asserções.
  const okSize = out.length < BUCKET_LIMIT
  const okFmt = meta.format === 'jpeg'
  console.log(`\nASSERT  arquivo < 15 MB: ${okSize ? 'OK' : 'FALHOU'}`)
  console.log(`ASSERT  formato jpeg:    ${okFmt ? 'OK' : 'FALHOU'}`)

  if (!okSize || !okFmt) {
    console.error('\nTESTE FALHOU')
    process.exit(1)
  }
  console.log('\nTESTE OK — upload do resultado fica abaixo de 15 MB.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
