#!/usr/bin/env node
// scripts/smoke-gemini-image-edit.mjs
//
// SMOKE PAGO do Gemini Image via API direta (sem FAL) — valida o provider
// gemini-image do Editar v2 (Fase 1, docs/PLANO-EDITAR-V2-2026-06-12.md).
//
// SEGURANÇA DE CUSTO: por padrão roda em DRY-RUN — imprime o pré-voo de 7 itens
// e SAI sem chamar nada pago. Execução real exige flag explícita:
//   node scripts/smoke-gemini-image-edit.mjs --approve-paid-call          (Flash, ~US$0,067)
//   node scripts/smoke-gemini-image-edit.mjs --approve-paid-call --pro    (Pro,   ~US$0,134)
//
// Overrides: SMOKE_IMAGE=path SMOKE_MASK=path SMOKE_REF=path (referência opcional).

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const APPROVED = process.argv.includes('--approve-paid-call')
const USE_PRO = process.argv.includes('--pro')

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

const API_KEY = process.env.GEMINI_API_KEY?.trim()
const MODEL = USE_PRO ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image'
const COST_USD = USE_PRO ? 0.134 : 0.067 // 1K, preço oficial Google (06/2026)

const IMAGE_PATH = process.env.SMOKE_IMAGE || path.join(ROOT, '_v2_before.jpg')
const MASK_PATH = process.env.SMOKE_MASK || path.join(ROOT, '_smoke_mask.png')
const REF_PATH = process.env.SMOKE_REF || null
const OUT_PATH = path.join(ROOT, USE_PRO ? '_smoke_gemini_pro_out.png' : '_smoke_gemini_out.png')

const PROMPT =
  'Image 1 is the MAIN architectural image to edit. ' +
  'Image 2 is a black-and-white SELECTION MAP of the main image: WHITE marks the only ' +
  'region you may change; BLACK must remain pixel-identical. It is a map, not a picture. ' +
  (REF_PATH
    ? 'Image 3 is a MATERIAL REFERENCE: reproduce this material faithfully on the selected surface. '
    : '') +
  'Edit the provided architectural image. Preserve the original camera angle, perspective, ' +
  'geometry, proportions, openings, layout, scale, lighting logic, and architectural intent. ' +
  'Modify only the selected area. ' +
  (REF_PATH
    ? 'MATERIAL SWAP — replace the floor material inside the selection with the reference material, following the real perspective and inheriting the scene lighting.'
    : 'CORRECTION — repair the selected area reconstructing what should plausibly be there, consistent with surrounding materials, geometry and lighting.') +
  ' Keep the result photorealistic and architecturally plausible.'

const ok = v => (v ? '✔' : '✖ AUSENTE')
function preflight() {
  console.log(`
================== PRÉ-VOO — SMOKE GEMINI IMAGE EDIT ===================
1) VARIÁVEIS NECESSÁRIAS (.env.local; valores nunca são exibidos)
   GEMINI_API_KEY ................... ${ok(API_KEY)}  (a mesma já usada pelo produto)

2) PERMISSÕES NECESSÁRIAS
   Nenhuma além da API key Gemini ativa (billing habilitado no projeto da key).

3) COMANDO/CHAMADA QUE SERÁ EXECUTADA
   client.models.generateContent({
     model: '${MODEL}',
     contents: [prompt EN, imagem principal${existsSync(MASK_PATH) ? ', máscara (mapa)' : ''}${REF_PATH ? ', referência de material' : ''}],
     config: { responseModalities: [IMAGE, TEXT], imageConfig: { imageSize: '1K' }, temperature: 0.2 },
   })  →  via @google/genai (API direta, sem FAL)

4) CUSTO ESTIMADO
   ~US$${COST_USD.toFixed(3)} por execução (saída 1K). Este script faz 1 chamada.

5) IMAGEM E MÁSCARA DE TESTE
   imagem:     ${IMAGE_PATH} ${existsSync(IMAGE_PATH) ? '✔' : '✖ NÃO ENCONTRADA'}
   máscara:    ${MASK_PATH} ${existsSync(MASK_PATH) ? '✔' : '(será gerada automaticamente)'}
   referência: ${REF_PATH ?? '(nenhuma — modo correção)'}

6) PROVIDER/MODELO
   Google Gemini API direta · ${MODEL} ${USE_PRO ? '(Alta precisão)' : '(Econômica)'}
   ATENÇÃO: o modelo NÃO recebe máscara em pixels — a seleção vai como mapa +
   contrato textual; no produto, a preservação fora da seleção é garantida pelo
   recompose server-side (este smoke avalia o quanto o modelo respeita sozinho).

7) CRITÉRIOS DE SUCESSO / FALHA
   SUCESSO: parte inlineData com imagem; PNG salvo em ${path.basename(OUT_PATH)};
            duração < ${USE_PRO ? 150 : 120}s; edição aplicada DENTRO da seleção;
            drift fora da seleção baixo (validação visual + recompose cobre o resto).
   FALHA:   erro de auth/quota, timeout, resposta sem imagem, ou edição que
            re-renderiza a cena inteira (anotar — recompose mitiga, mas conta
            contra a qualidade do modelo p/ o caso).
=========================================================================
`)
}

