// Inventário + download do acervo de imagens da conta do dono (Supabase de PROD, via
// SUPABASE_SERVICE_ROLE_KEY do .env.local) para triagem de Reels. Saída em SPACENODE_ACERVO
// (default ../acervo, fora do repo): inventory/*.json, assets/, thumbs/, sheets/.
// Uso: node marketing/scripts/acervo/inventory.mjs            -> só inventário (JSON)
//      node marketing/scripts/acervo/inventory.mjs --download -> + download + thumbs + folhas
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const OUT = path.join(ROOT, 'inventory')
const ASSETS = path.join(ROOT, 'assets')
const THUMBS = path.join(ROOT, 'thumbs')
const SHEETS = path.join(ROOT, 'sheets')
for (const d of [OUT, ASSETS, THUMBS, SHEETS]) fs.mkdirSync(d, { recursive: true })

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const USER = '22b2f92f-5487-48a0-bb2c-6239bd749541'
const DOWNLOAD = process.argv.includes('--download')
import { FFMPEG, FFPROBE } from '../lib/tools.mjs'

async function all(table, select, filter) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999).order('created_at', { ascending: false })
    q = filter ? filter(q) : q.eq('user_id', USER)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const renders = await all('renders', 'id,created_at,status,ambient,style,lighting,engine,resolution,user_prompt,prompt,input_url,output_url,preview_url,source_tool,config_snapshot,upscale_meta,duration_ms,folder_id')
const spaces = await all('spaces', 'id,name,category,status,vista_mestre_url,source_render_id,vista_mestre_history,created_at,dna')
const spaceIds = spaces.map(s => s.id)
const vistas = await all('vistas', 'id,space_id,created_at,status,axis,axis_label,axis_value,image_url,source_sketch_url,source_image_url,identity_image_url,aspect_ratio,generated_width,generated_height,spaces_mode,preservation_level,user_instruction,prompt,is_favorited,is_in_pack,engine,model,provider,duration_ms,is_edited,edit_prompt,parent_vista_id', q => q.in('space_id', spaceIds))
const edits = await all('edits', 'id,created_at,source_image_url,result_image_url,mask_url,prompt,engine,source_type,source_id,mask_coverage,review_status')
const editsV3 = await all('edit_v3_jobs', 'id,created_at,action_type,status,source_image_url,mask_url,result_image_url,prompt,instruction,model,mask_coverage,preservation_mode')
const attempts = await all('image_edit_attempts', 'id,created_at,tool,prompt,source_image_id,result_image_id,status,edit_intent,provider,has_mask')
const blocos = await all('blocos3d_jobs', 'id,created_at,status,input_image_url,thumbnail_key,provider_model_urls,model_glb_key')
const finProjects = await all('finalize_projects', 'id,name,base_image_url,thumbnail_url,source_space_id,width,height,created_at')
const finExports = await all('finalize_exports', 'id,project_id,png_url,format,width,height,created_at')
const packs = await all('packs', 'id,space_id,narrative,vistas_ordered,client_name,description,pdf_url,created_at')
const folders = await all('render_folders', 'id,name,parent_id,created_at')

const spaceById = Object.fromEntries(spaces.map(s => [s.id, s]))
for (const v of vistas) { const s = spaceById[v.space_id]; v.space_name = s?.name; v.space_category = s?.category }
const folderById = Object.fromEntries(folders.map(f => [f.id, f.name]))
for (const r of renders) { r.folder_name = r.folder_id ? folderById[r.folder_id] : null; if (r.prompt) r.prompt = r.prompt.slice(0, 400) }

