// scripts/seedream-size-ab.mts
//
// A/B de TAMANHO do Seedream 5.0 Pro na ModelArk: o '2K' de hoje (~4,2 MP, faixa
// CARA nos dois provedores) contra o teto da faixa BARATA (lib/ai/seedream-size,
// 2,36 MP — o limite da fal, que é o mais apertado dos dois).
//
// Mesma imagem, mesmo prompt, duas chamadas. Custo: US$ 0,09 + 0,045 = 0,135
// (mais 0,135 + 0,0675 se passar --fal).
//
// Uso (na raiz, com .env.local):
//   npx tsx scripts/seedream-size-ab.mts <pastaDeSaida> [--input=URL|arquivo] [--prompt="..."] [--fal]
//
// Saída: <pasta>/2k.png, <pasta>/barato.png, <pasta>/ab-lado-a-lado.jpg (mesma
// altura, pra ler a composição), <pasta>/ab-crop.jpg (mesmo pedaço da cena, o
// barato reamostrado pro tamanho do 2K — é assim que o cliente compara),
// <pasta>/summary.md e a tabela no stdout.
//
// AVISO: o Seedream não expõe seed. As duas imagens NÃO saem idênticas — a
// comparação é de nitidez/detalhe percebido, não pixel a pixel.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const { seedreamCheapSize } = await import('@/lib/ai/seedream-size')

const OUT = process.argv[2]
if (!OUT) throw new Error('uso: npx tsx scripts/seedream-size-ab.mts <pastaDeSaida> [--input=...] [--prompt="..."] [--fal]')
fs.mkdirSync(OUT, { recursive: true })
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const WITH_FAL = process.argv.includes('--fal')

// Default: um input real de Quasar da conta do dono (print do SketchUp).
const INPUT = arg('input') ?? 'https://v3b.fal.media/files/b/0aa988b5/9IyS3IFGLRMiwRbFLjs6q_input.png'
const PROMPT = arg('prompt') ??
  'Renderização fotorrealista de arquitetura a partir deste modelo 3D. Preserve exatamente a geometria, ' +
  'o enquadramento e as proporções do original. Materiais reais com textura legível (madeira, concreto, ' +
  'vidro, tecido), iluminação natural coerente, sombras suaves e nitidez de fotografia profissional.'

const ARK_BASE = (process.env.ARK_BASE_URL?.trim() || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/+$/, '')
const ARK_MODEL = process.env.ARK_SEEDREAM_PRO_MODEL?.trim() || 'dola-seedream-5-0-pro-260628'
const ARK_KEY = process.env.ARK_API_KEY?.trim()
if (!ARK_KEY) throw new Error('ARK_API_KEY ausente no .env.local')

// Faixas de preço (conferidas 2026-09-09): ark ≤2,61 MP → 0,045; fal ≤1536² → 0,0675.
const arkCost = (px: number) => (px > 0 && px <= 2_610_000 ? 0.045 : 0.09)
const falCost = (px: number) => (px > 0 && px <= 1536 * 1536 ? 0.0675 : 0.135)

