// tests/upscale/smoke-real.test.ts — smoke do Ampliar contra o FAL REAL.
//
// ⚠️ GASTA DINHEIRO DE VERDADE (1 upscale por execução). NUNCA roda na suíte
// normal: só com UPSCALE_SMOKE=1 explícito. O resto de tests/upscale.test.ts é
// mockado e roda no `npm test`.
//
// O que ele prova, e que nenhum teste mockado prova:
//   1. O payload novo é ACEITO pelo FAL. Um nome de param errado não falha no
//      TypeScript — falha com 422 em produção, depois do débito.
//   2. O modo Recuperar de fato preserva. Ele é experimento com VERDADE DE
//      CAMPO: degrada um render conhecido, manda recuperar e compara o
//      resultado contra o ORIGINAL. Sem essa referência o teste não
//      distinguiria "recuperou" de "inventou algo bonito" — foi assim que o
//      Clarity passou meses como primário deste modo entregando geometry score
//      0,9307, abaixo de um Lanczos burro (medições em lib/upscale/MEDICOES.md).
//
// Uso:
//   UPSCALE_SMOKE=1 npx vitest run tests/upscale/smoke-real.test.ts
//
// Exige o render de referência em tests/fidelity/bench/inputs/ — pasta
// GITIGNORED, então em clone novo o teste se PULA sozinho em vez de falhar.
//
// A chave sai do .env.local (o vitest não carrega .env sozinho) e NUNCA é
// impressa.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { fal } from '@fal-ai/client'
import { runUpscalePipeline, finalProvider } from '@/lib/upscale'
import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'

const ROOT  = process.cwd()
// `tests/fidelity/bench/inputs/` é GITIGNORED (.gitignore:51) — os renders de
// referência não vêm no clone. Sem a fixture o smoke não roda: pular é o certo,
// falhar seria culpar quem clonou por um arquivo que o repo não entrega.
const BENCH = join(ROOT, 'tests/fidelity/bench/inputs/interior-mezanino-comercial.jpg')
const ENABLED = process.env.UPSCALE_SMOKE === '1' && existsSync(BENCH)

// Piso de aceitação. O Clarity (primário antigo deste modo) deu 0,9307 no mesmo
// experimento; o Topaz High Fidelity V2 deu 0,9821. 0,95 reprova uma regressão
// para motor generativo sem ser frágil a variação de execução.
const MIN_SCORE = 0.95

describe.runIf(ENABLED)('Ampliar — smoke real contra o FAL', () => {
  it('modo Recuperar preserva a estrutura do original', async () => {
    const key = readFileSync(join(ROOT, '.env.local'), 'utf8').match(/^FAL_KEY=(.*)$/m)?.[1]?.trim()
    expect(key, 'FAL_KEY ausente no .env.local').toBeTruthy()
    fal.config({ credentials: key })

    // Verdade de campo: recorte nítido 640×480 de um render real.
    const truth = await sharp(BENCH).extract({ left: 900, top: 60, width: 640, height: 480 }).png().toBuffer()
    // Degradação realista de print de WhatsApp: metade do tamanho + JPEG 35.
    const low   = await sharp(truth).resize(320, 240).jpeg({ quality: 35 }).toBuffer()

    const url = await fal.storage.upload(new File([new Uint8Array(low)], 'low.jpg', { type: 'image/jpeg' }))
    const res = await runUpscalePipeline({
      tab: 'resolution', modeId: 'recover', scale: '2x',
      imageUrl: url, inputDimensions: { width: 320, height: 240 },
    })

    // 1. Roteamento e contrato de preservação, como saiu no fio.
    const step = res.steps[0]
    expect(finalProvider(res)).toBe('topaz')
    expect(step.params.model).toBe('High Fidelity V2')
    expect(step.params.face_enhancement).toBe(false)
    expect(step.params.crop_to_fill).toBe(false)
    expect(step.params.fix_compression).toBe(0.6)
    expect(step.params.output_format).toBe('png')

    // 2. O FAL aceitou e devolveu exatamente 2×, sem recorte, em PNG.
    const out = Buffer.from(await (await fetch(res.outputUrl)).arrayBuffer())
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(640)
    expect(meta.height).toBe(480)

    // 3. Fidelidade contra a verdade de campo.
    const g = await computeGeometryScore(truth, out)
    console.log(
      `[upscale-smoke] score=${g.score.toFixed(4)} recall=${g.edgeRecall.toFixed(4)} ` +
      `dE=${g.meanColorDelta.toFixed(3)} ms=${res.totalDurationMs}`,
    )
    expect(g.score).toBeGreaterThan(MIN_SCORE)
  }, 300_000)
})
