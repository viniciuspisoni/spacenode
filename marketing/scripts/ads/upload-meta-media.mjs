import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const REPO = 'C:/Users/Pisoni/spacenode'
const env = Object.fromEntries(fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('env ausente')
const FFMPEG = 'C:/Users/Pisoni/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe'
const BUCKET = 'marketing-ads'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const slugs = ['2026-09-04-reel-drone-nada-sai-do-lugar-ad', '2026-09-04-reel-pisca-fachada-geminada-ad', '2026-09-04-reel-entre-duas-reunioes-ad', '2026-09-07-reel-plugin-render-real', '2026-09-07-reel-plugin-no-sketchup', '2026-09-05-reel-plugin-tres-cenas-um-clique']
// bucket
let r = await fetch(`${URL_}/storage/v1/bucket`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) })
console.log('bucket', r.status, (await r.text()).slice(0, 120))
const out = {}
for (const s of slugs) {
  const mp4 = path.join(REPO, 'marketing/output', s, `${s}.mp4`)
  const jpg = path.join(REPO, 'marketing/output', s, `${s}-capa.jpg`)
  if (!fs.existsSync(jpg)) execFileSync(FFMPEG, ['-y', '-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '2', jpg], { stdio: 'ignore' })
  const res = {}
  for (const [f, ct] of [[mp4, 'video/mp4'], [jpg, 'image/jpeg']]) {
    const name = path.basename(f)
    const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/2026-09/${name}`, { method: 'POST', headers: { ...H, 'Content-Type': ct, 'x-upsert': 'true' }, body: fs.readFileSync(f) })
    const t = await up.text()
    if (!up.ok) throw new Error(`${name}: ${up.status} ${t}`)
    res[ct === 'video/mp4' ? 'video_url' : 'image_url'] = `${URL_}/storage/v1/object/public/${BUCKET}/2026-09/${name}`
  }
  out[s] = res
  console.log('ok', s)
}
// conferir que a URL pública responde
for (const [s, v] of Object.entries(out)) { const h = await fetch(v.video_url, { method: 'HEAD' }); console.log(h.status, h.headers.get('content-type'), h.headers.get('content-length'), s) }
fs.writeFileSync(path.join(REPO, 'marketing/ads/setup-2026-09/meta-media-urls.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
