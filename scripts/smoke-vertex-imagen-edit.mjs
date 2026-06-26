#!/usr/bin/env node
// scripts/smoke-vertex-imagen-edit.mjs
//
// SMOKE PAGO do Vertex Imagen editImage (imagen-3.0-capability-001) — o gate
// da arquitetura Editar v2 (Fase 1 do plano docs/PLANO-EDITAR-V2-2026-06-12.md).
//
// SEGURANÇA DE CUSTO: por padrão roda em DRY-RUN — imprime o pré-voo de 7 itens
// exigido pelo fundador e SAI sem chamar nada pago. Só executa a chamada real
// com a flag explícita:  node scripts/smoke-vertex-imagen-edit.mjs --approve-paid-call
//
// Overrides opcionais: SMOKE_IMAGE=path SMOKE_MASK=path (senão usa
// _v2_before.jpg + máscara retangular gerada automaticamente).

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

const PROJECT = process.env.GOOGLE_VERTEX_PROJECT?.trim()
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'us-central1'
const CREDS = process.env.GOOGLE_VERTEX_CREDENTIALS_JSON?.trim()
const ADC_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
const ADC_OK = Boolean(ADC_PATH && existsSync(ADC_PATH))
const HAS_CRED = Boolean(CREDS) || ADC_OK

const IMAGE_PATH = process.env.SMOKE_IMAGE || path.join(ROOT, '_v2_before.jpg')
const MASK_PATH = process.env.SMOKE_MASK || path.join(ROOT, '_smoke_mask.png')
const OUT_PATH = path.join(ROOT, '_smoke_vertex_out.png')

const MODEL = 'imagen-3.0-capability-001'
const COST_USD = 0.02 // estimado (~US$0,02/img) — CONFIRMAR na fatura GCP
const PROMPT =
  'Remove the selected element completely. Reconstruct the background coherently: ' +
  'continue floors, walls and material patterns with consistent perspective and ' +
  'lighting. Preserve everything outside the selection pixel-identical.'

const ok = v => (v ? '✔' : '✖ AUSENTE')
function preflight() {
  console.log(`
================== PRÉ-VOO — SMOKE VERTEX IMAGEN EDIT ==================
1) VARIÁVEIS NECESSÁRIAS (.env.local; valores nunca são exibidos)
   GOOGLE_VERTEX_PROJECT ............ ${ok(PROJECT)}
   GOOGLE_VERTEX_LOCATION ........... ${LOCATION} ${process.env.GOOGLE_VERTEX_LOCATION ? '(definida)' : '(default)'}
   Credencial (uma das duas):
     GOOGLE_VERTEX_CREDENTIALS_JSON  ${ok(CREDS)}
     GOOGLE_APPLICATION_CREDENTIALS  ${ADC_PATH ? (ADC_OK ? '✔ (arquivo existe)' : '✖ definida mas arquivo NÃO existe') : '✖ AUSENTE'}

2) PERMISSÕES NECESSÁRIAS
   Service account com papel mínimo "Vertex AI User" (roles/aiplatform.user)
   no projeto, e a API "Vertex AI" (aiplatform.googleapis.com) habilitada.
   Setup passo a passo: docs/EDIT-V2-GCP-SETUP.md

3) COMANDO/CHAMADA QUE SERÁ EXECUTADA
   client.models.editImage({
     model: '${MODEL}',
     prompt: <prompt de remoção, EN>,
     referenceImages: [RawReferenceImage(imagem), MaskReferenceImage(máscara,
       MASK_MODE_USER_PROVIDED, maskDilation: 0.01)],
     config: { editMode: EDIT_MODE_INPAINT_REMOVAL, numberOfImages: 1 },
   })  →  via @google/genai (vertexai: true), região ${LOCATION}

4) CUSTO ESTIMADO
   ~US$${COST_USD.toFixed(2)} por execução (1 imagem). Este script faz 1 chamada.

5) IMAGEM E MÁSCARA DE TESTE
   imagem:  ${IMAGE_PATH} ${existsSync(IMAGE_PATH) ? '✔' : '✖ NÃO ENCONTRADA'}
   máscara: ${MASK_PATH} ${existsSync(MASK_PATH) ? '✔' : '(será gerada automaticamente: retângulo central-inferior ~12% da área)'}

6) PROVIDER/MODELO
   Google Vertex AI · ${MODEL} (inpaint com máscara real em pixels)

7) CRITÉRIOS DE SUCESSO / FALHA
   SUCESSO: resposta com imageBytes; PNG válido salvo em ${path.basename(OUT_PATH)};
            dimensões > 0; duração < 120s; elemento removido dentro da máscara
            e resto visualmente intacto (validação visual do fundador).
   FALHA:   erro de auth/quota/allowlist (bloqueia o motor padrão → plano B =
            Gemini Flash direto), timeout, imagem vazia ou RAI filter.
=========================================================================
`)
}

