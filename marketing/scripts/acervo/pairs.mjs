// Folhas de pares antes→depois (10 pares por folha) a partir de $ACERVO/inventory/assets.json.
// Uso: node marketing/scripts/acervo/pairs.mjs (depois do inventory.mjs --download)
// Cada par: [antes | depois] lado a lado + rótulo com idx dos dois assets, data, ambiente/space.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.env.SPACENODE_ACERVO || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../../../acervo')
const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory/assets.json'), 'utf8'))
const OUT = path.join(ROOT, 'pairsheets'); fs.mkdirSync(OUT, { recursive: true })
const byUrl = new Map(assets.map(a => [a.url, a]))
const byIdx = new Map(assets.map(a => [a.idx, a]))

// Reconstrói os pares a partir dos JSONs de origem
const renders = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory/renders.json'), 'utf8'))
const vistas = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory/vistas.json'), 'utf8'))
const edits = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory/edits.json'), 'utf8'))
const edits3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'inventory/edit_v3_jobs.json'), 'utf8'))

const pairs = []
const push = (group, before, after, label, meta) => {
  const a = byUrl.get(after), b = byUrl.get(before)
  if (!a?.thumb) return
  pairs.push({ group, before: b?.thumb ? b : null, after: a, label, meta })
}
for (const r of renders) {
  if (r.status !== 'completed') continue
  const g = r.ambient === 'video' ? 'video' : r.ambient === 'upscale' ? 'upscale' : /Fachada|Externo|Casa|Edifício|Galeria|Complexo|Hotel|Piscina|Térrea|Loja|Diurno|Noturno|Nublado|Chuva|Blue|Entardecer|Anchor|angulo|detalhe|iluminacao/.test(r.ambient || '') && r.style !== 'interior' ? 'render-ext' : 'render-int'
  push(g, r.input_url, r.output_url, `${r.created_at.slice(0, 10)} · ${r.ambient} · ${r.style || ''} · ${r.engine || ''}${r.resolution ? '/' + r.resolution : ''}${r.folder_name ? ' · ' + r.folder_name : ''}`, { id: r.id, prompt: r.user_prompt })
}
for (const v of vistas) {
  if (v.status !== 'completed') continue
  push('vista', v.source_sketch_url || v.source_image_url, v.image_url, `${v.created_at.slice(0, 10)} · ${v.space_name} (${v.space_category}) · ${v.axis || ''}${v.axis_label ? ':' + v.axis_label : ''}${v.is_favorited ? ' ★' : ''}`, { id: v.id })
}
for (const e of edits) push('edit', e.source_image_url, e.result_image_url, `${e.created_at.slice(0, 10)} · edit · ${(e.prompt || '').slice(0, 50)}`, { id: e.id })
for (const e of edits3) if (e.status === 'completed') push('edit', e.source_image_url, e.result_image_url, `${e.created_at.slice(0, 10)} · ${e.action_type} · ${(e.instruction || e.prompt || '').slice(0, 50)}`, { id: e.id })

const COLS = 2, ROWS = 5, W = 300, H = 210, LBL = 24, PAD = 8
const PW = 2 * W + 4, PH = H + LBL
const groups = {}
for (const p of pairs) (groups[p.group] ||= []).push(p)
const index = []
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
for (const [group, list] of Object.entries(groups)) {
  for (let i = 0; i < list.length; i += COLS * ROWS) {
    const chunk = list.slice(i, i + COLS * ROWS)
    const comps = []
    for (let j = 0; j < chunk.length; j++) {
      const p = chunk[j]
      const x = (j % COLS) * (PW + PAD) + PAD, y = Math.floor(j / COLS) * (PH + PAD) + PAD
      const bimg = p.before ? await sharp(p.before.thumb).resize(W, H, { fit: 'contain', background: '#111' }).toBuffer()
        : await sharp({ create: { width: W, height: H, channels: 3, background: '#222' } }).jpeg().toBuffer()
      const aimg = await sharp(p.after.thumb).resize(W, H, { fit: 'contain', background: '#111' }).toBuffer()
      const label = `#${p.after.idx}${p.before ? ' ← #' + p.before.idx : ' (sem antes)'} · ${p.label}`.slice(0, 95)
      const svg = Buffer.from(`<svg width="${PW}" height="${LBL}"><rect width="100%" height="100%" fill="#000"/><text x="4" y="17" font-family="Arial" font-size="13" fill="#fff">${esc(label)}</text></svg>`)
      comps.push({ input: bimg, left: x, top: y }, { input: aimg, left: x + W + 4, top: y }, { input: svg, left: x, top: y + H })
    }
    const n = Math.floor(i / (COLS * ROWS)) + 1
    const file = path.join(OUT, `${group}-${String(n).padStart(2, '0')}.jpg`)
    await sharp({ create: { width: COLS * (PW + PAD) + PAD, height: ROWS * (PH + PAD) + PAD, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 86 }).toFile(file)
    index.push({ file, group, sheet: n, pairs: chunk.map(p => ({ after: p.after.idx, before: p.before?.idx ?? null, label: p.label, id: p.meta.id, prompt: p.meta.prompt || null })) })
  }
}
fs.writeFileSync(path.join(ROOT, 'inventory/pairsheets.json'), JSON.stringify(index, null, 1))
console.log('pairs:', pairs.length, 'sheets:', index.length, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])))
