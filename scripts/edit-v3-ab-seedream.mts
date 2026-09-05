// scripts/edit-v3-ab-seedream.mts
//
// A/B do Editar V3: motor Google (Gemini) × Seedream 5.0 Pro Edit nos MESMOS casos
// com máscara, passando pelo pipeline real (crop → prompt → provider → recompose →
// gates). Imagens/máscaras/resultados vão pro storage temporário da fal.
//
// Uso (na raiz do projeto, com .env.local):
//   npx tsx scripts/edit-v3-ab-seedream.mts <pastaDeSaida> [--engines=google,seedream] [--cases=a,b] [--route=fal|ark]
//
// Saída: <pasta>/<caso>-<motor>.png, <pasta>/<caso>-ab.jpg (original | google |
// seedream), <pasta>/summary.md e a tabela no stdout. Gate semântico desligado
// (EDIT_V3_SEMANTIC_GATE=0) — a comparação é por pixels + inspeção visual.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { fal } from '@fal-ai/client'

// .env.local ANTES de importar o pipeline (chaves Google/FAL/Supabase).
for (const line of fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
process.env.EDIT_V3_SEMANTIC_GATE ??= '0'
// --route=ark → Seedream direto na ModelArk (ARK_API_KEY); default via fal.
const routeArg = process.argv.find(a => a.startsWith('--route='))?.split('=')[1]
if (routeArg) process.env.EDIT_V3_SEEDREAM_ROUTE = routeArg
fal.config({ credentials: process.env.FAL_KEY?.trim() })

const { runEditV3 } = await import('@/lib/edit-v3/pipeline')
type EditV3Engine = import('@/lib/edit-v3/types').EditV3Engine
type EditV3Action = import('@/lib/edit-v3/types').EditV3Action

const OUT = process.argv[2]
if (!OUT) throw new Error('uso: npx tsx scripts/edit-v3-ab-seedream.mts <pastaDeSaida>')
fs.mkdirSync(OUT, { recursive: true })
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const ENGINES = (arg('engines') ?? 'google,seedream').split(',') as EditV3Engine[]
const ONLY = arg('cases')?.split(',')

const RENDERS = 'C:/Users/Pisoni/spacenode/marketing/renders/depois'

/** Máscara = retângulo (x, y, w, h em px) com buracos opcionais (também retângulos). */
interface Case {
  id: string
  image: string
  action: EditV3Action
  instruction: string
  rect: [number, number, number, number]
  holes?: [number, number, number, number][]
}

const CASES: Case[] = [
  { id: 'living-piso',    image: 'living',    action: 'swap_material', instruction: 'light natural oak wood planks',            rect: [0, 590, 1376, 178] },
  { id: 'living-parede',  image: 'living',    action: 'swap_material', instruction: 'soft sage green painted wall',            rect: [450, 160, 700, 380], holes: [[600, 315, 300, 160], [940, 315, 150, 225]] },
  { id: 'living-cortina', image: 'living',    action: 'swap_material', instruction: 'heavy dark grey linen curtains',          rect: [55, 60, 200, 540] },
  { id: 'living-remover', image: 'living',    action: 'remove',        instruction: 'the flower bouquet and its vase',         rect: [690, 415, 165, 135] },
  { id: 'banheiro-piso',  image: 'banheiro',  action: 'swap_material', instruction: 'large-format white marble floor tiles',   rect: [0, 700, 1280, 132] },
  { id: 'banheiro-parede',image: 'banheiro',  action: 'swap_material', instruction: 'glossy white subway wall tiles',         rect: [585, 95, 415, 480] },
  { id: 'cowork-piso',    image: 'coworking', action: 'swap_material', instruction: 'polished white terrazzo floor',          rect: [0, 440, 1664, 200] },
  { id: 'cowork-madeira', image: 'coworking', action: 'swap_material', instruction: 'black slate stone cladding',             rect: [560, 130, 420, 290], holes: [[735, 275, 60, 130]] },
]

async function maskPng(c: Case, w: number, h: number): Promise<Buffer> {
  const [x, y, rw, rh] = c.rect
  const holes = (c.holes ?? []).map(([hx, hy, hw, hh]) => `M${hx} ${hy}h${hw}v${hh}h${-hw}z`).join(' ')
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#000"/><path d="M${x} ${y}h${rw}v${rh}h${-rw}z ${holes}" fill="#fff" fill-rule="evenodd"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function upload(buf: Buffer, name: string, type: string): Promise<string> {
  return fal.storage.upload(new File([new Uint8Array(buf)], name, { type }))
}

interface Row {
  caseId: string; engine: EditV3Engine; ok: boolean; err?: string
  model?: string | null; usedFallback?: boolean; retried?: boolean; usedCrop?: boolean
  rejected?: boolean; reasons?: string[]; outOfMask?: number | null; inMask?: number | null
  providerMs?: number; costUsd?: number | null; resultBuf?: Buffer
}

async function runCase(c: Case, engine: EditV3Engine, srcUrl: string, maskUrl: string): Promise<Row> {
  const t0 = Date.now()
  try {
    const run = await runEditV3({
      request: {
        action: c.action, sourceImageUrl: srcUrl, maskUrl, instruction: c.instruction,
        quality: 'standard', preservation: 'maximum', intensity: 'standard', outputResolution: '2K', references: [],
      },
      instructionEn: c.instruction,
      model: 'gemini-3.1-flash-image',
      resolution: '2K',
      falFallback: false,
      engine,
      uploadAsset: (buf, kind) => upload(buf, `${c.id}-${engine}-${kind}.png`, 'image/png'),
    })
    const resultBuf = run.resultUrl ? Buffer.from(await (await fetch(run.resultUrl)).arrayBuffer()) : undefined
    if (resultBuf) fs.writeFileSync(path.join(OUT, `${c.id}-${engine}.png`), resultBuf)
    return {
      caseId: c.id, engine, ok: true, model: run.model, usedFallback: run.usedFallback, retried: run.retried,
      usedCrop: run.usedCrop, rejected: run.rejected, reasons: run.rejectReasons,
      outOfMask: run.metrics.outOfMaskDelta, inMask: run.metrics.inMaskDelta,
      providerMs: run.stages.provider.durationMs, costUsd: run.stages.provider.realCostUsd, resultBuf,
    }
  } catch (e) {
    return { caseId: c.id, engine, ok: false, err: (e as Error).message, providerMs: Date.now() - t0 }
  }
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length)
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k]() }
  }))
  return out
}