// ---- Lista plana de assets (uma entrada por URL única) ----
const assets = []
const seen = new Map()
function add(kind, role, url, meta) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) return
  if (seen.has(url)) { seen.get(url).refs.push({ kind, role, ...meta }); return }
  const a = { idx: assets.length, kind, role, url, refs: [{ kind, role, ...meta }] }
  seen.set(url, a); assets.push(a)
}
for (const r of renders) {
  if (r.status !== 'completed') continue
  const isVideo = r.ambient === 'video'
  const isUpscale = r.ambient === 'upscale'
  const kind = isVideo ? 'video' : isUpscale ? 'upscale' : 'render'
  const meta = { id: r.id, date: r.created_at.slice(0, 10), ambient: r.ambient, style: r.style, lighting: r.lighting, engine: r.engine, resolution: r.resolution, user_prompt: r.user_prompt, folder: r.folder_name }
  add(kind, isVideo ? 'video_out' : 'after', r.output_url, meta)
  add(kind, isVideo ? 'video_src' : 'before', r.input_url, meta)
}
for (const v of vistas) {
  if (v.status !== 'completed') continue
  const meta = { id: v.id, date: v.created_at.slice(0, 10), space: v.space_name, category: v.space_category, axis: v.axis, axis_label: v.axis_label, aspect: v.aspect_ratio, mode: v.spaces_mode, instruction: v.user_instruction, favorited: v.is_favorited, in_pack: v.is_in_pack }
  add('vista', 'after', v.image_url, meta)
  add('vista', 'before', v.source_sketch_url || v.source_image_url, meta)
}
for (const s of spaces) add('space', 'mestre', s.vista_mestre_url, { id: s.id, date: s.created_at.slice(0, 10), space: s.name, category: s.category, status: s.status })
for (const e of edits) { const m = { id: e.id, date: e.created_at.slice(0, 10), prompt: e.prompt, engine: e.engine }; add('edit', 'after', e.result_image_url, m); add('edit', 'before', e.source_image_url, m) }
for (const e of editsV3) { if (e.status !== 'completed') continue; const m = { id: e.id, date: e.created_at.slice(0, 10), action: e.action_type, instruction: e.instruction || e.prompt }; add('edit3', 'after', e.result_image_url, m); add('edit3', 'before', e.source_image_url, m) }
for (const b of blocos) add('bloco3d', 'before', b.input_image_url, { id: b.id, date: b.created_at.slice(0, 10), status: b.status })
for (const f of finProjects) { add('finalize', 'after', f.thumbnail_url, { id: f.id, name: f.name }); add('finalize', 'before', f.base_image_url, { id: f.id, name: f.name }) }
for (const f of finExports) add('finalize', 'export', f.png_url, { id: f.id })

fs.writeFileSync(path.join(OUT, 'renders.json'), JSON.stringify(renders, null, 1))
fs.writeFileSync(path.join(OUT, 'spaces.json'), JSON.stringify(spaces.map(s => ({ ...s, dna: s.dna ? '[dna]' : null })), null, 1))
fs.writeFileSync(path.join(OUT, 'vistas.json'), JSON.stringify(vistas, null, 1))
fs.writeFileSync(path.join(OUT, 'edits.json'), JSON.stringify(edits, null, 1))
fs.writeFileSync(path.join(OUT, 'edit_v3_jobs.json'), JSON.stringify(editsV3, null, 1))
fs.writeFileSync(path.join(OUT, 'image_edit_attempts.json'), JSON.stringify(attempts, null, 1))
fs.writeFileSync(path.join(OUT, 'blocos3d.json'), JSON.stringify(blocos, null, 1))
fs.writeFileSync(path.join(OUT, 'finalize.json'), JSON.stringify({ finProjects, finExports }, null, 1))
fs.writeFileSync(path.join(OUT, 'packs.json'), JSON.stringify(packs, null, 1))

const byKind = {}
for (const a of assets) byKind[`${a.kind}/${a.role}`] = (byKind[`${a.kind}/${a.role}`] || 0) + 1
console.log('rows:', { renders: renders.length, spaces: spaces.length, vistas: vistas.length, edits: edits.length, editsV3: editsV3.length, attempts: attempts.length, blocos: blocos.length, finProjects: finProjects.length, finExports: finExports.length, packs: packs.length })
console.log('unique assets:', assets.length, byKind)

if (!DOWNLOAD) { fs.writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify(assets, null, 1)); process.exit(0) }

