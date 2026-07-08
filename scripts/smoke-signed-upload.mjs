// Smoke do upload direto da Vista Mestre (browser → Storage, sem Vercel).
// Exercita a mecânica das rotas sign/confirm contra o bucket REAL:
//   1. createSignedUploadUrl (service role) — o que a rota sign faz
//   2. uploadToSignedUrl com client ANON — o que o browser faz (o token é a
//      única autorização, como no fluxo real)
//   3. list + metadata (size/mimetype) — o que a rota confirm valida
//   4. negativo: MIME fora do allowed_mime_types do bucket deve ser rejeitado
//      no PUT (prova que o teto continua server-side sem passar pela API)
// Sem custo de IA; só operações de Storage, com cleanup no final.
//
// Rodar: node scripts/smoke-signed-upload.mjs

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
const DIR = `${TEST_USER}/smoke-signed-upload`

// PNG 1×1 válido (magic bytes reais)
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function run() {
  const admin = createClient(SUPA, SERVICE)
  const anon = createClient(SUPA, ANON)
  const cleanup = []
  let failed = false

  try {
    // 1. sign (service role)
    const key = `${DIR}/mestre-${Date.now()}.png`
    const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(key)
    if (signErr || !signed?.token) throw new Error(`createSignedUploadUrl: ${signErr?.message}`)
    console.log(`✔ 1. signed upload URL emitida (key=…/${key.split('/').pop()})`)

    // 2. PUT com client anon — como o browser
    const { error: putErr } = await anon.storage
      .from(BUCKET)
      .uploadToSignedUrl(key, signed.token, PNG_1PX, { contentType: 'image/png' })
    if (putErr) throw new Error(`uploadToSignedUrl: ${putErr.message}`)
    cleanup.push(key)
    console.log('✔ 2. PUT direto com anon key aceito (token autoriza sozinho)')

    // 3. list + metadata — o que o confirm valida
    const fileName = key.split('/').pop()
    const { data: entries, error: listErr } = await admin.storage
      .from(BUCKET)
      .list(DIR, { search: fileName, limit: 100 })
    const obj = entries?.find(e => e.name === fileName)
    if (listErr || !obj) throw new Error(`list não achou o objeto: ${listErr?.message}`)
    const size = obj.metadata?.size
    const mime = obj.metadata?.mimetype
    if (size !== PNG_1PX.length || mime !== 'image/png') {
      throw new Error(`metadata inesperada: size=${size} mime=${mime}`)
    }
    console.log(`✔ 3. list/metadata ok (size=${size}, mimetype=${mime})`)

    // 4. negativo: MIME não permitido deve falhar no PUT (config do bucket)
    const badKey = `${DIR}/mestre-${Date.now()}-bad.txt`
    const { data: signedBad, error: signBadErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(badKey)
    if (signBadErr || !signedBad?.token) throw new Error(`createSignedUploadUrl (bad): ${signBadErr?.message}`)
    const { error: badErr } = await anon.storage
      .from(BUCKET)
      .uploadToSignedUrl(badKey, signedBad.token, Buffer.from('nope'), { contentType: 'text/plain' })
    if (!badErr) {
      cleanup.push(badKey)
      throw new Error('PUT de text/plain foi ACEITO — allowed_mime_types do bucket não barrou')
    }
    console.log(`✔ 4. MIME inválido rejeitado pelo bucket ("${badErr.message}")`)

    console.log('\n✅ smoke OK — mecânica sign → PUT direto → confirm validada no bucket real')
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