async function ensureMask() {
  if (existsSync(MASK_PATH)) return
  const { default: sharp } = await import('sharp')
  const meta = await sharp(IMAGE_PATH).metadata()
  const W = meta.width, H = meta.height
  const rw = Math.round(W * 0.35), rh = Math.round(H * 0.35)
  const left = Math.round((W - rw) / 2), top = Math.round(H * 0.55)
  const rect = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>` +
    `<rect x="${left}" y="${top}" width="${rw}" height="${rh}" fill="white"/></svg>`,
  )
  await sharp(rect).png().toFile(MASK_PATH)
  console.log(`máscara de teste gerada: ${MASK_PATH}`)
}

function b64Part(filePath, mime) {
  return { inlineData: { data: readFileSync(filePath).toString('base64'), mimeType: mime } }
}

async function run() {
  preflight()
  if (!APPROVED) {
    console.log('DRY-RUN: nenhuma chamada paga foi feita. Para executar de verdade:')
    console.log(`  node scripts/smoke-gemini-image-edit.mjs --approve-paid-call${USE_PRO ? ' --pro' : ''}`)
    process.exit(0)
  }
  if (!API_KEY) {
    console.error('✖ GEMINI_API_KEY ausente no .env.local.')
    process.exit(1)
  }
  if (!existsSync(IMAGE_PATH)) {
    console.error(`✖ Imagem de teste não encontrada: ${IMAGE_PATH}`)
    process.exit(1)
  }
  await ensureMask()

  const { GoogleGenAI, Modality } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey: API_KEY })

  const parts = [{ text: PROMPT }, b64Part(IMAGE_PATH, 'image/jpeg'), b64Part(MASK_PATH, 'image/png')]
  if (REF_PATH && existsSync(REF_PATH)) parts.push(b64Part(REF_PATH, 'image/jpeg'))

  console.log(`Executando generateContent (${MODEL})…`)
  const t0 = Date.now()
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: parts,
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        imageConfig: { imageSize: '1K' },
        temperature: 0.2,
      },
    })
    const ms = Date.now() - t0
    const out = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)
    if (!out) {
      console.error(`✖ FALHA (${ms}ms): resposta sem imagem. Texto:`,
        (res.text ?? '').slice(0, 300) || '(vazio)')
      process.exit(1)
    }
    writeFileSync(OUT_PATH, Buffer.from(out.inlineData.data, 'base64'))
    console.log(`✔ SUCESSO em ${ms}ms — resultado salvo em ${OUT_PATH}`)
    console.log(`  responseId: ${res.responseId ?? '(n/d)'} · custo estimado: ~US$${COST_USD.toFixed(3)}`)
    console.log('  Validar visualmente: edição dentro da seleção, resto preservado.')
  } catch (err) {
    const ms = Date.now() - t0
    console.error(`✖ FALHA (${ms}ms):`, err?.message ?? err)
    process.exit(1)
  }
}

run()
