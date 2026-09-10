// tests/fidelity/bench.test.ts — harness de benchmark contra a API REAL.
//
// ⚠️ GASTA DINHEIRO DE VERDADE (1 geração por input). Por isso NUNCA roda na
// suíte normal: só com FIDELITY_BENCH=1 explícito. Nenhum outro teste deste
// repo chama fornecedor — todos usam mock.
//
// Uso:
//   1. Dropar imagens de projeto reais em tests/fidelity/bench/inputs/
//      (nome com prefixo interior-/exterior- define o projectType; default
//      exterior). A pasta está no .gitignore — projetos de cliente não sobem.
//   2. FIDELITY_BENCH=1 npx vitest run tests/fidelity/bench.test.ts
//      (credenciais vêm do .env.local — não passe chave na linha de comando)
//      (opcional: BENCH_ENGINE=vega|pulsar|quasar, BENCH_RESOLUTION=hd|2k|4k,
//       IMAGE_PROVIDER_PRIMARY=gcp + creds Vertex pra medir o caminho GCP)
//   3. O resultado sai no console e em tests/fidelity/bench/last-run.json.
//      Pra fixar uma baseline: copie last-run.json pra baseline.json — as
//      próximas rodadas imprimem o delta e FALHAM se o score cair > 0.05.
//
// Piloto Orion (GPT Image 2.5), comparação reproduzível contra os públicos:
//   FIDELITY_BENCH=1 BENCH_ENGINE=orion-sunburst \
//     npx vitest run tests/fidelity/bench.test.ts
//   BENCH_ENGINE aceita orion-sunburst | orion-flare; BENCH_ORION_QUALITY
//   escolhe high (default) ou medium; ORION_IMAGE_PROVIDER=fal troca a rota.
//   Rodar as quatro células — orion-sunburst, orion-flare, quasar, vega — com
//   os MESMOS inputs dá a tabela de comparação (o last-run.json guarda
//   tokens e custo estimado por caso).
//   Na rota direta o input viaja como data: URL: o benchmark do Orion/OpenAI
//   roda SEM FAL_KEY, igual à produção.
//
// O que mede por input: geometry score v2 completo (recall/blocos/aspecto +
// ΔE de cor) do output contra o original — exatamente a régua de produção —
// mais tempo e, no Orion, tokens e custo estimado em USD. Câmera, aberturas e
// materiais entram com BENCH_SEMANTIC=1 (auditoria de visão, chamada paga à
// parte). Texto/tipografia não tem métrica automática: os arquivos ficam pra
// leitura humana.
//
// Os PARÂMETROS dos motores públicos vêm de lib/ai/engine-params — os mesmos
// da rota de produção. Antes eram montados aqui e ficaram para trás: o Quasar
// ainda era medido com params do GPT Image 2 (`quality`, `image_size: 'auto'`)
// muito depois de virar Seedream 5.0 Pro.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { fal } from '@fal-ai/client'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { ENGINES, getFalEndpoint, isEngineId, isResolution, type EngineId, type Resolution } from '@/lib/engines'
import { falParamsForEngine } from '@/lib/ai/engine-params'
import { generateImage } from '@/lib/ai/image-provider'
import { computeGeometryScore, type GeometryScoreBreakdown } from '@/lib/ai/fidelity/geometry-score'
import { nearestSupportedAspectRatio } from '@/lib/ai/aspect-ratio'
import { orionTargetSize, isOrionQuality, type OrionQuality, type OrionVariant } from '@/lib/orion/config'
import { generateOrionImage, orionProvider } from '@/lib/orion/provider'
import { estimateOrionCostUsd, type OrionUsage } from '@/lib/orion/pricing'
import { loadEnvLocal } from '../helpers/env-local'

// Credenciais saem do .env.local — não da linha de comando (o cabeçalho antes
// mandava passar FAL_KEY=... inline, o que deixa o segredo no histórico).
loadEnvLocal()

