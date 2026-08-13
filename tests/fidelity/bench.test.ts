// tests/fidelity/bench.test.ts — harness de benchmark contra a API REAL.
//
// ⚠️ GASTA DINHEIRO DE VERDADE (1 geração por input). Por isso NUNCA roda na
// suíte normal: só com FIDELITY_BENCH=1 explícito.
//
// Uso:
//   1. Dropar imagens de projeto reais em tests/fidelity/bench/inputs/
//      (nome com prefixo interior-/exterior- define o projectType; default
//      exterior). A pasta está no .gitignore — projetos de cliente não sobem.
//   2. FIDELITY_BENCH=1 FAL_KEY=... npx vitest run tests/fidelity/bench.test.ts
//      (opcional: BENCH_ENGINE=vega|pulsar|quasar, BENCH_RESOLUTION=hd|2k|4k,
//       IMAGE_PROVIDER_PRIMARY=gcp + creds Vertex pra medir o caminho GCP)
//   3. O resultado sai no console e em tests/fidelity/bench/last-run.json.
//      Pra fixar uma baseline: copie last-run.json pra baseline.json — as
//      próximas rodadas imprimem o delta e FALHAM se o score cair > 0.05.
//
// O que mede por input: geometry score v2 completo (recall/blocos/aspecto +
// ΔE de cor) do output contra o original — exatamente a régua de produção.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { fal } from '@fal-ai/client'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { ENGINES, getFalEndpoint, isEngineId, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { generateImage } from '@/lib/ai/image-provider'
import { computeGeometryScore, type GeometryScoreBreakdown } from '@/lib/ai/fidelity/geometry-score'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'

const BENCH_ON = process.env.FIDELITY_BENCH === '1'
const BENCH_DIR = join(process.cwd(), 'tests', 'fidelity', 'bench')
const INPUT_DIR = join(BENCH_DIR, 'inputs')
const REGRESSION_TOLERANCE = 0.05

interface BenchCase { name: string; file: string; projectType: 'interior' | 'exterior' }
interface BenchResult {
  name: string
  engine: string
  resolution: string
  provider: string
  durationMs: number
  geometry: GeometryScoreBreakdown
}

function listCases(): BenchCase[] {
  if (!existsSync(INPUT_DIR)) return []
  return readdirSync(INPUT_DIR)
    .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
    .map(f => ({
      name: f.replace(/\.[^.]+$/, ''),
      file: join(INPUT_DIR, f),
      projectType: /^interior/i.test(f) ? 'interior' as const : 'exterior' as const,
    }))
}

function benchEngine(): EngineId {
  const raw = process.env.BENCH_ENGINE
  return isEngineId(raw) ? raw : 'vega'
}
function benchResolution(): Resolution {
  const raw = process.env.BENCH_RESOLUTION
  const res = isResolution(raw) ? raw : '2k'
  return ENGINES[benchEngine()].resolutions.includes(res) ? res : '2k'
}

async function fetchOutput(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch do output falhou: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

describe.runIf(BENCH_ON)('fidelity bench (API real — FIDELITY_BENCH=1)', () => {
  const cases = listCases()
  const results: BenchResult[] = []

  it('há inputs em tests/fidelity/bench/inputs/', () => {
    expect(cases.length, 'dropar imagens em tests/fidelity/bench/inputs/').toBeGreaterThan(0)
  })

  it.each(cases)('$name', async ({ name, file, projectType }) => {
    fal.config({ credentials: process.env.FAL_KEY })
    const engine = benchEngine()
    const resolution = benchResolution()
    const inputBuf = readFileSync(file)

    const inputUrl = await fal.storage.upload(
      new File([new Uint8Array(inputBuf)], 'bench.jpg', { type: 'image/jpeg' }),
    )

    // Mesmo prompt de produção (Máxima, sem briefing — o bench mede o motor,
    // não a camada de visão) + mesmos params por engine.
    const options: GenerateOptions = {
      projectType,
      segment: 'Residencial',
      environment: '',
      lighting: 'Preservar Original',
      background: 'Preservar Original',
      sceneElements: [],
      geometryLock: 85,
      fidelityMode: 'strict',
      fidelityLevel: 'maximum',
    }
    const prompt = buildFidelityPrompt(options, 'maximum')
    const sharp = (await import('sharp')).default
    const meta = await sharp(inputBuf).metadata()
    const aspectRatio = nearestSupportedAspectRatio(meta.width ?? null, meta.height ?? null)

    const resMap: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
    const falInput = engine === 'quasar'
      ? { prompt, image_urls: [inputUrl], quality: resolution === '4k' ? 'high' : 'medium', image_size: 'auto', num_images: 1, output_format: 'png' }
      : { prompt, image_urls: [inputUrl], resolution: resMap[resolution], num_images: 1, output_format: 'png', ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}) }

    const started = Date.now()
    const gen = await generateImage({
      falEndpoint: getFalEndpoint(engine),
      falInput,
      imageLabels: ['Image #1 — REFERENCE IMAGE (mandatory base: geometry, camera, materials and framing are law):'],
      timeoutMs: 240_000,
      context: `bench:${name}`,
      deliver: { kind: 'dataUrl' },
      gcpConfig: { temperature: 0.2 },
    })

    const outputBuf = await fetchOutput(gen.images[0].url)
    const geometry = await computeGeometryScore(inputBuf, outputBuf)
    results.push({
      name, engine, resolution,
      provider: gen.provider,
      durationMs: Date.now() - started,
      geometry,
    })
    console.log(
      `[bench] ${name}: score=${geometry.score.toFixed(3)} recall=${geometry.edgeRecall.toFixed(3)} ` +
      `ΔEmean=${geometry.meanColorDelta.toFixed(1)} ΔEworst=${geometry.worstCellColorDelta.toFixed(1)} ` +
      `provider=${gen.provider} ${Math.round((Date.now() - started) / 1000)}s`,
    )
    expect(geometry.score).toBeGreaterThan(0)
  }, 300_000)

  it('grava last-run.json e compara com a baseline', () => {
    if (results.length === 0) return
    mkdirSync(BENCH_DIR, { recursive: true })
    writeFileSync(
      join(BENCH_DIR, 'last-run.json'),
      JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
    )

    const baselinePath = join(BENCH_DIR, 'baseline.json')
    if (!existsSync(baselinePath)) {
      console.log('[bench] sem baseline.json — copie last-run.json pra fixar a régua')
      return
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as { results: BenchResult[] }
    for (const r of results) {
      const base = baseline.results.find(b => b.name === r.name && b.engine === r.engine && b.resolution === r.resolution)
      if (!base) continue
      const delta = r.geometry.score - base.geometry.score
      console.log(`[bench] ${r.name}: ${base.geometry.score.toFixed(3)} → ${r.geometry.score.toFixed(3)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)})`)
      expect(
        delta,
        `${r.name} regrediu além da tolerância (${REGRESSION_TOLERANCE}) vs baseline`,
      ).toBeGreaterThanOrEqual(-REGRESSION_TOLERANCE)
    }
  })
})
