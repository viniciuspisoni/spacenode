#!/usr/bin/env node
// scripts/test-edit-v2-route-paid.mjs
//
// TESTE PAGO CONTROLADO da rota /api/edits/v2 (Fase 2) — 1 chamada real ao
// provider através do pipeline completo: normalizador → router → provider →
// recompose → gates → upload → telemetria. Cobrança SIMULADA (nada debitado).
//
// Caso: fix_image (Corrigir imagem) sobre a mancha sintética validada no
// mini-batch — motor esperado: Vertex Imagen, 3 nodes (simulados),
// custo real ~US$0,02 (provider) + ~US$0,002 (normalizador + gate semântico).
//
// DRY-RUN por padrão: sem --approve-paid-call, faz o upload dos assets de
// teste (grátis), chama a rota com dry_run:true (zero custo) e imprime o
// roteamento. Com --approve-paid-call, faz a chamada REAL (1×, sem retry).
//
// Pré-requisito: dev server rodando em localhost:3000 com EDIT_V2_ENABLED=1.

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const TEST_USER = '00000000-0000-4000-8000-0000000000ed' // pasta de teste no bucket
const BASE_URL = process.env.EDIT_V2_TEST_BASE ?? 'http://localhost:3000'

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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SERVICE_KEY) {
  console.error('✖ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  process.exit(1)
}

const IMG = path.join(ROOT, '_batch_case2_input.jpg')
const MASK = path.join(ROOT, '_batch_case2_mask.png')

async function hostAsset(admin, file, contentType, kind) {
  const key = `${TEST_USER}/retocar/${kind}/${path.basename(file)}`
  const { error } = await admin.storage.from('space-mestres')
    .upload(key, readFileSync(file), { contentType, upsert: true })
  if (error) throw new Error(`upload ${kind}: ${error.message}`)
  return admin.storage.from('space-mestres').getPublicUrl(key).data.publicUrl
}

async function run() {
  if (!existsSync(IMG) || !existsSync(MASK)) {
    console.error('✖ Assets do mini-batch ausentes — rode antes: node scripts/smoke-vertex-batch.mjs (dry-run prepara).')
    process.exit(1)
  }
  const admin = createClient(SUPA_URL, SERVICE_KEY)
  console.log('Hospedando assets de teste no Storage (grátis)…')
  const [imgUrl, maskUrl] = await Promise.all([
    hostAsset(admin, IMG, 'image/jpeg', 'source'),
    hostAsset(admin, MASK, 'image/png', 'mask'),
  ])
  console.log('  imagem e máscara hospedadas ✔ (URLs do bucket do produto)')

  const payload = {
    source_image_url: imgUrl,
    mask_url: maskUrl,
    edit_intent: 'fix_image',
    instruction: 'remover a mancha escura do piso e reconstruir o porcelanato',
    quality_mode: 'economic',
    preservation_mode: 'maximum',
    intensity_mode: 'standard',
    debug: true,
    ...(APPROVED ? {} : { dry_run: true }),
  }

  console.log(`\nPOST ${BASE_URL}/api/edits/v2 ${APPROVED ? '(CHAMADA PAGA REAL — 1×, sem retry)' : '(dry_run — zero custo)'}`)
  const t0 = Date.now()
  const res = await fetch(`${BASE_URL}/api/edits/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-edit-v2-test-user': TEST_USER },
    body: JSON.stringify(payload),
  })
  const ms = Date.now() - t0
  const json = await res.json().catch(() => null)
  console.log(`HTTP ${res.status} em ${ms}ms`)
  console.log(JSON.stringify(json, null, 2))

  if (APPROVED && json?.result_url) {
    const out = path.join(ROOT, '_route_paid_out.png')
    const img = await fetch(json.result_url)
    writeFileSync(out, Buffer.from(await img.arrayBuffer()))
    console.log(`\nresultado baixado: ${out} — comparar com _batch_case2_input.jpg e _batch_base.jpg (gabarito)`)
  }
}

run().catch(err => { console.error('✖', err?.message ?? err); process.exit(1) })