const BENCH_ON = process.env.FIDELITY_BENCH === '1'
const BENCH_DIR = join(process.cwd(), 'tests', 'fidelity', 'bench')
const INPUT_DIR = join(BENCH_DIR, 'inputs')
const REGRESSION_TOLERANCE = 0.05

// Repetições por caso. A MESMA célula (mesma imagem, mesmo motor, mesmo
// prompt) varia bastante entre execuções — medido em 2026-09-10 no Orion:
// sunburst/medium foi de 0,716 a 0,910 em três tiros. Com n=1 a comparação
// entre motores vira cara-ou-coroa, então o default aqui é 3.
const REPEAT = Math.max(1, Math.min(10, Number(process.env.BENCH_REPEAT) || 3))

/** Célula da comparação: um motor público OU uma variante do Orion. */
type BenchCell =
  | { kind: 'public'; engine: EngineId }
  | { kind: 'orion'; variant: OrionVariant }

interface BenchCase { name: string; file: string; projectType: 'interior' | 'exterior' }
interface BenchRun extends BenchCase { run: number }
interface BenchResult {
  name: string
  run: number
  engine: string
  resolution: string
  provider: string
  providerModel: string
  durationMs: number
  requestedSize: string | null
  deliveredSize: string | null
  geometry: GeometryScoreBreakdown
  /** Só no Orion — a fal não devolve tokens neste endpoint. */
  usage?: OrionUsage
  estimatedUsd?: number | null
  costMissing?: string[]
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

function benchCell(): BenchCell {
  const raw = process.env.BENCH_ENGINE?.trim().toLowerCase()
  if (raw === 'orion-sunburst' || raw === 'orion') return { kind: 'orion', variant: 'sunburst' }
  if (raw === 'orion-flare') return { kind: 'orion', variant: 'flare' }
  return { kind: 'public', engine: isEngineId(raw) ? raw : 'vega' }
}

function benchResolution(cell: BenchCell): Resolution {
  // Orion só roda 2K no piloto.
  if (cell.kind === 'orion') return '2k'
  const raw = process.env.BENCH_RESOLUTION
  const res = isResolution(raw) ? raw : '2k'
  return ENGINES[cell.engine].resolutions.includes(res) ? res : '2k'
}

function benchOrionQuality(): OrionQuality {
  const raw = process.env.BENCH_ORION_QUALITY?.trim().toLowerCase()
  return isOrionQuality(raw) ? raw : 'high'
}

function cellLabel(cell: BenchCell): string {
  return cell.kind === 'orion' ? `orion-${cell.variant}` : cell.engine
}

const OUTPUT_DIR = join(BENCH_DIR, 'outputs')

/** Salva o resultado pra leitura humana. Tipografia, materiais e "cara de
 *  render" não têm métrica automática — o geometry score não substitui o olho.
 *  O nome carrega cena, motor e nº da execução, então nada sobrescreve nada. */
function saveOutput(buf: Buffer, name: string, engine: string, run: number): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const safe = (s: string) => s.replace(/[^a-z0-9._-]+/gi, '-')
  writeFileSync(join(OUTPUT_DIR, `${safe(engine)}--${safe(name)}--${run}.png`), buf)
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
  // Cada caso vira REPEAT execuções — a agregação no fim reporta média e
  // amplitude, que é o que permite dizer se uma diferença entre motores é real.
  const runs: BenchRun[] = cases.flatMap(c =>
    Array.from({ length: REPEAT }, (_, i) => ({ ...c, run: i + 1 })),
  )
  const results: BenchResult[] = []

  it('há inputs em tests/fidelity/bench/inputs/', () => {
    expect(cases.length, 'dropar imagens em tests/fidelity/bench/inputs/').toBeGreaterThan(0)
  })

