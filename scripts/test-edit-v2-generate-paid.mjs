#!/usr/bin/env node
// scripts/test-edit-v2-generate-paid.mjs
//
// TESTE PAGO CONTROLADO de GERAÇÃO via /api/edits/v2 (Fase 3) usando a MÁSCARA
// JÁ DETECTADA dos painéis (não re-detecta). EXATAMENTE 1 geração, sem loop,
// sem retry pago. Cobrança SIMULADA (a rota não debita Nodes). DRY-RUN por
// padrão; --approve-paid-call executa.
//
// swap_material sem referência → Gemini Flash via API direta (não Pro, não FAL,
// não Vertex), 2K (imagem 4,26 MP), recompose dentro da máscara + gates.

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const TEST_USER = '00000000-0000-4000-8000-0000000000ec'
const BASE_URL = process.env.EDIT_V2_TEST_BASE ?? 'http://localhost:3000'
const IMG = path.join(ROOT, '_batch_base.jpg')

// Máscara COMPLETA (gemini-box-sam2-complete) do teste de detecção aprovado
// 2026-06-12 — painéis da parede esquerda, interior sólido (holeRatio 0.000).
// Reusada como está — NÃO re-detectar (condição do dono).
const MASK_URL =
  process.env.DETECTED_MASK_URL ??
  'https://nucyyqmurhnakhldshwr.supabase.co/storage/v1/object/public/space-mestres/00000000-0000-4000-8000-0000000000ec/retocar/crop-mask/1781472910631-hlucw0.png'

const INSTRUCTION = 'trocar os painéis por madeira clara'

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
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA || !KEY) { console.error('✖ envs Supabase ausentes'); process.exit(1) }

async function run() {
  if (!existsSync(IMG)) { console.error('✖ _batch_base.jpg ausente'); process.exit(1) }
  console.log(`Máscara detectada (reuso): ${MASK_URL.slice(-40)}`)
  console.log(`Tipo: Trocar material · Instrução: "${INSTRUCTION}" · sem referência`)

  if (!APPROVED) {
    console.log('\nDRY-RUN: nenhuma chamada paga. Para executar:')
    console.log('  node scripts/test-edit-v2-generate-paid.mjs --approve-paid-call')
    return
  }

  const admin = createClient(SUPA, KEY)
  // re-hospeda a imagem (idempotente, grátis) para garantir a URL fonte
  const srcKey = `${TEST_USER}/retocar/source/detect-base.jpg`
  await admin.storage.from('space-mestres').upload(srcKey, readFileSync(IMG), { contentType: 'image/jpeg', upsert: true })
  const sourceUrl = admin.storage.from('space-mestres').getPublicUrl(srcKey).data.publicUrl

  console.log(`\nPOST ${BASE_URL}/api/edits/v2 (1 geração paga)`)
  const t0 = Date.now()
  const res = await fetch(`${BASE_URL}/api/edits/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-edit-v2-test-user': TEST_USER },
    body: JSON.stringify({
      source_image_url: sourceUrl,
      mask_url: MASK_URL,
      edit_intent: 'swap_material',
      instruction: INSTRUCTION,
      quality_mode: 'economic',
      preservation_mode: 'maximum',
      intensity_mode: 'standard',
      debug: true,
    }),
  })
  const ms = Date.now() - t0
  const json = await res.json().catch(() => null)
  console.log(`\nHTTP ${res.status} em ${ms}ms`)
  console.log(JSON.stringify(json, null, 2))

  if (res.ok && json?.result_url) {
    const out = path.join(ROOT, '_v2_generate_out.png')
    writeFileSync(out, Buffer.from(await (await fetch(json.result_url)).arrayBuffer()))
    console.log(`\nresultado salvo: ${out}`)
  }
}
run().catch(e => { console.error('✖', e?.message ?? e); process.exit(1) })
