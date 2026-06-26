#!/usr/bin/env node
// scripts/test-edit-v2-detect-surface.mjs
//
// TESTE PAGO CONTROLADO da seleção por intenção (/api/edits/v2/detect-surface).
// EXATAMENTE 1 detecção, sem loop, sem retry, SEM gerar edição. Cobrança
// simulada (a rota não debita Nodes). DRY-RUN por padrão; --approve-paid-call
// executa a detecção real.
//
// Caso: _batch_base.jpg + região aproximada sobre os PAINÉIS DE MADEIRA da
// parede + instrução "trocar os painéis por madeira clara".
// (Nota: neste render os painéis estão na parede ESQUERDA; a direita é janela.)

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const TEST_USER = '00000000-0000-4000-8000-0000000000ec'
const BASE_URL = process.env.EDIT_V2_TEST_BASE ?? 'http://localhost:3000'
const IMG = path.join(ROOT, '_batch_base.jpg')

// Região PEQUENA (fração 0–1) sobre um pedaço dos painéis (parede esquerda) —
// valida se a política de componente conexo EXPANDE p/ a parede inteira.
const REGION = { x0: 0.27, y0: 0.47, x1: 0.33, y1: 0.57 }
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

async function host(admin, buf, ct, kind, name) {
  const key = `${TEST_USER}/retocar/${kind}/${name}`
  const { error } = await admin.storage.from('space-mestres').upload(key, buf, { contentType: ct, upsert: true })
  if (error) throw new Error(`upload ${kind}: ${error.message}`)
  return admin.storage.from('space-mestres').getPublicUrl(key).data.publicUrl
}

async function run() {
  if (!existsSync(IMG)) { console.error('✖ _batch_base.jpg ausente'); process.exit(1) }
  const meta = await sharp(IMG).metadata()
  const W = meta.width, H = meta.height
  const x = Math.round(REGION.x0 * W), y = Math.round(REGION.y0 * H)
  const w = Math.round((REGION.x1 - REGION.x0) * W), h = Math.round((REGION.y1 - REGION.y0) * H)

  // região P&B (branco = marcação aproximada)
  const regionPng = await sharp(Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="white"/></svg>`,
  )).png().toBuffer()

  console.log(`Região aproximada: ${(REGION.x0*100).toFixed(0)}–${(REGION.x1*100).toFixed(0)}% x · ${(REGION.y0*100).toFixed(0)}–${(REGION.y1*100).toFixed(0)}% y (sobre os painéis da parede esquerda)`)
  console.log(`Instrução: "${INSTRUCTION}"`)

  if (!APPROVED) {
    console.log('\nDRY-RUN: nada hospedado, nenhuma chamada paga. Para executar:')
    console.log('  node scripts/test-edit-v2-detect-surface.mjs --approve-paid-call')
    return
  }

  const admin = createClient(SUPA, KEY)
  console.log('\nHospedando imagem + região no Storage (grátis)…')
  const [imgUrl, regionUrl] = await Promise.all([
    host(admin, readFileSync(IMG), 'image/jpeg', 'source', 'detect-base.jpg'),
    host(admin, regionPng, 'image/png', 'mask', 'detect-region.png'),
  ])

  console.log(`POST ${BASE_URL}/api/edits/v2/detect-surface (1 detecção paga)`)
  const t0 = Date.now()
  const res = await fetch(`${BASE_URL}/api/edits/v2/detect-surface`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-edit-v2-test-user': TEST_USER },
    body: JSON.stringify({ image_url: imgUrl, region_mask_url: regionUrl, instruction: INSTRUCTION }),
  })
  const ms = Date.now() - t0
  const json = await res.json().catch(() => null)
  console.log(`\nHTTP ${res.status} em ${ms}ms`)
  console.log(JSON.stringify(json, null, 2))

  if (res.ok && json?.surface_mask_url) {
    // preview verde local da seleção (não commitado)
    const maskBuf = Buffer.from(await (await fetch(json.surface_mask_url)).arrayBuffer())
    const reg = await sharp(maskBuf).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
    const rgba = Buffer.alloc(W * H * 4)
    for (let i = 0; i < reg.length; i++) {
      const on = reg[i] > 127, j = i * 4
      rgba[j] = 48; rgba[j+1] = 209; rgba[j+2] = 88; rgba[j+3] = on ? 140 : 0
    }
    const overlay = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
    const out = path.join(ROOT, '_detect_preview.png')
    await sharp(IMG).composite([{ input: overlay }]).png().toFile(out)
    console.log(`\npreview salvo: ${out}`)
  }
}

run().catch(e => { console.error('✖', e?.message ?? e); process.exit(1) })