  it.each(runs)('$name #$run', async ({ name, file, projectType, run }) => {
    const cell = benchCell()
    const resolution = benchResolution(cell)
    const inputBuf = readFileSync(file)

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
    const label = ['Image #1 — REFERENCE IMAGE (mandatory base: geometry, camera, materials and framing are law):']
    const sharp = (await import('sharp')).default
    const meta = await sharp(inputBuf).metadata()
    const aspectRatio = nearestSupportedAspectRatio(meta.width ?? null, meta.height ?? null)

    const started = Date.now()
    let result: BenchResult

    if (cell.kind === 'orion') {
      const provider = orionProvider()
      const quality = benchOrionQuality()
      const size = orionTargetSize(meta.width ?? null, meta.height ?? null)
      // Rota direta: data: URL basta (fetchStorageBytes aceita e o corpo vai
      // em bytes) — sem FAL_KEY. Rota fal: a fal precisa BUSCAR a imagem.
      const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg'
      const inputUrl = provider === 'fal'
        ? await (async () => {
            fal.config({ credentials: process.env.FAL_KEY })
            return fal.storage.upload(new File([new Uint8Array(inputBuf)], 'bench.jpg', { type: mime }))
          })()
        : `data:${mime};base64,${inputBuf.toString('base64')}`

      const gen = await generateOrionImage({
        variant: cell.variant,
        quality,
        size,
        prompt,
        imageUrls: [inputUrl],
        timeoutMs: 240_000,
        context: `bench:${name}`,
        deliver: { kind: 'dataUrl' },
      })
      const outputBuf = await fetchOutput(gen.images[0].url)
      const geometry = await computeGeometryScore(inputBuf, outputBuf)
      saveOutput(outputBuf, name, `${cellLabel(cell)}-${quality}`, run)
      const cost = estimateOrionCostUsd(gen.usage)
      result = {
        name,
        run,
        engine: `${cellLabel(cell)}:${quality}`,
        resolution,
        provider: gen.provider,
        providerModel: gen.providerModel,
        durationMs: Date.now() - started,
        requestedSize: `${size.width}x${size.height}`,
        deliveredSize: gen.deliveredSize ? `${gen.deliveredSize.width}x${gen.deliveredSize.height}` : null,
        geometry,
        usage: gen.usage,
        estimatedUsd: cost.usd,
        costMissing: cost.missing,
      }
    } else {
      fal.config({ credentials: process.env.FAL_KEY })
      const inputUrl = await fal.storage.upload(
        new File([new Uint8Array(inputBuf)], 'bench.jpg', { type: 'image/jpeg' }),
      )
      // Params IDÊNTICOS aos da rota de produção (lib/ai/engine-params).
      const falInput = {
        prompt,
        image_urls: [inputUrl],
        ...falParamsForEngine(cell.engine, resolution, aspectRatio),
      }
      const gen = await generateImage({
        falEndpoint: getFalEndpoint(cell.engine),
        falInput,
        imageLabels: label,
        timeoutMs: 240_000,
        context: `bench:${name}`,
        deliver: { kind: 'dataUrl' },
        gcpConfig: { temperature: 0.2 },
      })
      const outputBuf = await fetchOutput(gen.images[0].url)
      const geometry = await computeGeometryScore(inputBuf, outputBuf)
      saveOutput(outputBuf, name, cell.engine, run)
      result = {
        name,
        run,
        engine: cell.engine,
        resolution,
        provider: gen.provider,
        providerModel: gen.providerModel,
        durationMs: Date.now() - started,
        requestedSize: null,
        deliveredSize: gen.images[0].width && gen.images[0].height
          ? `${gen.images[0].width}x${gen.images[0].height}`
          : null,
        geometry,
      }
    }

    results.push(result)
    console.log(
      `[bench] ${name} (${result.engine}): score=${result.geometry.score.toFixed(3)} ` +
      `recall=${result.geometry.edgeRecall.toFixed(3)} ` +
      `ΔEmean=${result.geometry.meanColorDelta.toFixed(1)} ΔEworst=${result.geometry.worstCellColorDelta.toFixed(1)} ` +
      `provider=${result.provider} ${Math.round(result.durationMs / 1000)}s ` +
      `saida=${result.deliveredSize ?? 'n/d'}` +
      (result.estimatedUsd !== undefined
        ? ` custo=${result.estimatedUsd === null ? 'n/d' : `US$${result.estimatedUsd.toFixed(4)}`}`
        : ''),
    )
    expect(result.geometry.score).toBeGreaterThan(0)
  }, 300_000)

