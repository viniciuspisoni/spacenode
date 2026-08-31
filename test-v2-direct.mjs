// Valida o fluxo NOVO da rota /segment: blob cruzando o tapete -> evf floor/wall
// por overlap -> escolhe floor -> closeErode -> superfície limpa (tapete excluído)?
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { blobCoverageByMask, closeErodeMask, maskWhiteRatio } from './lib/spaces/edit-crop.ts'
import { callEvfSam } from './lib/spaces/engines/evf-sam-segment.ts'

const env = readFileSync('.env.local', 'utf8')
const KEY = (env.match(/^\s*FAL_KEY\s*=\s*(.+)\s*$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
fal.config({ credentials: KEY })

const SRC = 'https://v3b.fal.media/files/b/0a9cf125/NTPhqTIa_LPMw-_iyBuOc_R5cfYTTR.jpg'
const render = Buffer.from(await (await fetch(SRC)).arrayBuffer())
const rm = await sharp(render).metadata(); const W = rm.width, H = rm.height

// blob CRUZANDO: piso + tapete
const bx = await sharp({ create: { width: 1000, height: 170, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer()
const blob = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
  .composite([{ input: bx, left: 900, top: 1080 }]).png().toBuffer()

// lógica da rota
const evf = (await Promise.all(['floor', 'wall'].map(async (s) => {
  try { const r = await callEvfSam({ imageUrl: SRC, prompt: s }); const buf = Buffer.from(await (await fetch(r.maskUrl)).arrayBuffer()); return { s, buf, cov: await blobCoverageByMask(buf, blob) } } catch { return null }
}))).filter(Boolean)
console.log('coverages:', evf.map(e => `${e.s}=${(e.cov * 100).toFixed(0)}%`).join('  '))
const best = evf.sort((a, b) => b.cov - a.cov)[0]
console.log('escolhido:', best?.s, '| cov', (best?.cov * 100).toFixed(0) + '%', '| usa evf?', (best && best.cov >= 0.5))

if (best && best.cov >= 0.5) {
  const mask = await closeErodeMask(best.buf)
  console.log('surfaceRatio:', ((await maskWhiteRatio(mask)) * 100).toFixed(1) + '%')
  const raw = await sharp(mask).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
  const dim = Buffer.alloc(raw.length); for (let i = 0; i < raw.length; i++) dim[i] = Math.round(raw[i] * 0.5)
  const green = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { green[i*3]=40; green[i*3+1]=230; green[i*3+2]=60 }
  const ov = await sharp(green, { raw: { width: W, height: H, channels: 3 } }).joinChannel(dim, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
  writeFileSync('_v2_direct.jpg', await sharp(render).composite([{ input: ov }]).jpeg({ quality: 82 }).toBuffer())
  console.log('salvo _v2_direct.jpg')
} else {
  console.log('evf não casou -> cairia no SAM')
}
