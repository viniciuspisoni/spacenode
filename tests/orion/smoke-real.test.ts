// tests/orion/smoke-real.test.ts — smoke do Orion contra a API REAL.
//
// ⚠️ GASTA DINHEIRO DE VERDADE (1 geração por execução). NUNCA roda na suíte
// normal: só com ORION_SMOKE=1 explícito. Todo o resto de tests/orion/ é
// mockado e roda no `npm test`.
//
// É o teste de aceitação do piloto: prova que a rota escolhida entrega imagem,
// com que dimensão, em quanto tempo, quantos tokens e quanto custou — os
// números que o generation_log grava em produção, sem depender de banco,
// sessão ou migration.
//
// Uso:
//   ORION_SMOKE=1 npx vitest run tests/orion/smoke-real.test.ts
//
//   ORION_SMOKE_VARIANT    sunburst (default) | flare
//   ORION_SMOKE_QUALITY    high (default) | medium
//   ORION_SMOKE_RESOLUTION 2k (default) | 4k — 4K é 3840 no lado maior, teto
//                          real da Image API (não os 4096 px do "4K" de
//                          Vega/Pulsar)
//   ORION_SMOKE_INPUT      caminho da imagem base (default _batch_base.jpg)
//   ORION_SMOKE_OUT        diretório de saída (default o diretório atual)
//   ORION_IMAGE_PROVIDER   openai (default) | fal
//
// A chave sai do .env.local (o vitest não carrega .env sozinho) e NUNCA é
// impressa. A saída vai como data: URL — sem Storage, sem Supabase.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'
import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'
import { orionTargetSize, orionSizeParam, isOrionQuality, isOrionVariant } from '@/lib/orion/config'
import { generateOrionImage, orionProvider } from '@/lib/orion/provider'
import { estimateOrionCostUsd } from '@/lib/orion/pricing'
import { loadEnvLocal } from '../helpers/env-local'

const SMOKE_ON = process.env.ORION_SMOKE === '1'

describe.runIf(SMOKE_ON)('Orion · smoke real (ORION_SMOKE=1 — chamada paga)', () => {
  it('gera uma imagem e reporta dimensão, tempo, tokens e custo', async () => {
    loadEnvLocal()

    const variant = isOrionVariant(process.env.ORION_SMOKE_VARIANT) ? process.env.ORION_SMOKE_VARIANT : 'sunburst'
    const quality = isOrionQuality(process.env.ORION_SMOKE_QUALITY) ? process.env.ORION_SMOKE_QUALITY : 'high'
    const resolution = process.env.ORION_SMOKE_RESOLUTION?.trim().toLowerCase() === '4k' ? '4k' : '2k'
    const inputPath = process.env.ORION_SMOKE_INPUT ?? join(process.cwd(), '_batch_base.jpg')
    const outDir = process.env.ORION_SMOKE_OUT ?? process.cwd()

    expect(existsSync(inputPath), `imagem de entrada não encontrada: ${inputPath}`).toBe(true)
    const inputBuf = readFileSync(inputPath)

    const sharp = (await import('sharp')).default
    const meta = await sharp(inputBuf).metadata()
    const size = orionTargetSize(meta.width ?? null, meta.height ?? null, resolution)

    // MESMO prompt da produção (Máxima, sem briefing — o smoke mede o motor).
    const options: GenerateOptions = {
      projectType: 'interior',
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

    // data: URL — fetchStorageBytes aceita e manda os bytes no corpo. Sem
    // Storage, sem FAL_KEY, sem banco: prova a rota direta isolada.
    const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg'
    const inputUrl = `data:${mime};base64,${inputBuf.toString('base64')}`

    const started = Date.now()
    const gen = await generateOrionImage({
      variant,
      quality,
      size,
      prompt,
      imageUrls: [inputUrl],
      timeoutMs: 240_000,
      context: `smoke:${variant}:${quality}:${resolution}`,
      deliver: { kind: 'dataUrl' },
    })
    const wallMs = Date.now() - started

    const outBuf = Buffer.from(gen.images[0].url.slice(gen.images[0].url.indexOf(',') + 1), 'base64')
    const outPath = join(outDir, `_orion_${variant}_${quality}_${resolution}.png`)
    writeFileSync(outPath, outBuf)

    const geometry = await computeGeometryScore(inputBuf, outBuf)
    const cost = estimateOrionCostUsd(gen.usage)
    const delivered = gen.deliveredSize ? `${gen.deliveredSize.width}x${gen.deliveredSize.height}` : 'desconhecida'

    console.log(
      `\n[orion:smoke] ${variant}/${quality}/${resolution} via ${gen.provider} (${gen.providerModel})\n` +
      `  entrada    : ${meta.width}x${meta.height}\n` +
      `  pedido     : ${orionSizeParam(size)} (${size.source})\n` +
      `  entregue   : ${delivered}\n` +
      `  tempo      : ${(wallMs / 1000).toFixed(1)}s (provider ${(gen.latencyMs / 1000).toFixed(1)}s)\n` +
      `  request id : ${gen.requestId ?? 'n/a'}\n` +
      `  qualidade  : pedida ${quality} / ecoada ${gen.qualityReported ?? 'n/d'}\n` +
      `  tokens     : in ${gen.usage.inputTokens ?? 'n/d'} (texto ${gen.usage.inputTextTokens ?? 'n/d'} / imagem ${gen.usage.inputImageTokens ?? 'n/d'})` +
      ` · out ${gen.usage.outputTokens ?? 'n/d'} · total ${gen.usage.totalTokens ?? 'n/d'}\n` +
      `  custo est. : ${cost.usd === null ? `n/d (faltou: ${cost.missing.join(', ')})` : `US$ ${cost.usd.toFixed(4)}`}\n` +
      `  geometria  : score ${geometry.score.toFixed(3)} (recall ${geometry.edgeRecall.toFixed(3)}` +
      ` · aspectΔ ${geometry.aspectDelta.toFixed(3)} · ΔEmédio ${geometry.meanColorDelta.toFixed(1)})\n` +
      `  arquivo    : ${outPath}\n`,
    )

    // Métricas em disco: o vitest intercepta stdout, e a tabela de comparação
    // entre células (sunburst/flare × high/medium) precisa dos números
    // acumulados. Cada execução acrescenta uma linha.
    const ledgerPath = join(outDir, '_orion_smoke.json')
    const ledger = existsSync(ledgerPath)
      ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as unknown[])
      : []
    ledger.push({
      ranAt: new Date().toISOString(),
      provider: gen.provider,
      model: gen.providerModel,
      variant,
      quality,
      resolution,
      qualityReported: gen.qualityReported,
      input: `${meta.width}x${meta.height}`,
      requestedSize: orionSizeParam(size),
      deliveredSize: delivered,
      wallMs,
      providerMs: gen.latencyMs,
      requestId: gen.requestId,
      usage: gen.usage,
      estimatedUsd: cost.usd,
      costMissing: cost.missing,
      geometry: {
        score: geometry.score,
        edgeRecall: geometry.edgeRecall,
        aspectDelta: geometry.aspectDelta,
        meanColorDelta: geometry.meanColorDelta,
      },
      file: outPath,
    })
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))

    expect(outBuf.length).toBeGreaterThan(10_000)
    expect(gen.provider).toBe(orionProvider())
    // Dimensão explícita é contrato do piloto: nada de 'auto' nem upscale mudo.
    expect(gen.deliveredSize, 'fornecedor não informou a dimensão entregue').not.toBeNull()
  }, 300_000)
})
