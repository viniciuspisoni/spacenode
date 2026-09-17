/**
 * A/B do fluxo fotorrealista do plugin SketchUp — captura e prompt isolados.
 *
 * Roda o MOTOR REAL (Orion / gpt-image-2.5 via OpenAI Image API) com o prompt
 * montado pelo buildGenerationPrompt REAL do repositório. Não passa por
 * /api/generate: não consome Nodes e não depende de sessão — a chamada é a
 * mesma que lib/orion/provider.ts faz, com a OPENAI_API_KEY do .env.local.
 *
 * Três execuções, uma variável por vez:
 *   R1  captura ATUAL     + prompt ANTIGO   → o que o plugin entrega hoje
 *   R2  captura PREPARADA + prompt ANTIGO   → isola a CAPTURA
 *   R3  captura PREPARADA + prompt NOVO     → isola o PROMPT
 *
 * O prompt "antigo" é o novo com os blocos novos removidos por string exata
 * (as funções são exportadas), então a única diferença entre R2 e R3 é o texto
 * que esta mudança acrescenta.
 *
 * Uso:
 *   node --env-file=.env.local <bundle> --atual=A.png --preparada=B.png --out=DIR
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { buildFidelityPrompt } from '@/lib/prompts'
import {
  buildLineWorkBlock,
  buildPhotographicBlock,
  LINE_WORK_NEGATIVES,
} from '@/lib/ai/fidelity/render-only'

const arg = (name: string, fallback = '') =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback

const atualPath = arg('atual')
const prepPath = arg('preparada')
const outDir = arg('out', '.')
const model = arg('model', 'gpt-image-2.5-flare')
const quality = arg('quality', 'high')

// Mesmos presets do painel na captura do usuário: exterior, tudo preservado.
const PROMPT_OPTIONS = {
  projectType: 'exterior' as const,
  segment: 'Preservar Original',
  environment: 'Preservar Original',
  lighting: 'Preservar Original',
  background: 'Preservar Original',
  sceneElements: [] as string[],
  fidelityLevel: 'maximum' as const,
  hasAnchor: false,
}

// Mesmo ponto de entrada que /api/generate usa no ramo Máxima (render_only).
const promptNovo = buildFidelityPrompt(
  PROMPT_OPTIONS as Parameters<typeof buildFidelityPrompt>[0],
  'maximum',
  undefined,
  { attempt: 1 },
)

// Prompt de ANTES: o mesmo, sem os blocos que esta mudança acrescentou.
const negFragment = LINE_WORK_NEGATIVES.join(', ')
const promptAntigo = promptNovo
  .replace(buildLineWorkBlock(), '')
  .replace(buildPhotographicBlock('building'), '')
  .replace(`, ${negFragment}`, '')

/** Lado maior 2048, o outro derivado do aspecto e arredondado no múltiplo de
 *  16 — a mesma regra de lib/orion/config.ts (orionSizeParam). */
function sizeFor(width: number, height: number): string {
  const round16 = (n: number) => Math.max(16, Math.ceil(n / 16) * 16)
  return width >= height
    ? `${2048}x${round16((2048 * height) / width)}`
    : `${round16((2048 * width) / height)}x${2048}`
}

function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

async function generate(label: string, imagePath: string, prompt: string) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY ausente (rode com --env-file=.env.local)')
  const bytes = readFileSync(imagePath)
  const { width, height } = pngSize(bytes)
  const size = sizeFor(width, height)

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('quality', quality)
  form.append('n', '1')
  form.append('output_format', 'png')
  form.append('image[]', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'ref-1.png')

  const startedAt = Date.now()
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  const json = (await res.json()) as {
    data?: { b64_json?: string }[]
    usage?: Record<string, number>
    error?: { message?: string }
  }
  if (!res.ok || !json.data?.[0]?.b64_json) {
    throw new Error(`${label}: HTTP ${res.status} ${json.error?.message ?? ''}`)
  }
  const out = path.join(outDir, `${label}.png`)
  writeFileSync(out, Buffer.from(json.data[0].b64_json, 'base64'))
  console.log(
    `${label}: ${size} em ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
    `(entrada ${width}x${height}, prompt ${prompt.length} chars) -> ${out}`,
  )
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  console.log(`prompt ANTIGO ${promptAntigo.length} chars | NOVO ${promptNovo.length} chars`)
  if (promptAntigo === promptNovo) throw new Error('os dois prompts saíram iguais — o recorte falhou')
  writeFileSync(path.join(outDir, 'prompt-antigo.txt'), promptAntigo)
  writeFileSync(path.join(outDir, 'prompt-novo.txt'), promptNovo)

  await generate('R1-captura-atual-prompt-antigo', atualPath, promptAntigo)
  await generate('R2-captura-preparada-prompt-antigo', prepPath, promptAntigo)
  await generate('R3-captura-preparada-prompt-novo', prepPath, promptNovo)
}

main().catch(e => {
  console.error(e.message)
  process.exitCode = 1
})