// ---- Download ----
function extOf(url, ct) {
  const m = url.split('?')[0].match(/\.(jpe?g|png|webp|mp4|webm|mov)$/i)
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg')
  if (ct?.includes('png')) return 'png'; if (ct?.includes('webp')) return 'webp'; if (ct?.includes('mp4')) return 'mp4'
  return 'jpg'
}
let done = 0, failed = 0
async function dl(a) {
  const base = `${String(a.idx).padStart(4, '0')}-${a.kind}-${a.role}`
  const existing = fs.readdirSync(ASSETS).find(f => f.startsWith(base + '.'))
  if (existing) { a.file = path.join(ASSETS, existing); return }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(a.url, { signal: AbortSignal.timeout(120000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = extOf(a.url, res.headers.get('content-type'))
      a.file = path.join(ASSETS, `${base}.${ext}`)
      fs.writeFileSync(a.file, buf)
      return
    } catch (e) { a.error = String(e.message || e); if (attempt === 2) { failed++; console.log('FAIL', a.idx, a.url.slice(0, 80), a.error) } }
  }
}
const queue = [...assets]
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { await dl(queue.shift()); done++; if (done % 50 === 0) console.log('downloaded', done, '/', assets.length) } }))
console.log('download done:', done, 'failed:', failed)

// ---- Metadata + thumbs ----
for (const a of assets) {
  if (!a.file) continue
  const thumb = path.join(THUMBS, path.basename(a.file).replace(/\.[^.]+$/, '.jpg'))
  try {
    if (/\.(mp4|webm|mov)$/i.test(a.file)) {
      const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', a.file]).toString())
      const vs = probe.streams.find(s => s.codec_type === 'video')
      a.width = vs?.width; a.height = vs?.height; a.duration = Number(probe.format?.duration)
      if (!fs.existsSync(thumb)) execFileSync(FFMPEG, ['-v', 'quiet', '-y', '-ss', '1', '-i', a.file, '-frames:v', '1', '-vf', 'scale=640:-2', thumb])
    } else {
      const m = await sharp(a.file).metadata(); a.width = m.width; a.height = m.height
      if (!fs.existsSync(thumb)) await sharp(a.file).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumb)
    }
    a.thumb = thumb; a.bytes = fs.statSync(a.file).size
  } catch (e) { a.error = 'meta: ' + String(e.message || e) }
}
fs.writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify(assets, null, 1))

// ---- Contact sheets (20 por folha, 4x5) ----
const COLS = 4, ROWS = 5, TW = 360, TH = 300, PAD = 8
const groups = {}
for (const a of assets) if (a.thumb) (groups[a.kind] ||= []).push(a)
const sheetIndex = []
for (const [kind, list] of Object.entries(groups)) {
  for (let i = 0; i < list.length; i += COLS * ROWS) {
    const chunk = list.slice(i, i + COLS * ROWS)
    const comps = []
    for (let j = 0; j < chunk.length; j++) {
      const a = chunk[j]
      const x = (j % COLS) * (TW + PAD) + PAD, y = Math.floor(j / COLS) * (TH + PAD) + PAD
      const img = await sharp(a.thumb).resize(TW, TH - 28, { fit: 'contain', background: '#111' }).toBuffer()
      const label = `${a.idx} · ${a.role}${a.refs[0].date ? ' · ' + a.refs[0].date : ''}${a.width ? ` · ${a.width}×${a.height}` : ''}`
      const svg = Buffer.from(`<svg width="${TW}" height="28"><rect width="100%" height="100%" fill="#000"/><text x="6" y="19" font-family="Arial" font-size="15" fill="#fff">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`)
      comps.push({ input: img, left: x, top: y }, { input: svg, left: x, top: y + TH - 28 })
    }
    const n = Math.floor(i / (COLS * ROWS)) + 1
    const file = path.join(SHEETS, `${kind}-${String(n).padStart(2, '0')}.jpg`)
    await sharp({ create: { width: COLS * (TW + PAD) + PAD, height: ROWS * (TH + PAD) + PAD, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 85 }).toFile(file)
    sheetIndex.push({ file, kind, sheet: n, idx: chunk.map(a => a.idx) })
  }
}
fs.writeFileSync(path.join(OUT, 'sheets.json'), JSON.stringify(sheetIndex, null, 1))
console.log('sheets:', sheetIndex.length)
