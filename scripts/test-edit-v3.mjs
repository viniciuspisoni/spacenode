// scripts/test-edit-v3.mjs
//
// Teste do Editar V3 (/api/edit-v3/google). SEGURO POR PADRÃO:
//   node scripts/test-edit-v3.mjs            → smoke sem custo (negativos + dry-run)
//   node scripts/test-edit-v3.mjs --cases    → dry-run dos 5 casos (custo ZERO)
//   node scripts/test-edit-v3.mjs --approve-paid-call
//                                            → GERAÇÃO PAGA dos 5 casos (gasta!)
//
// Pré-requisitos:
//   - Dev server rodando com EDIT_V3_ENABLED=1 (e EDIT_V3_CHARGE=0 p/ não debitar
//     nodes durante o teste): $env:EDIT_V3_ENABLED='1'; $env:EDIT_V3_CHARGE='0'; npm run dev
//   - EDIT_V3_TEST_USER=<uuid de um usuário real> (bypass de auth, só local).
//   - Para os casos pagos: scripts/edit-v3-cases.json preenchido (ver template
//     impresso se o arquivo não existir) com source_image_url + mask_url
//     hospedados no Storage do Supabase (passam o allowlist SSRF).
//
// O modo pago imprime o PRÉ-VOO DE 7 ITENS e exige a flag --approve-paid-call.

import { readFile, writeFile } from 'node:fs/promises'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const USER = process.env.EDIT_V3_TEST_USER || ''
const CASES_FILE = new URL('./edit-v3-cases.json', import.meta.url)

const argv = process.argv.slice(2)
const PAID = argv.includes('--approve-paid-call')
const CASES = PAID || argv.includes('--cases')

// 1x1 PNG transparente (data URL) — fonte sintética p/ dry-run sem rede.
const SYNTH_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function hdr() {
  const h = { 'Content-Type': 'application/json' }
  if (USER) h['x-edit-v3-test-user'] = USER
  return h
}

async function call(body) {
  const res = await fetch(`${BASE}/api/edit-v3/google`, { method: 'POST', headers: hdr(), body: JSON.stringify(body) })
  let json = null
  try { json = await res.json() } catch { /* */ }
  return { status: res.status, json }
}

function ok(label, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`)
  return cond
}

// ── Smoke sem custo ──────────────────────────────────────────────────────────
async function smoke() {
  console.log(`\n── SMOKE (sem custo) · ${BASE} ──`)
  if (!USER) console.log('⚠️  EDIT_V3_TEST_USER não setado — chamadas autenticadas darão 401.')

  const bad = await call({})
  ok('payload inválido → 400', bad.status === 400 || (!USER && bad.status === 401), `status=${bad.status}`)

  const badAction = await call({ action: 'nope', source_image_url: SYNTH_PNG })
  ok('ação inválida → 400', badAction.status === 400 || (!USER && badAction.status === 401), `status=${badAction.status}`)

  const noSource = await call({ action: 'remove' })
  ok('sem imagem → 400', noSource.status === 400 || (!USER && noSource.status === 401), `status=${noSource.status}`)

  if (USER) {
    const dry = await call({ action: 'swap_material', source_image_url: SYNTH_PNG, instruction: 'preview', dry_run: true, assume_mask: true, debug: true })
    ok('dry-run → 200 + nodes_cost', dry.status === 200 && typeof dry.json?.nodes_cost === 'number', `nodes=${dry.json?.nodes_cost} debug.model=${dry.json?.debug?.model}`)
    ok('dry-run não cobra', dry.json?.charge?.debited === false, JSON.stringify(dry.json?.charge))
  }
}

// ── Casos (dry-run sempre; geração só com --approve-paid-call) ───────────────
async function readCases() {
  try {
    const raw = await readFile(CASES_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    console.log(
      '\nℹ️  Crie scripts/edit-v3-cases.json com os 5 casos. Template:\n' +
      JSON.stringify(
        [
          { name: 'remover objeto', action: 'remove', instruction: 'remover este objeto', source_image_url: 'https://<supabase>/...source.jpg', mask_url: 'https://<supabase>/...mask.png' },
          { name: 'trocar parede', action: 'swap_material', instruction: 'parede em concreto aparente', source_image_url: '...', mask_url: '...', references: [{ kind: 'material', url: '...' }] },
          { name: 'trocar piso', action: 'swap_material', instruction: 'piso em porcelanato amadeirado', source_image_url: '...', mask_url: '...' },
          { name: 'inserir vegetação', action: 'insert_element', instruction: 'inserir um vaso com planta', source_image_url: '...', mask_url: '...' },
          { name: 'refinar área', action: 'refine_area', instruction: 'corrigir a textura', source_image_url: '...', mask_url: '...' },
        ],
        null,
        2,
      ),
    )
    return null
  }
}

function preflight(cases) {
  console.log('\n════════ PRÉ-VOO (7 itens) — CHAMADA PAGA ════════')
  console.log('1. Variáveis: EDIT_V3_ENABLED=1, GEMINI_API_KEY presente, EDIT_V3_TEST_USER=' + (USER ? 'set' : 'AUSENTE'))
  console.log('2. Permissões: usuário de teste real; EDIT_V3_CHARGE=0 recomendado (não debita).')
  console.log(`3. Comando: POST ${BASE}/api/edit-v3/google × ${cases.length} casos`)
  console.log('4. Custo estimado: ~US$0,067–0,101 por geração (Gemini Flash 1K/2K) → ~US$0,40 no total.')
  console.log('5. Imagens/máscaras: source_image_url + mask_url de cada caso (Storage do Supabase).')
  console.log('6. Modelo: gemini-3.1-flash-image (padrão) via API direta do Google.')
  console.log('7. Critérios: rejected=false, result_url presente, outOfMaskDelta baixo, mudança visível dentro da máscara.')
  console.log('═══════════════════════════════════════════════════\n')
}

async function runCases() {
  const cases = await readCases()
  if (!cases) return
  if (PAID) preflight(cases)

  for (const [i, c] of cases.entries()) {
    const refs = c.references ?? []
    if (!PAID) {
      const dry = await call({ action: c.action, source_image_url: c.source_image_url, instruction: c.instruction, references: refs, dry_run: true, assume_mask: true, debug: true })
      ok(`[${i + 1}] ${c.name} · dry-run`, dry.status === 200 && typeof dry.json?.nodes_cost === 'number', `nodes=${dry.json?.nodes_cost}`)
      continue
    }
    const t0 = Date.now()
    const r = await call({ action: c.action, source_image_url: c.source_image_url, mask_url: c.mask_url, instruction: c.instruction, references: refs, debug: true })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    const pass = r.status === 200 && r.json?.rejected === false && !!r.json?.result_url
    ok(`[${i + 1}] ${c.name} · PAGO`, pass, `status=${r.status} ${dt}s nodes=${r.json?.nodes_cost} drift=${r.json?.debug?.metrics?.outOfMaskDelta} in=${r.json?.debug?.metrics?.inMaskDelta} url=${r.json?.result_url ?? r.json?.error}`)
    if (r.json?.result_url) {
      await writeFile(new URL(`./_edit_v3_case${i + 1}.txt`, import.meta.url), r.json.result_url)
    }
  }
}

await smoke()
if (CASES) await runCases()
console.log('\nConcluído.')
