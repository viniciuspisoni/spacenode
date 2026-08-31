// Smoke test: Gemini via Vertex AI para geração de render arquitetônico.
// Testa se o modelo de geração do Vertex produz resultado equivalente ao FAL NB2.
//
// Uso: node test-vertex-generate.mjs
//
// Salva o resultado em _vertex_generate_out.jpg para avaliação visual.

import { GoogleGenAI } from '@google/genai'
import { readFileSync, writeFileSync } from 'fs'

const CREDS_PATH = `${process.env.USERPROFILE}/Downloads/gen-lang-client-0191517804-d3df6e49284c.json`
const INPUT_IMAGE = './_v2_before.jpg'
const OUTPUT_FILE = './_vertex_generate_out.jpg'

// Modelos a testar em ordem de preferência
const CANDIDATE_MODELS = [
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-preview-05-20',
]

const RENDER_PROMPT = `
You are an expert architectural visualization engine.
Transform this architectural reference image into a high-quality photorealistic render.
Apply modern interior design: warm neutral tones, natural wood materials, indirect warm lighting (3000K).
Preserve the exact geometry, perspective, proportions, camera angle and spatial layout.
Do NOT change walls, floor plan, structural elements or viewpoint.
Output: photorealistic architectural interior render, professional quality.
`.trim()

async function run() {
  console.log('=== Vertex AI Gemini — Render Test ===\n')

  // Carregar credenciais
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'))
  console.log(`Project: ${creds.project_id}`)
  console.log(`Service account: ${creds.client_email}\n`)

  const genai = new GoogleGenAI({
    vertexai: true,
    project: creds.project_id,
    location: 'us-central1',
    googleAuthOptions: { credentials: creds },
  })

  // Carregar imagem de entrada como base64
  const imgBuf = readFileSync(INPUT_IMAGE)
  const imgB64 = imgBuf.toString('base64')
  console.log(`Input image: ${INPUT_IMAGE} (${Math.round(imgBuf.length / 1024)}KB)`)

  let success = false

  for (const model of CANDIDATE_MODELS) {
    console.log(`\n--- Tentando modelo: ${model} ---`)
    try {
      const t0 = Date.now()
      const result = await genai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imgB64 } },
              { text: RENDER_PROMPT },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 1,
        },
      })

      const elapsed = Date.now() - t0
      console.log(`Tempo: ${elapsed}ms`)

      // Procurar parte de imagem na resposta
      const parts = result.candidates?.[0]?.content?.parts ?? []
      console.log(`Parts na resposta: ${parts.length}`)

      for (const part of parts) {
        if (part.text) console.log(`  TEXT: ${part.text.substring(0, 100)}`)
        if (part.inlineData) {
          const { mimeType, data } = part.inlineData
          console.log(`  IMAGE: ${mimeType}, ${Math.round(data.length * 0.75 / 1024)}KB`)
          const imgOut = Buffer.from(data, 'base64')
          writeFileSync(OUTPUT_FILE, imgOut)
          console.log(`\n✅ Imagem salva em: ${OUTPUT_FILE}`)
          success = true
        }
      }

      if (success) {
        console.log(`\nModelo funcional: ${model}`)
        break
      } else {
        console.log('  Nenhuma imagem na resposta — modelo pode não suportar geração de imagem')
      }
    } catch (err) {
      console.log(`  ERRO: ${err.message?.substring(0, 200)}`)
    }
  }

  if (!success) {
    console.log('\n⚠️  Nenhum modelo de geração disponível via Vertex AI neste projeto.')
    console.log('Alternativa: usar Imagen 3 (text-to-image) ou manter FAL para geração.')

    // Testar Imagen 3 generate (text-to-image, sem imagem de referência)
    console.log('\n--- Testando Imagen 3 generate (text-to-image) ---')
    try {
      const t0 = Date.now()
      const result = await genai.models.generateImages({
        model: 'imagen-3.0-generate-001',
        prompt: 'Modern minimalist interior render, living room with warm lighting, natural wood, white walls, professional architectural visualization',
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
          outputMimeType: 'image/jpeg',
        },
      })

      const elapsed = Date.now() - t0
      const imgOut = result.generatedImages?.[0]?.image
      if (imgOut?.imageBytes) {
        const buf = Buffer.from(imgOut.imageBytes, 'base64')
        writeFileSync('./_vertex_imagen3_out.jpg', buf)
        console.log(`✅ Imagen 3 funcionou! ${elapsed}ms — salvo em _vertex_imagen3_out.jpg`)
        console.log('  Nota: Imagen 3 é text-to-image puro (sem preservar geometria da foto original)')
      }
    } catch (err) {
      console.log(`  ERRO Imagen 3: ${err.message?.substring(0, 200)}`)
    }
  }
}

run().catch(err => {
  console.error('\n💥 Erro fatal:', err.message)
  process.exit(1)
})
