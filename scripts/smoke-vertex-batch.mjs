#!/usr/bin/env node
// scripts/smoke-vertex-batch.mjs
//
// MINI-BATCH PAGO do Vertex Imagen (3 casos limpos) — decide se o
// imagen-3.0-capability-001 é sacramentado como motor econômico padrão de
// edição com máscara do Editar v2 (autorizado pelo fundador em 2026-06-12).
//
// Casos (sobre o render original limpo _batch_base.jpg, 3328×1280):
//   1. REMOÇÃO de objeto inteiro — os dois abajures do criado-mudo esquerdo
//      (máscara cobre o objeto completo + margem; EDIT_MODE_INPAINT_REMOVAL).
//   2. CORREÇÃO de artefato localizado — mancha sintética composta sobre o
//      piso à direita (gabarito = pixels originais conhecidos; INSERTION).
//   3. MATERIAL simples sem referência — faixa de piso à esquerda vira madeira
//      carvalho claro (INSERTION).
//
// SEGURANÇA: dry-run por padrão (prepara assets e imprime o pré-voo, zero
// custo). Execução real só com --approve-paid-call. EXATAMENTE 1 chamada por
// caso, SEM retry, SEM loop; falha em um caso NÃO dispara outro modelo — loga
// e segue ao próximo caso. Total: 3 chamadas, ~US$0,06.
//
// Métrica objetiva por caso (mesma régua do pipeline, 832px, threshold 12):
// drift FORA da máscara vs input do caso · mudança DENTRO · e no caso 2 também
// a fidelidade de reconstrução DENTRO vs o original limpo (gabarito).

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const MODEL = 'imagen-3.0-capability-001'
const COST_PER_CALL = 0.02

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}
loadEnvLocal()

const PROJECT = process.env.GOOGLE_VERTEX_PROJECT?.trim()
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
const CREDS = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
const ADC_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
const HAS_CRED = Boolean(CREDS) || Boolean(ADC_PATH && existsSync(ADC_PATH))

const BASE = path.join(ROOT, '_batch_base.jpg')
const f = name => path.join(ROOT, name)

// ---------------------------------------------------------------------------
// Definição dos 3 casos (coordenadas full-res 3328×1280, conferidas em zooms)
// ---------------------------------------------------------------------------
const CASES = [
  {
    id: 1,
    name: 'Remover objeto inteiro (abajures do criado-mudo)',
    editMode: 'EDIT_MODE_INPAINT_REMOVAL',
    input: BASE,
    mask: f('_batch_case1_mask.png'),
    out: f('_batch_case1_out.png'),
    // retângulo cobrindo os DOIS abajures completos + halo, terminando no tampo
    rect: { x: 1150, y: 605, w: 230, h: 175 },
    prompt:
      'Remove the two table lamps on the floating nightstand completely. ' +
      'Reconstruct the dark wood-paneled wall and the empty nightstand top surface ' +
      'behind them, continuing the existing panel lines, materials and soft lighting ' +
      'exactly as they would appear. Leave no trace, glow or shadow of the lamps.',
  },
  {
    id: 2,
    name: 'Corrigir artefato localizado (mancha sintética no piso)',
    editMode: 'EDIT_MODE_INPAINT_INSERTION',
    input: f('_batch_case2_input.jpg'), // base + mancha composta
    mask: f('_batch_case2_mask.png'),
    out: f('_batch_case2_out.png'),
    ellipse: { cx: 2480, cy: 1160, rx: 160, ry: 110 },
    prompt:
      'Repair the visual defect inside the selection. Reconstruct the clean large-format ' +
      'porcelain floor tiles exactly as they should appear, continuing the tile pattern, ' +
      'subtle stone veins, grout lines and the soft light bands cast by the window blinds. ' +
      'This is a repair, not a redesign.',
  },
  {
    id: 3,
    name: 'Trocar material simples (faixa de piso → carvalho claro)',
    editMode: 'EDIT_MODE_INPAINT_INSERTION',
    input: BASE,
    mask: f('_batch_case3_mask.png'),
    out: f('_batch_case3_out.png'),
    rect: { x: 40, y: 960, w: 560, h: 310 },
    prompt:
      'Replace the floor surface inside the selection with warm light oak wood planks. ' +
      'Follow the real floor perspective and plank direction toward the vanishing point, ' +
      'keep realistic plank scale, and inherit the existing scene lighting including the ' +
      'soft light bands from the window blinds. Do not change anything outside the selection.',
  },
]

