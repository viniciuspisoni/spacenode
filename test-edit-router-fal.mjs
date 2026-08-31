// Smoke test REAL dos 4 endpoints novos do editRouter (faz chamadas PAGAS à Fal.ai).
//
// Rodar:
//   $env:FAL_KEY="..."            # (PowerShell) ou export FAL_KEY=... (bash)
//   $env:FAL_SMOKE_IMAGE="https://.../foto.jpg"
//   $env:FAL_SMOKE_MASK="https://.../mask.png"   # PNG B/W (branco=editar)
//   node test-edit-router-fal.mjs
//
// Valida, por endpoint: schema de input aceito (sem 422), retorno da imagem
// (images[].url) e tratamento de erro. Os shapes abaixo espelham EXATAMENTE os
// engine wrappers em lib/spaces/engines/*. Se algum 422 aparecer, ajuste o
// wrapper correspondente (NÃO o editRouter).

import { fal } from '@fal-ai/client'

const KEY  = process.env.FAL_KEY || process.env.FAL_API_KEY
const IMG  = process.env.FAL_SMOKE_IMAGE
const MASK = process.env.FAL_SMOKE_MASK

if (!KEY) { console.error('✗ defina FAL_KEY'); process.exit(1) }
if (!IMG) { console.error('✗ defina FAL_SMOKE_IMAGE (URL pública)'); process.exit(1) }
fal.config({ credentials: KEY })

const PROMPT = 'remover o objeto na área mascarada e reconstruir o fundo de forma natural'

const cases = [
  {
    id: 'fal-ai/flux-kontext-lora/inpaint',
    needsMask: true,
    input: () => ({
      image_url: IMG, mask_url: MASK, reference_image_url: IMG, prompt: PROMPT,
      num_images: 1, num_inference_steps: 30, guidance_scale: 2.5, output_format: 'jpeg',
    }),
  },
  {
    id: 'fal-ai/nano-banana/edit',
    needsMask: true,
    input: () => ({
      prompt: PROMPT, image_urls: [IMG, MASK], num_images: 1, output_format: 'jpeg',
    }),
  },
  {
    id: 'fal-ai/flux-pro/kontext',
    needsMask: false,
    input: () => ({
      prompt: PROMPT, image_url: IMG, guidance_scale: 3.5, num_images: 1,
      safety_tolerance: '2', output_format: 'jpeg',
    }),
  },
  {
    id: 'fal-ai/gemini-3-pro-image-preview/edit',
    needsMask: true,
    input: () => ({
      prompt: PROMPT, image_urls: [IMG, MASK], resolution: '2K', num_images: 1, output_format: 'jpeg',
    }),
  },
]

let ok = 0, fail = 0
for (const c of cases) {
  if (c.needsMask && !MASK) {
    console.log(`• SKIP ${c.id} (sem FAL_SMOKE_MASK)`); continue
  }
  process.stdout.write(`• ${c.id} … `)
  try {
    const res = await fal.subscribe(c.id, { input: c.input() })
    const url = res?.data?.images?.[0]?.url ?? res?.data?.image?.url
    if (url) { ok++; console.log(`OK → ${url}`) }
    else     { fail++; console.log(`FAIL → sem images[].url. data=${JSON.stringify(res?.data)?.slice(0,200)}`) }
  } catch (e) {
    fail++
    console.log(`FAIL → ${e?.status ?? ''} ${e?.message ?? e}`)
    if (e?.body) console.log('    body:', JSON.stringify(e.body).slice(0, 400))
  }
}
console.log(`\nFAL smoke: ${ok} OK, ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
