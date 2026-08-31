#!/usr/bin/env node
// scripts/smoke-spaces-detalhe.mjs
//
// SMOKE CONTROLADO do eixo Detalhe (recorte aproximado). Reproduz FIELMENTE o
// prompt de buildSpacesPreservePrompt (mode='detalhe', level=STRICT_SOURCE_LOCK)
// sobre a Vista Mestre de um Space TRAVADO real e chama a FAL DIRETO. NÃO debita
// nodes, NÃO escreve em `vistas` — só lê o Space e gera 1 imagem local pra
// validação visual. Custa créditos FAL (~centavos), não o saldo do app.
//
// Uso:
//   node scripts/smoke-spaces-detalhe.mjs --list
//   node scripts/smoke-spaces-detalhe.mjs --approve-paid-call <SPACE_ID> [detail_slug]
//
// Sem --approve-paid-call: DRY-RUN (mostra Space + prompt, não chama FAL).

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = process.env.SMOKE_OUT_DIR ?? ROOT
const FOUNDER_EMAIL = process.env.SMOKE_EMAIL ?? 'viniciuspisonivargas@gmail.com'

function loadEnv() {
  const p = path.join(ROOT, '.env.local')
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
loadEnv()

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const FAL_KEY = process.env.FAL_KEY
if (!SUPA || !KEY) { console.error('✖ envs Supabase ausentes'); process.exit(1) }
fal.config({ credentials: FAL_KEY })

const ENGINES = {
  vega:   { falEndpoint: 'fal-ai/nano-banana-pro/edit', res: '2K' },
  pulsar: { falEndpoint: 'fal-ai/nano-banana-2/edit',   res: '2K' },
  quasar: { falEndpoint: 'openai/gpt-image-2/edit',     res: '2K' },
}

// promptModifier dos cards Detalhe (copiado de lib/spaces/axes.ts).
const DETAIL_MODIFIER = {
  materialidade:        'a tight crop of the material meeting points, textures and finishes of the project',
  iluminacao_detalhe:   'a closer crop of the lighting fixtures, indirect light and highlight points already present in the scene',
  mobiliario:           'a closer crop of the main furniture and the composition of the room',
  parede_destaque:      'a closer crop of the feature wall: panels, art, texture or focal element',
  area_principal:       'a closer crop of the most important focal area of the scene',
  encontro_materiais:   'a tight crop of the transitions between materials such as wood, stone, glass, metal and fabric',
}

// ── Prompt builder: cópia FIEL de lib/spaces/preserve-prompt.ts p/ detalhe ────

const ROLE_BLOCK =
  'ROLE: You are an architectural visualization specialist. Your job is to ' +
  'preserve real architectural projects, never to reinvent them. The image ' +
  'provided by the user is the PRIMARY ARCHITECTURAL SOURCE and the single ' +
  'authority for this project — it is a real photograph or render of a real ' +
  'design, not a draft to be redesigned. The result must be a CONTROLLED ' +
  'VARIATION of the exact same project shown in that image. '

function sourceLockBlockDetalhe() {
  const items = [
    'geometry', 'volumetry', 'proportions', 'scale', 'wall positions',
    'ceilings and ceiling design (forros): height, plane, coffers and detailing',
    'openings (windows and doors): their count, size, shape, position and rhythm',
    'window and door frames (esquadrias)',
    'facade rhythm and composition',
    'roof profile, roof slope, eaves and overhangs',
    'columns, slabs, brises/sunscreens, railings/guardrails',
    'boundary walls, terrain and site implantation (implantação)',
    'overall composition and immediate context (neighbours, adjacent buildings)',
    'main existing vegetation',
    'all existing materials, finishes and colors',
  ]
  const head =
    'SOURCE LOCK: The user-provided image is the authority of the project. ' +
    'Preserve the following rigorously, pixel-faithful to the reference:\n- ' +
    items.join(';\n- ') + '.\n'
  const crop =
    'CLOSER CROP: The framing may move CLOSER to crop/zoom into a specific ' +
    'region of THIS SAME view — keeping the same perspective, the same lens ' +
    'character, the same architecture and the same materials. This is a tighter ' +
    'crop of the existing scene: never a new camera angle, never a new viewpoint, ' +
    'never a relayout. Everything that remains in frame must match the reference ' +
    'exactly. '
  return head + crop
}

function factsBlock(briefing) {
  if (!briefing) return ''
  const locked = (briefing.elementos_preservar?.length ?? 0) > 0
    ? `\n- Locked elements: ${briefing.elementos_preservar.join('; ')}`
    : ''
  return (
    'PROJECT FACTS (describe the real project in the reference — must remain identical):\n' +
    `- Type: ${briefing.tipo_projeto}\n` +
    `- Geometry: ${briefing.geometria_principal} | ${briefing.volumes} | ${briefing.pavimentos} stories\n` +
    `- Openings: ${briefing.aberturas}\n` +
    `- Visible materials: ${briefing.materiais_aparentes}\n` +
    `- Surroundings: ${briefing.entorno}` + locked + '\n'
  )
}

function dnaReferenceBlock(dna) {
  if (!dna || (dna.materiais?.length ?? 0) === 0) return ''
  const mats = dna.materiais.map(m => m.nome).join(', ')
  return (
    'PROJECT MATERIAL REFERENCE (already present in the image — keep them as they ' +
    `are, do not repaint or restyle): ${mats}. `
  )
}

const MODE_INTENT_DETALHE =
  'Create a closer architectural crop focused on the specified region, derived from the master image. ' +
  'Keep the exact same design language, materials, color palette, lighting logic, architectural style and proportions. ' +
  'Do not redesign, do not relayout, do not change any architecture — the result must look like another image from the SAME project presentation, not a different project.'

function userIntentBlock(userIntent) {
  const intent = (userIntent ?? '').trim()
  return (
    'USER INTENT: Apply ONLY the change the user selected. ' + MODE_INTENT_DETALHE +
    (intent ? ` Requested change: ${intent}. ` : ' ') +
    'Do not apply any change that was not explicitly requested. '
  )
}

function negativeBlockDetalhe() {
  const base = [
    'do not redesign the architecture',
    'do not create a new facade',
    'do not change volumetry',
    'do not change proportions',
    'do not change the position, count or shape of any opening',
    'do not change window/door frames (esquadrias)',
    'do not change the roof profile or roof slope',
    'do not change the architectural style',
    'do not distort or warp the perspective',
    'do not turn the image into concept art',
    'do not add decorative elements that were not requested',
    'do not create surreal, neon, fantasy or generic-AI atmosphere',
    'do not remove structural elements',
    'do not change neighbours, boundary walls, terrain or site implantation unless explicitly requested',
    'do not invent dominant new landscaping',
    'do not turn a residential project into a commercial one, or vice-versa',
    'do not add people, cars, furniture or objects that were not requested',
    'do not invent a new camera angle, a new perspective or a new viewpoint — only crop closer into the existing view',
    'do not relayout, rearrange or redesign the scene',
    'do not recolor, repaint, restain or replace any existing finish or material',
  ]
  return 'STRICTLY AVOID: ' + base.join(', ') + '. '
}

const OUTPUT_BLOCK =
  'OUTPUT: photorealistic image; plausible architecture; clean composition; ' +
  'legible materiality; natural light or the requested atmosphere; rigorous ' +
  'preservation of the original project; result suitable for a professional ' +
  'architecture presentation. No "redesign", no "creative reinterpretation", ' +
  'no "new concept", no "futuristic", no "fantasy", no "dramatic transformation".'

function buildDetalhePrompt({ userIntent, briefing, dna }) {
  return [
    ROLE_BLOCK,
    sourceLockBlockDetalhe(),
    factsBlock(briefing),
    dnaReferenceBlock(dna),
    userIntentBlock(userIntent),
    negativeBlockDetalhe(),
    OUTPUT_BLOCK,
  ].join('')
}

// ── DNA readers (cópia de lib/spaces/dna.ts) ──────────────────────────────────
function getVisualDna(dna) {
  if (!dna || typeof dna !== 'object') return null
  if ('visual' in dna && dna.visual) return dna.visual
  if ('estilo' in dna && 'paleta' in dna) return dna
  return null
}
function getBriefingFromDna(dna) {
  if (!dna || typeof dna !== 'object') return null
  if ('briefing' in dna && dna.briefing) return dna.briefing
  return null
}

async function resolveUserId(admin) {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('listUsers: ' + error.message)
    const u = data.users.find(x => (x.email ?? '').toLowerCase() === FOUNDER_EMAIL.toLowerCase())
    if (u) return u.id
    if (data.users.length < 200) return null
    page++
    if (page > 20) return null
  }
}