const cases = ONLY ? CASES.filter(c => ONLY.includes(c.id)) : CASES
const srcCache = new Map<string, { buf: Buffer; url: string; w: number; h: number }>()
for (const c of cases) {
  if (srcCache.has(c.image)) continue
  const buf = fs.readFileSync(`${RENDERS}/${c.image}.jpg`)
  const m = await sharp(buf).metadata()
  srcCache.set(c.image, { buf, url: await upload(buf, `${c.image}.jpg`, 'image/jpeg'), w: m.width!, h: m.height! })
}
const tasks: (() => Promise<Row>)[] = []
const maskUrls = new Map<string, string>()
for (const c of cases) {
  const s = srcCache.get(c.image)!
  const mask = await maskPng(c, s.w, s.h)
  fs.writeFileSync(path.join(OUT, `${c.id}-mask.png`), mask)
  maskUrls.set(c.id, await upload(mask, `${c.id}-mask.png`, 'image/png'))
  for (const engine of ENGINES) tasks.push(() => runCase(c, engine, s.url, maskUrls.get(c.id)!))
}
console.log(`rodando ${tasks.length} edições (${cases.length} casos × ${ENGINES.join('/')})…`)
const rows = await pool(tasks, 3)

// Tabela
const fmt = (v: number | null | undefined, d = 3) => v == null ? '—' : v.toFixed(d)
const lines = ['| caso | motor | modelo | crop | retry | fallback | fora da máscara | dentro | gate | tempo | custo US$ |', '|---|---|---|---|---|---|---|---|---|---|---|']
for (const r of rows) {
  lines.push(r.ok
    ? `| ${r.caseId} | ${r.engine} | ${r.model ?? '—'} | ${r.usedCrop ? 'sim' : 'não'} | ${r.retried ? 'sim' : 'não'} | ${r.usedFallback ? 'SIM' : 'não'} | ${fmt(r.outOfMask, 4)} | ${fmt(r.inMask, 3)} | ${r.rejected ? 'REJEITADO ' + r.reasons?.join(',') : 'ok'} | ${((r.providerMs ?? 0) / 1000).toFixed(0)} s | ${fmt(r.costUsd, 3)} |`
    : `| ${r.caseId} | ${r.engine} | FALHOU: ${r.err?.slice(0, 80)} | | | | | | | ${((r.providerMs ?? 0) / 1000).toFixed(0)} s | |`)
}
console.log(lines.join('\n'))
fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n')

// Composições original | google | seedream por caso (com a máscara contornada no original)
for (const c of cases) {
  const s = srcCache.get(c.image)!
  const tileW = 600, tileH = Math.round(tileW * s.h / s.w)
  const label = (t: string) => Buffer.from(`<svg width="${tileW}" height="24"><rect width="${tileW}" height="24" fill="rgba(0,0,0,.65)"/><text x="8" y="17" font-family="Arial" font-size="14" fill="#fff">${t}</text></svg>`)
  const [x, y, rw, rh] = c.rect
  const sc = tileW / s.w
  const box = Buffer.from(`<svg width="${tileW}" height="${tileH}"><rect x="${x * sc}" y="${y * sc}" width="${rw * sc}" height="${rh * sc}" fill="none" stroke="#ff3b3b" stroke-width="2"/></svg>`)
  const tiles: Buffer[] = [await sharp(s.buf).resize(tileW, tileH).composite([{ input: box, top: 0, left: 0 }, { input: label('original + seleção'), top: 0, left: 0 }]).png().toBuffer()]
  for (const engine of ENGINES) {
    const r = rows.find(r => r.caseId === c.id && r.engine === engine)
    const src = r?.resultBuf ?? Buffer.from(`<svg width="${tileW}" height="${tileH}"><rect width="${tileW}" height="${tileH}" fill="#222"/></svg>`)
    const t = r?.ok ? `${engine} · ${r.rejected ? 'REJEITADO' : 'ok'} · fora ${fmt(r.outOfMask, 4)} · ${((r.providerMs ?? 0) / 1000).toFixed(0)}s` : `${engine} · FALHOU`
    tiles.push(await sharp(src).resize(tileW, tileH).composite([{ input: label(t), top: 0, left: 0 }]).png().toBuffer())
  }
  await sharp({ create: { width: tileW * tiles.length + 8 * (tiles.length - 1), height: tileH, channels: 4, background: '#111' } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * (tileW + 8), top: 0 })))
    .jpeg({ quality: 88 }).toFile(path.join(OUT, `${c.id}-ab.jpg`))
}
console.log('composições salvas em', OUT)