async function inputBuffer(): Promise<Buffer> {
  if (/^https?:\/\//.test(INPUT)) {
    const r = await fetch(INPUT)
    if (!r.ok) throw new Error(`input HTTP ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  }
  return fs.readFileSync(INPUT)
}

interface Run { label: string; requested: string; width: number; height: number; ms: number; usd: number; file: string }

async function ark(label: string, size: string, file: string): Promise<Run> {
  const t0 = Date.now()
  const res = await fetch(`${ARK_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ARK_KEY}` },
    body: JSON.stringify({
      model: ARK_MODEL, prompt: PROMPT, image: INPUT, size,
      output_format: 'png', response_format: 'url', watermark: false,
    }),
  })
  const json = await res.json() as { data?: { url?: string; size?: string }[]; usage?: unknown; error?: { message?: string } }
  if (!res.ok || json.error) throw new Error(`ark ${size}: HTTP ${res.status} ${json.error?.message ?? ''}`)
  const url = json.data?.[0]?.url
  if (!url) throw new Error(`ark ${size}: sem imagem`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const ms = Date.now() - t0
  fs.writeFileSync(path.join(OUT, file), buf)
  const meta = await sharp(buf).metadata()
  const w = meta.width ?? 0, h = meta.height ?? 0
  console.log(`[ark] ${label.padEnd(7)} pedido=${size.padEnd(9)} saiu=${w}x${h} (${((w * h) / 1e6).toFixed(2)} MP) ` +
    `${(ms / 1000).toFixed(1)}s usage=${JSON.stringify(json.usage ?? null)}`)
  return { label, requested: size, width: w, height: h, ms, usd: arkCost(w * h), file }
}

async function falRun(label: string, imageSize: unknown, file: string): Promise<Run> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY?.trim() })
  const t0 = Date.now()
  const out = await fal.subscribe('bytedance/seedream/v5/pro/edit', {
    input: { prompt: PROMPT, image_urls: [INPUT], image_size: imageSize, num_images: 1, output_format: 'png' } as never,
  }) as { data: { images?: { url?: string }[] } }
  const url = out.data.images?.[0]?.url
  if (!url) throw new Error(`fal ${label}: sem imagem`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const ms = Date.now() - t0
  fs.writeFileSync(path.join(OUT, file), buf)
  const meta = await sharp(buf).metadata()
  const w = meta.width ?? 0, h = meta.height ?? 0
  console.log(`[fal] ${label.padEnd(7)} pedido=${JSON.stringify(imageSize)} saiu=${w}x${h} ${(ms / 1000).toFixed(1)}s`)
  return { label, requested: JSON.stringify(imageSize), width: w, height: h, ms, usd: falCost(w * h), file }
}

/** Rótulo em cima da imagem — pra não trocar os dois lados na hora de olhar. */
function label(text: string, w: number): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="54"><rect width="100%" height="100%" fill="#0b0b0e"/>` +
    `<text x="18" y="36" font-family="Segoe UI, Arial" font-size="26" fill="#f2f2f5">${text}</text></svg>`,
  )
}

async function sideBySide(a: Run, b: Run, out: string, h: number) {
  const parts = await Promise.all([a, b].map(async r => {
    const buf = await sharp(path.join(OUT, r.file)).resize({ height: h }).png().toBuffer()
    const m = await sharp(buf).metadata()
    const w = m.width ?? h
    return sharp({ create: { width: w, height: h + 54, channels: 3, background: '#0b0b0e' } })
      .composite([
        { input: label(`${r.label} — ${r.width}x${r.height} (${((r.width * r.height) / 1e6).toFixed(2)} MP)`, w), top: 0, left: 0 },
        { input: buf, top: 54, left: 0 },
      ])
      .png().toBuffer()
  }))
  const metas = await Promise.all(parts.map(p => sharp(p).metadata()))
  const W = metas.reduce((s, m) => s + (m.width ?? 0), 0) + 24
  const H = Math.max(...metas.map(m => m.height ?? 0))
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0b0b0e' } })
    .composite([{ input: parts[0], top: 0, left: 0 }, { input: parts[1], top: 0, left: (metas[0].width ?? 0) + 24 }])
    .jpeg({ quality: 92 }).toFile(path.join(OUT, out))
}

/** Mesmo pedaço da cena nos dois, no MESMO tamanho de tela: é o que o cliente vê. */
async function cropCompare(big: Run, small: Run, out: string) {
  const region = { x: 0.30, y: 0.30, w: 0.34, h: 0.34 }   // miolo da cena
  const cut = async (r: Run, target: { w: number; h: number } | null) => {
    const c = await sharp(path.join(OUT, r.file)).extract({
      left: Math.round(r.width * region.x), top: Math.round(r.height * region.y),
      width: Math.round(r.width * region.w), height: Math.round(r.height * region.h),
    }).png().toBuffer()
    return target ? sharp(c).resize(target.w, target.h, { kernel: 'lanczos3' }).png().toBuffer() : c
  }
  const bigCut = await cut(big, null)
  const m = await sharp(bigCut).metadata()
  const w = m.width ?? 0, h = m.height ?? 0
  const smallCut = await cut(small, { w, h })
  await sharp({ create: { width: w * 2 + 24, height: h + 54, channels: 3, background: '#0b0b0e' } })
    .composite([
      { input: label(`${big.label} (nativo)`, w), top: 0, left: 0 },
      { input: label(`${small.label} (reamostrado pro mesmo tamanho)`, w), top: 0, left: w + 24 },
      { input: bigCut, top: 54, left: 0 },
      { input: smallCut, top: 54, left: w + 24 },
    ]).jpeg({ quality: 94 }).toFile(path.join(OUT, out))
}

const src = await sharp(await inputBuffer()).metadata()
const cheap = seedreamCheapSize(src.width, src.height)
if (!cheap) throw new Error('sem dimensões do input — nada a comparar')
console.log(`input ${src.width}x${src.height} (${(((src.width ?? 0) * (src.height ?? 0)) / 1e6).toFixed(2)} MP) → faixa barata ${cheap.width}x${cheap.height}\n`)

const runs: Run[] = []
runs.push(await ark('2K', '2K', '2k.png'))
runs.push(await ark('barato', `${cheap.width}x${cheap.height}`, 'barato.png'))
if (WITH_FAL) {
  runs.push(await falRun('fal 2K', 'auto_2K', 'fal-2k.png'))
  runs.push(await falRun('fal barato', cheap, 'fal-barato.png'))
}

await sideBySide(runs[0], runs[1], 'ab-lado-a-lado.jpg', 820)
await cropCompare(runs[0], runs[1], 'ab-crop.jpg')

const linhas = runs.map(r =>
  `| ${r.label} | ${r.requested} | ${r.width}x${r.height} | ${((r.width * r.height) / 1e6).toFixed(2)} MP | ${(r.ms / 1000).toFixed(1)} s | US$ ${r.usd.toFixed(4)} |`)
const md = [
  '# A/B de tamanho — Seedream 5.0 Pro', '',
  `Input: ${INPUT}`, `Dimensões do input: ${src.width}x${src.height}`, '',
  '| chamada | pedido | saiu | área | tempo | custo |', '|---|---|---|---|---|---|',
  ...linhas, '',
  `Economia por render (ModelArk): US$ ${(runs[0].usd - runs[1].usd).toFixed(4)}`, '',
  'O Seedream não tem seed — as imagens não são idênticas. Compare nitidez/detalhe, não composição.',
].join('\n')
fs.writeFileSync(path.join(OUT, 'summary.md'), md)
console.log('\n' + md)