async function ensureMask() {
  if (existsSync(MASK_PATH)) return
  const { default: sharp } = await import('sharp')
  const meta = await sharp(IMAGE_PATH).metadata()
  const W = meta.width, H = meta.height
  // Retângulo central-inferior (~35% × 35% ⇒ ~12% da área) — região de "piso".
  const rw = Math.round(W * 0.35), rh = Math.round(H * 0.35)
  const left = Math.round((W - rw) / 2), top = Math.round(H * 0.55)
  const rect = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>` +
    `<rect x="${left}" y="${top}" width="${rw}" height="${rh}" fill="white"/></svg>`,
  )
  await sharp(rect).png().toFile(MASK_PATH)
  console.log(`máscara de teste gerada: ${MASK_PATH} (${rw}x${rh} @ ${left},${top} em ${W}x${H})`)
}

async function run() {
  preflight()
  if (!APPROVED) {
    console.log('DRY-RUN: nenhuma chamada paga foi feita. Para executar de verdade:')
    console.log('  node scripts/smoke-vertex-imagen-edit.mjs --approve-paid-call')
    process.exit(0)
  }
  if (!PROJECT || !HAS_CRED) {
    console.error('✖ Faltam GOOGLE_VERTEX_PROJECT e/ou credencial (JSON inline ou GOOGLE_APPLICATION_CREDENTIALS) — ver docs/EDIT-V2-GCP-SETUP.md.')
    process.exit(1)
  }
  if (!existsSync(IMAGE_PATH)) {
    console.error(`✖ Imagem de teste não encontrada: ${IMAGE_PATH}`)
    process.exit(1)
  }
  await ensureMask()

  const { GoogleGenAI, RawReferenceImage, MaskReferenceImage, MaskReferenceMode, EditMode } =
    await import('@google/genai')
  // JSON inline → injeta; só ADC → o SDK lê GOOGLE_APPLICATION_CREDENTIALS sozinho.
  const client = new GoogleGenAI({
    vertexai: true,
    project: PROJECT,
    location: LOCATION,
    ...(CREDS ? { googleAuthOptions: { credentials: JSON.parse(CREDS) } } : {}),
  })

  const raw = new RawReferenceImage()
  raw.referenceId = 1
  raw.referenceImage = { imageBytes: readFileSync(IMAGE_PATH).toString('base64'), mimeType: 'image/jpeg' }
  const mask = new MaskReferenceImage()
  mask.referenceId = 2
  mask.referenceImage = { imageBytes: readFileSync(MASK_PATH).toString('base64'), mimeType: 'image/png' }
  mask.config = { maskMode: MaskReferenceMode.MASK_MODE_USER_PROVIDED, maskDilation: 0.01 }

  console.log(`Executando editImage (${MODEL}, ${LOCATION})…`)
  const t0 = Date.now()
  try {
    const res = await client.models.editImage({
      model: MODEL,
      prompt: PROMPT,
      referenceImages: [raw, mask],
      config: { editMode: EditMode.EDIT_MODE_INPAINT_REMOVAL, numberOfImages: 1, includeRaiReason: true },
    })
    const ms = Date.now() - t0
    const img = res.generatedImages?.[0]?.image
    if (!img?.imageBytes) {
      console.error(`✖ FALHA (${ms}ms): resposta sem imageBytes. RAI/detalhe:`,
        JSON.stringify(res.generatedImages?.[0] ?? res, null, 2).slice(0, 800))
      process.exit(1)
    }
    writeFileSync(OUT_PATH, Buffer.from(img.imageBytes, 'base64'))
    console.log(`✔ SUCESSO em ${ms}ms — resultado salvo em ${OUT_PATH}`)
    console.log(`  custo estimado: ~US$${COST_USD.toFixed(2)} · validar visualmente o antes/depois.`)
  } catch (err) {
    const ms = Date.now() - t0
    console.error(`✖ FALHA (${ms}ms):`, err?.message ?? err)
    if (err?.status) console.error(`  status: ${err.status}`)
    console.error('  Se for auth/permissão: revisar docs/EDIT-V2-GCP-SETUP.md.')
    console.error('  Se for quota/allowlist: solicitar acesso ao capability no console Vertex.')
    process.exit(1)
  }
}

run()