async function main() {
  const admin = createClient(SUPA, KEY)
  const args = process.argv.slice(2)
  const doList = args.includes('--list')
  const approveIdx = args.indexOf('--approve-paid-call')
  const approved = approveIdx !== -1
  const spaceId = approved ? args[approveIdx + 1] : null
  const detailSlug = (approved ? args[approveIdx + 2] : null) ?? 'materialidade'

  const userId = await resolveUserId(admin)
  if (!userId) { console.error(`✖ usuário ${FOUNDER_EMAIL} não encontrado`); process.exit(1) }

  if (doList || !approved) {
    const { data: spaces, error } = await admin
      .from('spaces')
      .select('id, name, category, engine, status, vista_mestre_url, dna, updated_at')
      .eq('user_id', userId)
      .eq('status', 'locked')
      .order('updated_at', { ascending: false })
      .limit(15)
    if (error) throw new Error('spaces: ' + error.message)
    const usable = (spaces ?? []).filter(s => s.vista_mestre_url && getVisualDna(s.dna))
    console.log(`\nSpaces TRAVADOS de ${FOUNDER_EMAIL} (com Vista Mestre + DNA): ${usable.length}\n`)
    for (const s of usable) {
      console.log(`  ${s.id}  [${s.engine}/${s.category}]  "${s.name}"`)
    }
    if (!approved) {
      console.log('\nDRY-RUN. Pra gerar 1 recorte pago:')
      console.log(`  node scripts/smoke-spaces-detalhe.mjs --approve-paid-call <SPACE_ID> [${Object.keys(DETAIL_MODIFIER).join('|')}]`)
    }
    if (!approved) return
  }

  if (!spaceId) { console.error('✖ SPACE_ID ausente'); process.exit(1) }
  if (!DETAIL_MODIFIER[detailSlug]) { console.error(`✖ detail_slug inválido: ${detailSlug}`); process.exit(1) }
  if (!FAL_KEY) { console.error('✖ FAL_KEY ausente'); process.exit(1) }

  const { data: space, error: sErr } = await admin
    .from('spaces').select('*').eq('id', spaceId).eq('user_id', userId).single()
  if (sErr || !space) { console.error('✖ Space não encontrado p/ este usuário'); process.exit(1) }
  if (space.status !== 'locked' || !space.vista_mestre_url) { console.error('✖ Space não travado / sem Vista Mestre'); process.exit(1) }

  const dna = getVisualDna(space.dna)
  const briefing = getBriefingFromDna(space.dna)
  const eng = ENGINES[space.engine] ?? ENGINES.vega
  const prompt = buildDetalhePrompt({ userIntent: DETAIL_MODIFIER[detailSlug], briefing, dna })

  console.log(`\nSpace: "${space.name}"  engine=${space.engine} (${eng.falEndpoint})`)
  console.log(`Recorte: ${detailSlug} → "${DETAIL_MODIFIER[detailSlug]}"`)
  console.log(`\n── PROMPT (${prompt.length} chars) ──\n${prompt}\n`)

  const input = space.engine === 'quasar'
    ? { prompt, image_urls: [space.vista_mestre_url], quality: 'medium', image_size: 'auto', num_images: 1, output_format: 'jpeg' }
    : { prompt, image_urls: [space.vista_mestre_url], resolution: eng.res, num_images: 1, output_format: 'jpeg' }

  console.log(`POST FAL ${eng.falEndpoint} …`)
  const t0 = Date.now()
  const result = await fal.subscribe(eng.falEndpoint, { input })
  const ms = Date.now() - t0
  const img = result?.data?.images?.[0]
  const outUrl = img?.url
  console.log(`\n✓ FAL ok em ${ms}ms · requestId=${result?.requestId ?? '?'} · ${img?.width}×${img?.height}`)
  if (!outUrl) { console.error('✖ sem output'); process.exit(1) }

  const beforePath = path.join(OUT_DIR, 'detalhe_before.jpg')
  const afterPath  = path.join(OUT_DIR, 'detalhe_after.jpg')
  writeFileSync(beforePath, Buffer.from(await (await fetch(space.vista_mestre_url)).arrayBuffer()))
  writeFileSync(afterPath,  Buffer.from(await (await fetch(outUrl)).arrayBuffer()))
  console.log(`\nantes:  ${beforePath}`)
  console.log(`depois: ${afterPath}`)
  console.log(`url:    ${outUrl}`)
}

main().catch(e => { console.error('✖', e?.stack ?? e?.message ?? e); process.exit(1) })
