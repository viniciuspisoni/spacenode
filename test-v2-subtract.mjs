// Valida a V2 ponta-a-ponta: blob CRUZANDO o tapete -> SAM (inclui o tapete) ->
// evf-sam objetos -> subtrai -> tapete removido da mascara da superficie?
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { samplePointsFromMask, refineSurfaceMask, subtractObjectsFromSurface } from './lib/spaces/edit-crop.ts'
import { callSam2Segment } from './lib/spaces/engines/sam2-segment.ts'
import { callEvfSam, SURFACE_OBJECTS_PROMPT } from './lib/spaces/engines/evf-sam-segment.ts'

const env = readFileSync('.env.local', 'utf8')
const KEY = (env.match(/^\s*FAL_KEY\s*=\s*(.+)\s*$/m)?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
fal.config({ credentials: KEY })

const SRC = 'https://v3b.fal.media/files/b/0a9cf125/NTPhqTIa_LPMw-_iyBuOc_R5cfYTTR.jpg'
const render = Buffer.from(await (await fetch(SRC)).arrayBuffer())
const rm = await sharp(render).metadata(); const W = rm.width, H = rm.height

// blob CRUZANDO: piso (esquerda) + tapete (centro)
const bx = await sharp({ create: { width: 1000, height: 170, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer()
const blob = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
  .composite([{ input: bx, left: 900, top: 1080 }]).png().toBuffer()

const pts = await samplePointsFromMask(blob)
const { maskUrl } = await callSam2Segment({ imageUrl: SRC, points: pts.map(p => ({ x: p.x, y: p.y, label: 1 })) })
const samBuf = Buffer.from(await (await fetch(maskUrl)).arrayBuffer())
const refined = await refineSurfaceMask(samBuf, blob)
console.log('SAM+refine surfaceRatio:', (refined.surfaceRatio * 100).toFixed(1) + '% (deve incluir o tapete)')

const evf = await callEvfSam({ imageUrl: SRC, prompt: SURFACE_OBJECTS_PROMPT, expandMask: 3 })
const objBuf = Buffer.from(await (await fetch(evf.maskUrl)).arrayBuffer())
const { mask: clean, surfaceRatio, removedRatio } = await subtractObjectsFromSurface(refined.mask, objBuf)
console.log('apos subtracao:', (surfaceRatio * 100).toFixed(1) + '% | removido:', (removedRatio * 100).toFixed(1) + '% da superficie')

async function overlay(name, mask) {
  const raw = await sharp(mask).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
  const dim = Buffer.alloc(raw.length); for (let i = 0; i < raw.length; i++) dim[i] = Math.round(raw[i] * 0.5)
  const red = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { red[i*3]=40; red[i*3+1]=230; red[i*3+2]=60 }
  const ov = await sharp(red, { raw: { width: W, height: H, channels: 3 } }).joinChannel(dim, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer()
  writeFileSync(name, await sharp(render).composite([{ input: ov }]).jpeg({ quality: 82 }).toBuffer())
}
await overlay('_v2_before.jpg', refined.mask)
await overlay('_v2_after.jpg', clean)
console.log('salvos _v2_before.jpg (SAM com tapete) e _v2_after.jpg (apos subtrair objetos)')
