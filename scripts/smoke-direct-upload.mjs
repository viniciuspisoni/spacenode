// Smoke do upload direto GENÉRICO (leva 2 — ver lib/storage/direct-upload.ts).
// Exercita contra o bucket REAL o que as rotas sign/confirm e as rotas de
// trabalho (upscale/video) fazem:
//   1. key em path de área nova (animar/source): sign → PUT anon → list/metadata
//   2. path ANINHADO (sketches/{spaceId}): list em diretório de 3 níveis
//   3. download server-side (o que downloadDirectUpload faz) + comparação de bytes
//   4. negativo: MIME fora do allowed_mime_types do bucket rejeitado no PUT
// Sem custo de IA; só operações de Storage, com cleanup no final.
//
// Rodar: node scripts/smoke-direct-upload.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPA || !SERVICE || !ANON) { console.error('✖ envs Supabase ausentes'); process.exit(1) }

const BUCKET = 'space-mestres'
const TEST_USER = '00000000-0000-4000-8000-0000000000ec' // mesmo uid dos outros smokes
const FAKE_SPACE = '11111111-2222-4333-8444-555555555555'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const rand = () => Math.random().toString(36).slice(2, 8)

async function signPutList(admin, anon, dir, label) {
  const key = `${dir}/${Date.now()}-${rand()}.png`
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(key)
  if (signErr || !signed?.token) throw new Error(`createSignedUploadUrl (${label}): ${signErr?.message}`)
  const { error: putErr } = await anon.storage
    .from(BUCKET)
    .uploadToSignedUrl(key, signed.token, PNG_1PX, { contentType: 'image/png' })
  if (putErr) throw new Error(`uploadToSignedUrl (${label}): ${putErr.message}`)

  const fileName = key.split('/').pop()
  const { data: entries, error: listErr } = await admin.storage
    .from(BUCKET)
    .list(dir, { search: fileName, limit: 100 })
  const obj = entries?.find(e => e.name === fileName)
  if (listErr || !obj) throw new Error(`list (${label}) não achou o objeto: ${listErr?.message}`)
  const { size, mimetype } = obj.metadata ?? {}
  if (size !== PNG_1PX.length || mimetype !== 'image/png') {
    throw new Error(`metadata (${label}) inesperada: size=${size} mime=${mimetype}`)
  }
  return key
}

async function run() {
  const admin = createClient(SUPA, SERVICE)
  const anon = createClient(SUPA, ANON)
  const cleanup = []
  let failed = false

  try {
    // 1. área nova (animar/source — mesmo shape de upscale/source etc.)
    const k1 = await signPutList(admin, anon, `${TEST_USER}/animar/source`, 'animar-source')
    cleanup.push(k1)
    console.log('✔ 1. animar/source: sign → PUT anon → list/metadata ok')

    // 2. path aninhado de 3 níveis (sketches/{spaceId})
    const k2 = await signPutList(admin, anon, `${TEST_USER}/sketches/${FAKE_SPACE}`, 'sketch aninhado')
    cleanup.push(k2)
    console.log('✔ 2. sketches/{spaceId}: list em diretório aninhado ok')

    // 3. download server-side (o que as rotas de trabalho fazem)
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(k1)
    if (dlErr || !blob) throw new Error(`download: ${dlErr?.message}`)
    const buf = Buffer.from(await blob.arrayBuffer())
    if (!buf.equals(PNG_1PX)) throw new Error('download: bytes divergem do PUT')
    if (blob.type !== 'image/png') throw new Error(`download: mime inesperado (${blob.type})`)
    console.log(`✔ 3. download server-side ok (${buf.length} bytes, ${blob.type})`)

    // 4. negativo: MIME não permitido barrado pelo bucket
    const badKey = `${TEST_USER}/animar/source/${Date.now()}-${rand()}.txt`
    const { data: signedBad } = await admin.storage.from(BUCKET).createSignedUploadUrl(badKey)
    const { error: badErr } = await anon.storage
      .from(BUCKET)
      .uploadToSignedUrl(badKey, signedBad.token, Buffer.from('nope'), { contentType: 'text/plain' })
    if (!badErr) { cleanup.push(badKey); throw new Error('PUT de text/plain foi ACEITO') }
    console.log(`✔ 4. MIME inválido rejeitado pelo bucket ("${badErr.message}")`)

    console.log('\n✅ smoke OK — mecânica do upload direto genérico validada no bucket real')
  } catch (e) {
    failed = true
    console.error(`\n✖ smoke FALHOU: ${e.message}`)
  } finally {
    if (cleanup.length) {
      const { error } = await admin.storage.from(BUCKET).remove(cleanup)
      console.log(error ? `⚠ cleanup falhou: ${error.message}` : `🧹 cleanup: ${cleanup.length} objeto(s) removido(s)`)
    }
  }
  process.exit(failed ? 1 : 0)
}

run()