  it('agrega, grava last-run.json e compara com a baseline', () => {
    if (results.length === 0) return
    mkdirSync(BENCH_DIR, { recursive: true })

    // ── Agregação por célula (imagem × motor) ────────────────────────────────
    //
    // Média E amplitude. A amplitude é o número que impede uma diferença de
    // ruído de virar decisão de produto: se dois motores diferem menos do que
    // a própria dispersão deles, não dá pra escolher por aqui.
    // Agrupa por (cena, motor) guardando as partes no próprio valor — nada de
    // concatenar e dar split depois: nome de arquivo pode conter o separador.
    const byCell = new Map<string, { name: string; engine: string; rs: BenchResult[] }>()
    for (const r of results) {
      const k = JSON.stringify([r.name, r.engine])
      const cur = byCell.get(k)
      if (cur) cur.rs.push(r)
      else byCell.set(k, { name: r.name, engine: r.engine, rs: [r] })
    }
    const agg = [...byCell.values()].map(({ name, engine, rs }) => {
      const s = rs.map(r => r.geometry.score).sort((a, b) => a - b)
      const mean = s.reduce((a, b) => a + b, 0) / s.length
      const usd = rs.reduce((a, r) => a + (r.estimatedUsd ?? 0), 0)
      return {
        name, engine, n: s.length,
        scoreMean: mean, scoreMin: s[0], scoreMax: s[s.length - 1], spread: s[s.length - 1] - s[0],
        durationMsMean: rs.reduce((a, r) => a + r.durationMs, 0) / rs.length,
        usdTotal: rs.some(r => r.estimatedUsd != null) ? usd : null,
      }
    }).sort((a, b) => b.scoreMean - a.scoreMean)

    console.log('\n[bench] média de %d execuções por célula:', REPEAT)
    console.log('  ' + 'cena'.padEnd(34) + 'motor'.padEnd(20) + 'n  ' + 'média'.padEnd(8) + 'mín'.padEnd(8) + 'máx'.padEnd(8) + 'amplitude'.padEnd(11) + 'tempo')
    for (const a of agg) {
      console.log(
        '  ' + a.name.slice(0, 32).padEnd(34) + a.engine.padEnd(20) + String(a.n).padEnd(3) +
        a.scoreMean.toFixed(3).padEnd(8) + a.scoreMin.toFixed(3).padEnd(8) + a.scoreMax.toFixed(3).padEnd(8) +
        a.spread.toFixed(3).padEnd(11) + (a.durationMsMean / 1000).toFixed(1) + 's',
      )
    }
    const totalUsd = results.reduce((a, r) => a + (r.estimatedUsd ?? 0), 0)
    if (totalUsd > 0) console.log(`  custo total da rodada: US$ ${totalUsd.toFixed(4)} (${results.length} gerações)\n`)

    writeFileSync(
      join(BENCH_DIR, 'last-run.json'),
      JSON.stringify({ ranAt: new Date().toISOString(), repeat: REPEAT, aggregate: agg, results }, null, 2),
    )
    // Ledger acumulado: rodar outra célula (outro motor) NÃO apaga a anterior —
    // é assim que a tabela de comparação entre motores se monta.
    const ledgerPath = join(BENCH_DIR, 'runs.json')
    const ledger = existsSync(ledgerPath) ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as BenchResult[]) : []
    ledger.push(...results)
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))

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