// ---------------------------------------------------------------------------
// Preparação determinística dos assets (grátis, local)
// ---------------------------------------------------------------------------
async function prepareAssets() {
  const { default: sharp } = await import('sharp')
  const meta = await sharp(BASE).metadata()
  const W = meta.width, H = meta.height

  const maskSvg = inner =>
    Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>${inner}</svg>`)

  // Caso 1: máscara retangular dos abajures
  const r1 = CASES[0].rect
  await sharp(maskSvg(`<rect x="${r1.x}" y="${r1.y}" width="${r1.w}" height="${r1.h}" rx="18" fill="white"/>`))
    .png().toFile(CASES[0].mask)

  // Caso 2: mancha sintética (blob irregular escuro semi-opaco) + máscara elíptica
  const e = CASES[1].ellipse
  const smudge = Buffer.from(
    `<svg width="${W}" height="${H}">
       <g opacity="0.85">
         <ellipse cx="${e.cx}" cy="${e.cy}" rx="95" ry="55" fill="#4a3f33"/>
         <ellipse cx="${e.cx - 55}" cy="${e.cy + 18}" rx="55" ry="30" fill="#3c342b" opacity="0.9"/>
         <ellipse cx="${e.cx + 60}" cy="${e.cy - 22}" rx="48" ry="26" fill="#57493a" opacity="0.8"/>
         <ellipse cx="${e.cx + 18}" cy="${e.cy + 36}" rx="30" ry="14" fill="#2e2822" opacity="0.85"/>
       </g>
     </svg>`,
  )
  await sharp(BASE).composite([{ input: smudge }]).jpeg({ quality: 95 }).toFile(CASES[1].input)
  await sharp(maskSvg(`<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="white"/>`))
    .png().toFile(CASES[1].mask)

  // Caso 3: máscara retangular da faixa de piso
  const r3 = CASES[2].rect
  await sharp(maskSvg(`<rect x="${r3.x}" y="${r3.y}" width="${r3.w}" height="${r3.h}" fill="white"/>`))
    .png().toFile(CASES[2].mask)

  return { W, H }
}

// Métrica objetiva (mesma régua do pipeline: 832px, threshold 12/255 por canal)
async function measure(inputPath, outPath, maskPath, truthPath = null) {
  const { default: sharp } = await import('sharp')
  const W = 832, H = 320
  const opts = { fit: 'fill' }
  const [a, b, m, t] = await Promise.all([
    sharp(inputPath).resize(W, H, opts).removeAlpha().raw().toBuffer(),
    sharp(outPath).resize(W, H, opts).removeAlpha().raw().toBuffer(),
    sharp(maskPath).resize(W, H, opts).removeAlpha().raw().toBuffer(),
    truthPath ? sharp(truthPath).resize(W, H, opts).removeAlpha().raw().toBuffer() : null,
  ])
  const TH = 12
  let outTot = 0, outDiff = 0, inTot = 0, inDiff = 0, truthDiff = 0
  for (let i = 0; i < W * H; i++) {
    const mi = m[i * 3]
    const d = Math.max(
      Math.abs(a[i * 3] - b[i * 3]),
      Math.abs(a[i * 3 + 1] - b[i * 3 + 1]),
      Math.abs(a[i * 3 + 2] - b[i * 3 + 2]),
    )
    if (mi <= 32) { outTot++; if (d > TH) outDiff++ }
    else if (mi >= 127) {
      inTot++; if (d > TH) inDiff++
      if (t) {
        const dt = Math.max(
          Math.abs(t[i * 3] - b[i * 3]),
          Math.abs(t[i * 3 + 1] - b[i * 3 + 1]),
          Math.abs(t[i * 3 + 2] - b[i * 3 + 2]),
        )
        if (dt > TH) truthDiff++
      }
    }
  }
  return {
    outOfMaskPct: +(100 * outDiff / outTot).toFixed(2),
    inMaskPct: +(100 * inDiff / inTot).toFixed(2),
    vsTruthPct: t ? +(100 * truthDiff / inTot).toFixed(2) : null,
  }
}

function preflight() {
  const ok = v => (v ? '✔' : '✖ AUSENTE')
  console.log(`
================ PRÉ-VOO — MINI-BATCH VERTEX IMAGEN (3 CASOS) ================
VARIÁVEIS: GOOGLE_VERTEX_PROJECT ${ok(PROJECT)} · LOCATION ${LOCATION} · credencial ${HAS_CRED ? '✔' : '✖'}
PROVIDER/MODELO: Vertex AI · ${MODEL} (máscara real em pixels)
CHAMADAS: exatamente 3 (1 por caso), SEM retry, SEM loop, SEM outros modelos
CUSTO TOTAL ESTIMADO: ~US$${(3 * COST_PER_CALL).toFixed(2)}
BASE: ${path.basename(BASE)} (render original limpo 3328×1280, baixado do histórico)

CASO 1 — ${CASES[0].name}
  máscara: retângulo ${JSON.stringify(CASES[0].rect)} (objeto COMPLETO + margem)
  modo: INPAINT_REMOVAL · saída: ${path.basename(CASES[0].out)}
CASO 2 — ${CASES[1].name}
  defeito sintético composto em ${path.basename(CASES[1].input)} (gabarito = original)
  máscara: elipse ${JSON.stringify(CASES[1].ellipse)} · modo: INSERTION · saída: ${path.basename(CASES[1].out)}
CASO 3 — ${CASES[2].name}
  máscara: retângulo ${JSON.stringify(CASES[2].rect)} (piso à esquerda, sem tapete)
  modo: INSERTION · saída: ${path.basename(CASES[2].out)}

SUCESSO por caso: imagem válida em resolução cheia; drift fora da máscara < 2%;
  objeto removido/defeito corrigido/material aplicado de forma coerente;
  geometria/câmera/iluminação preservadas. FALHA: o oposto, erro de API, timeout.
===============================================================================
`)
}

async function run() {
  if (!existsSync(BASE)) {
    console.error('✖ _batch_base.jpg não encontrado — baixe o render base antes.')
    process.exit(1)
  }
  await prepareAssets()
  preflight()
  if (!APPROVED) {
    console.log('DRY-RUN: assets preparados; nenhuma chamada paga foi feita. Para executar:')
    console.log('  node scripts/smoke-vertex-batch.mjs --approve-paid-call')
    process.exit(0)
  }
  if (!PROJECT || !HAS_CRED) {
    console.error('✖ Credenciais Vertex ausentes.')
    process.exit(1)
  }

  const { GoogleGenAI, RawReferenceImage, MaskReferenceImage, MaskReferenceMode, EditMode } =
    await import('@google/genai')
  const client = new GoogleGenAI({
    vertexai: true,
    project: PROJECT,
    location: LOCATION,
    ...(CREDS ? { googleAuthOptions: { credentials: JSON.parse(CREDS) } } : {}),
  })
  const { default: sharp } = await import('sharp')

  const results = []
  for (const c of CASES) {
    console.log(`\n— CASO ${c.id}: ${c.name}`)
    const raw = new RawReferenceImage()
    raw.referenceId = 1
    raw.referenceImage = { imageBytes: readFileSync(c.input).toString('base64'), mimeType: 'image/jpeg' }
    const mask = new MaskReferenceImage()
    mask.referenceId = 2
    mask.referenceImage = { imageBytes: readFileSync(c.mask).toString('base64'), mimeType: 'image/png' }
    mask.config = { maskMode: MaskReferenceMode.MASK_MODE_USER_PROVIDED, maskDilation: 0.01 }

    const t0 = Date.now()
    try {
      const res = await client.models.editImage({
        model: MODEL,
        prompt: c.prompt,
        referenceImages: [raw, mask],
        config: { editMode: EditMode[c.editMode], numberOfImages: 1, includeRaiReason: true },
      })
      const ms = Date.now() - t0
      const img = res.generatedImages?.[0]?.image
      if (!img?.imageBytes) {
        console.log(`  ✖ FALHA (${ms}ms): resposta sem imagem (RAI?). Seguindo ao próximo caso.`)
        results.push({ id: c.id, ok: false, ms, error: 'sem imagem' })
        continue
      }
      writeFileSync(c.out, Buffer.from(img.imageBytes, 'base64'))
      const dims = await sharp(c.out).metadata()
      const metrics = await measure(c.input, c.out, c.mask, c.id === 2 ? BASE : null)
      console.log(`  ✔ ok em ${ms}ms · saída ${dims.width}x${dims.height}`)
      console.log(`    drift FORA da máscara: ${metrics.outOfMaskPct}% · DENTRO: ${metrics.inMaskPct}%` +
        (metrics.vsTruthPct !== null ? ` · vs gabarito original: ${metrics.vsTruthPct}%` : ''))
      results.push({ id: c.id, ok: true, ms, dims: `${dims.width}x${dims.height}`, ...metrics })
    } catch (err) {
      const ms = Date.now() - t0
      console.log(`  ✖ FALHA (${ms}ms): ${String(err?.message ?? err).slice(0, 200)}. Seguindo ao próximo caso.`)
      results.push({ id: c.id, ok: false, ms, error: String(err?.message ?? err).slice(0, 200) })
    }
  }

  console.log('\n================ RESUMO ================')
  for (const r of results) {
    console.log(r.ok
      ? `CASO ${r.id}: ✔ ${r.ms}ms · ${r.dims} · fora ${r.outOfMaskPct}% · dentro ${r.inMaskPct}%` +
        (r.vsTruthPct !== null && r.vsTruthPct !== undefined ? ` · vs gabarito ${r.vsTruthPct}%` : '')
      : `CASO ${r.id}: ✖ ${r.error}`)
  }
  console.log(`Custo estimado total: ~US$${(results.filter(r => r.ok).length * COST_PER_CALL).toFixed(2)} (chamadas com falha de API não são cobradas)`)
}

run()
