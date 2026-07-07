#!/usr/bin/env node
// scripts/smoke-vertex-veo.mjs
//
// SMOKE PAGO do Veo 3.1 via Vertex AI (image-to-video) — valida credencial,
// modelo, long-running operation e download dos bytes ANTES de ligar o
// VERTEX_VEO_ENABLED=1 no app (lib/video/adapters/vertexVeoAdapter.ts).
//
// SEGURANÇA DE CUSTO: por padrão roda em DRY-RUN — imprime o pré-voo e SAI
// sem chamar nada pago. Só executa a chamada real com a flag explícita:
//   node scripts/smoke-vertex-veo.mjs --approve-paid-call
//
// Custo do smoke: 1 vídeo de 4s @ 720p sem áudio (a menor configuração).
// Preço por segundo varia por conta/contrato — CONFIRMAR na fatura GCP.
//
// Overrides opcionais:
//   SMOKE_IMAGE=path      (default _batch_base.jpg)
//   VERTEX_VEO_MODEL_ID   (default veo-3.1-generate-001)
//   SMOKE_RESOLUTION      (default 720p; o app usa 1080p)

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')

// --- .env.local (parse manual; NUNCA imprime valores) -----------------------
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const key = m[1]
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}
loadEnvLocal()

const PROJECT  = process.env.GOOGLE_VERTEX_PROJECT?.trim()
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
const CREDS    = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
const ADC_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
const ADC_OK   = Boolean(ADC_PATH && existsSync(ADC_PATH))
const HAS_CRED = Boolean(CREDS) || ADC_OK

const MODEL      = process.env.VERTEX_VEO_MODEL_ID?.trim() || 'veo-3.1-generate-001'
const RESOLUTION = process.env.SMOKE_RESOLUTION?.trim() || '720p'
const DURATION_S = 4
const IMAGE_PATH = process.env.SMOKE_IMAGE || path.join(ROOT, '_batch_base.jpg')
const OUT_PATH   = path.join(ROOT, '_smoke_vertex_veo_out.mp4')

const PROMPT =
  'Create a realistic architectural video from the provided reference image. ' +
  'Very slow dolly forward, gentle parallax, controlled and restrained motion. ' +
  'Preserve original architecture exactly: geometry, materials, furniture and lighting. ' +
  'Cinematic architectural visualization, photorealistic, no distortion, no morphing.'

const ok = v => (v ? '✔' : '✖ AUSENTE')
function preflight() {
  console.log(`
=================== PRÉ-VOO — SMOKE VERTEX VEO (VÍDEO) ===================
1) VARIÁVEIS NECESSÁRIAS (.env.local; valores nunca são exibidos)
   GOOGLE_VERTEX_PROJECT ............ ${ok(PROJECT)}
   GOOGLE_VERTEX_LOCATION ........... ${LOCATION}
   Credencial (uma das duas):
     GOOGLE_VERTEX_CREDENTIALS_JSON . ${ok(CREDS)}
     GOOGLE_APPLICATION_CREDENTIALS . ${ADC_PATH ? (ADC_OK ? '✔ (arquivo existe)' : '✖ caminho não existe') : '✖ AUSENTE'}
2) MODELO ........................... ${MODEL}
3) CONFIG DO SMOKE .................. ${DURATION_S}s · ${RESOLUTION} · 16:9 · sem áudio · 1 vídeo
4) IMAGEM DE ENTRADA ................ ${IMAGE_PATH} ${existsSync(IMAGE_PATH) ? '✔' : '✖ não existe'}
5) CUSTO ............................ 1 geração paga (~${DURATION_S}s × preço/s do Veo na SUA conta — confirmar na fatura GCP)
6) SAÍDA ............................ ${OUT_PATH}
7) EXECUÇÃO PAGA .................... ${APPROVED ? 'APROVADA (--approve-paid-call)' : 'NÃO — dry-run, nada será chamado'}
===========================================================================
`)
}

preflight()

if (!PROJECT || !HAS_CRED) {
  console.error('Pré-voo incompleto: configure as envs acima antes de rodar.')
  process.exit(1)
}
if (!existsSync(IMAGE_PATH)) {
  console.error('Imagem de entrada não encontrada:', IMAGE_PATH)
  process.exit(1)
}
if (!APPROVED) {
  console.log('DRY-RUN concluído. Para executar a chamada paga:')
  console.log('  node scripts/smoke-vertex-veo.mjs --approve-paid-call')
  process.exit(0)
}

// ── Chamada real (paga) ──────────────────────────────────────────────────────
const { GoogleGenAI } = await import('@google/genai')

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT,
  location: LOCATION,
  ...(CREDS ? { googleAuthOptions: { credentials: JSON.parse(CREDS) } } : {}),
})

const imageBytes = readFileSync(IMAGE_PATH).toString('base64')
const t0 = Date.now()
console.log(`[1/3] generateVideos → ${MODEL} (${DURATION_S}s ${RESOLUTION})…`)

let operation = await ai.models.generateVideos({
  model: MODEL,
  prompt: PROMPT,
  image: { imageBytes, mimeType: 'image/jpeg' },
  config: {
    durationSeconds: DURATION_S,
    aspectRatio: '16:9',
    resolution: RESOLUTION,
    generateAudio: false,
    numberOfVideos: 1,
  },
})
console.log('      operation:', operation.name ?? '(sem nome)')

console.log('[2/3] aguardando operação concluir (poll 10s)…')
while (!operation.done) {
  if (Date.now() - t0 > 300_000) {
    console.error('Timeout: operação não concluiu em 5 min. Operation:', operation.name)
    process.exit(1)
  }
  await new Promise(r => setTimeout(r, 10_000))
  operation = await ai.operations.getVideosOperation({ operation })
  process.stdout.write('.')
}
console.log('')

if (operation.error) {
  console.error('Operação retornou erro:', JSON.stringify(operation.error, null, 2))
  process.exit(1)
}

const resp  = operation.response
const video = resp?.generatedVideos?.[0]?.video
if (!video?.videoBytes) {
  if (resp?.raiMediaFilteredCount) {
    console.error('Vídeo filtrado por política (RAI):', resp.raiMediaFilteredReasons?.join('; '))
  } else {
    console.error('Sem videoBytes na resposta:', JSON.stringify(resp ?? {}, null, 2).slice(0, 800))
  }
  process.exit(1)
}

const buf = Buffer.from(video.videoBytes, 'base64')
writeFileSync(OUT_PATH, buf)
console.log(`[3/3] OK em ${Math.round((Date.now() - t0) / 1000)}s — ${(buf.length / 1048576).toFixed(1)}MB salvos em ${OUT_PATH}`)
console.log('Próximo passo: VERTEX_VEO_ENABLED=1 no .env.local (e na Vercel) liga o adapter no app.')
