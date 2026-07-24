#!/usr/bin/env node
// scripts/smoke-image-provider-gcp.mjs
//
// SMOKE PAGO do caminho GCP/Vertex da camada lib/ai/image-provider — valida
// credenciais Vertex, disponibilidade do modelo Gemini Image no projeto e o
// shape exato da chamada (generateContent + responseModalities + imageConfig)
// que o provider usa em produção. É o pré-requisito antes de ligar
// IMAGE_PROVIDER_PRIMARY=gcp na Vercel.
//
// SEGURANÇA DE CUSTO: por padrão roda em DRY-RUN — imprime o pré-voo e SAI sem
// chamar nada pago. Execução real exige flag explícita:
//   node scripts/smoke-image-provider-gcp.mjs --approve-paid-call         (NB2/Flash 3.1, ~US$0,04)
//   node scripts/smoke-image-provider-gcp.mjs --approve-paid-call --nb1   (Flash 2.5, ~US$0,04)
//   node scripts/smoke-image-provider-gcp.mjs --approve-paid-call --pro   (Pro 3, 2K, ~US$0,13)
//
// Overrides: SMOKE_IMAGE=path (input; default _batch_base.jpg da raiz).

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const USE_PRO = process.argv.includes('--pro')
const USE_NB1 = process.argv.includes('--nb1')

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val
  }
}
loadEnvLocal()

// — mesma convenção de envs/modelos do lib/ai/image-provider.ts —
const PROJECT   = process.env.GOOGLE_VERTEX_PROJECT?.trim()
const LOCATION  = process.env.GOOGLE_VERTEX_IMAGE_LOCATION?.trim() || 'global'
const CREDS_JSON = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
const CREDS_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()

const MODEL = USE_PRO
  ? (process.env.GCP_IMAGE_MODEL_NANO_BANANA_PRO?.trim() || 'gemini-3-pro-image')
  : USE_NB1
    ? (process.env.GCP_IMAGE_MODEL_NANO_BANANA?.trim() || 'gemini-2.5-flash-image')
    : (process.env.GCP_IMAGE_MODEL_NANO_BANANA_2?.trim() || 'gemini-3.1-flash-image')
// 2.5 Flash Image não aceita imageConfig.imageSize (o provider também omite).
const SUPPORTS_IMAGE_SIZE = !USE_NB1
const RESOLUTION = USE_PRO ? '2K' : '1K'
const COST_USD = USE_PRO ? 0.134 : 0.04

const IMAGE_PATH = process.env.SMOKE_IMAGE || path.join(ROOT, '_batch_base.jpg')
const OUT_PATH = path.join(ROOT, `_smoke_provider_gcp_${USE_PRO ? 'pro' : USE_NB1 ? 'nb1' : 'nb2'}.png`)

const PROMPT =
  'Edit the provided architectural image. Preserve the original camera angle, perspective, ' +
  'geometry, proportions, openings, layout, scale and architectural intent. ' +
  'Change ONLY the sky to a clear late-afternoon golden-hour sky with soft warm light. ' +
  'Keep the result photorealistic.'

const ok = v => (v ? '✔' : '✖ AUSENTE')
console.log(`
============ PRÉ-VOO — SMOKE IMAGE-PROVIDER (GCP/VERTEX) ============
1) VARIÁVEIS (.env.local; valores nunca são exibidos)
   GOOGLE_VERTEX_PROJECT ............ ${ok(PROJECT)}
   Credencial (uma das duas):
     GOOGLE_VERTEX_CREDENTIALS_JSON . ${ok(CREDS_JSON)}
     GOOGLE_APPLICATION_CREDENTIALS . ${ok(CREDS_FILE)}
   GOOGLE_VERTEX_IMAGE_LOCATION ..... ${LOCATION}
2) MODELO ........................... ${MODEL} (res ${RESOLUTION}${SUPPORTS_IMAGE_SIZE ? '' : ' — sem imageSize'})
3) INPUT ............................ ${IMAGE_PATH} ${ok(existsSync(IMAGE_PATH))}
4) CUSTO ESTIMADO ................... ~US$${COST_USD} (1 imagem)
5) SAÍDA ............................ ${OUT_PATH}
=====================================================================
`)

if (!PROJECT || (!CREDS_JSON && !CREDS_FILE) || !existsSync(IMAGE_PATH)) {
  console.error('Pré-voo incompleto — corrija os itens ✖ acima.')
  process.exit(1)
}
if (!APPROVED) {
  console.log('DRY-RUN: nada foi chamado. Para executar o teste pago:')
  console.log('  node scripts/smoke-image-provider-gcp.mjs --approve-paid-call')
  process.exit(0)
}

const { GoogleGenAI, Modality, createPartFromBase64, createPartFromText } = await import('@google/genai')

const client = new GoogleGenAI({
  vertexai: true,
  project: PROJECT,
  location: LOCATION,
  ...(CREDS_JSON ? { googleAuthOptions: { credentials: JSON.parse(CREDS_JSON) } } : {}),
})

const imgBuf = readFileSync(IMAGE_PATH)
const mime = IMAGE_PATH.endsWith('.png') ? 'image/png' : 'image/jpeg'

console.log(`Chamando ${MODEL} em ${LOCATION}…`)
const t0 = Date.now()
try {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [createPartFromText(PROMPT), createPartFromBase64(imgBuf.toString('base64'), mime)],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
      temperature: 0.2,
      ...(SUPPORTS_IMAGE_SIZE ? { imageConfig: { imageSize: RESOLUTION } } : {}),
    },
  })
  const ms = Date.now() - t0
  const parts = response.candidates?.[0]?.content?.parts ?? []
  const inline = parts.find(p => p.inlineData?.data)?.inlineData
  if (!inline?.data) {
    console.error(`✖ Sem imagem na resposta (${ms}ms). Partes:`, parts.map(p => Object.keys(p)))
    process.exit(1)
  }
  const out = Buffer.from(inline.data, 'base64')
  writeFileSync(OUT_PATH, out)
  const usage = response.usageMetadata
  console.log(`✔ OK em ${ms}ms — ${out.length} bytes (${inline.mimeType})`)
  console.log(`  responseId: ${response.responseId ?? '—'}`)
  console.log(`  tokens: prompt=${usage?.promptTokenCount ?? '—'} out=${usage?.candidatesTokenCount ?? '—'}`)
  console.log(`  salvo em: ${OUT_PATH}`)
  console.log('\nPróximo passo: IMAGE_PROVIDER_PRIMARY=gcp no .env.local e na Vercel (+ redeploy).')
} catch (err) {
  console.error(`✖ FALHOU em ${Date.now() - t0}ms:`, err?.message ?? err)
  console.error('  Se for 404/NOT_FOUND: o id do modelo não está disponível neste projeto/região —')
  console.error('  ajuste GCP_IMAGE_MODEL_* ou GOOGLE_VERTEX_IMAGE_LOCATION e rode de novo.')
  process.exit(1)
}
