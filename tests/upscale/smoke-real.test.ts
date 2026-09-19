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
// GITIGNORED: em clone novo o caso do Recuperar se PULA sozinho; o do desenho
// técnico é sintético e roda sempre.
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
// referência não vêm no clone. Sem a fixture, só o caso que depende dela se
// pula — falhar seria culpar quem clonou por um arquivo que o repo não entrega.
const BENCH = join(ROOT, 'tests/fidelity/bench/inputs/interior-mezanino-comercial.jpg')
const ENABLED   = process.env.UPSCALE_SMOKE === '1'
const HAS_BENCH = existsSync(BENCH)   // só o caso do Recuperar depende dele

// Piso de aceitação. O Clarity (primário antigo deste modo) deu 0,9307 no mesmo
// experimento; o Topaz High Fidelity V2 deu 0,9821. 0,95 reprova uma regressão
// para motor generativo sem ser frágil a variação de execução.
const MIN_SCORE = 0.95

describe.runIf(ENABLED)('Ampliar — smoke real contra o FAL', () => {
  it.skipIf(!HAS_BENCH)('modo Recuperar preserva a estrutura do original', async () => {
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
  it('desenho técnico vai pro Text Refine e preserva 100% do traço', async () => {
    const key = readFileSync(join(ROOT, '.env.local'), 'utf8').match(/^FAL_KEY=(.*)$/m)?.[1]?.trim()
    expect(key, 'FAL_KEY ausente no .env.local').toBeTruthy()
    fal.config({ credentials: key })

    // Planta sintética (traço + rótulos), sem depender de fixture externa.
    const W = 1200, H = 900
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<rect width="100%" height="100%" fill="#fff"/>` +
      `<g stroke="#111" fill="none"><rect x="120" y="100" width="960" height="680" stroke-width="10"/>` +
      `<line x1="520" y1="100" x2="520" y2="480" stroke-width="6"/><line x1="120" y1="480" x2="760" y2="480" stroke-width="6"/>` +
      `<path d="M520 380 A60 60 0 0 1 460 440" stroke-width="1.5"/><rect x="160" y="140" width="220" height="110" stroke-width="1.5"/>` +
      `<line x1="120" y1="830" x2="1080" y2="830" stroke-width="1"/></g>` +
      `<g font-family="Arial" fill="#111"><text x="240" y="300" font-size="22" font-weight="bold">SALA DE ESTAR</text>` +
      `<text x="240" y="326" font-size="16">32,40 m²</text><text x="600" y="220" font-size="22" font-weight="bold">COZINHA</text>` +
      `<text x="560" y="855" font-size="14">12,00</text></g></svg>`,
    )
    const truth = await sharp(svg).png().toBuffer()
    const low   = await sharp(truth).resize(W / 2, H / 2).jpeg({ quality: 70 }).toBuffer()

    // O classificador tem de reconhecer a degradada como line-art …
    const { classifySource } = await import('@/lib/upscale/classify-source')
    const cls = await classifySource(low)
    expect(cls.kind).toBe('line-art')

    // … e o pipeline tem de rodar no Text Refine com esse sinal.
    const url = await fal.storage.upload(new File([new Uint8Array(low)], 'planta.jpg', { type: 'image/jpeg' }))
    const res = await runUpscalePipeline({
      tab: 'resolution', modeId: 'fidelity', scale: '2x',
      imageUrl: url, inputDimensions: { width: W / 2, height: H / 2 }, sourceKind: cls.kind,
    })
    expect(finalProvider(res)).toBe('topaz')
    expect(res.steps[0].params.model).toBe('Text Refine')

    // Sem retry: o Text Refine tem de ter respondido ele mesmo. (Se falhar, o
    // orchestrator repete com o padrão e o resultado vira o de sempre — o
    // teste precisa distinguir isso de "funcionou".)
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].status).toBe('completed')

    const out = Buffer.from(await (await fetch(res.outputUrl)).arrayBuffer())
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(W)
    expect(meta.height).toBe(H)

    // Métrica de TRAÇO, não o geometry score: em linha de 1 px reduzida a 384 px
    // o edge recall oscila ±7% entre plantas por artefato de percentil (MEDICOES
    // §9.2). Tinta = cinza < 128; recall com tolerância de ±1 px. HF V2 e Text
    // Refine dão 1,000 aqui — o que o Text Refine melhora é a PRECISÃO (menos
    // halo): 0,977 → 0,988 nesta planta.
    const inkRecall = await inkRecallAgainst(truth, out)
    console.log(`[upscale-smoke] line-art tinta-recall=${inkRecall.toFixed(4)} ms=${res.totalDurationMs}`)
    expect(inkRecall).toBeGreaterThan(0.99)
  }, 300_000)
})

// Fração da tinta da verdade (cinza < 128) presente no resultado, com
// tolerância de ±1 px — "as linhas sobreviveram?", sem percentil de borda.
async function inkRecallAgainst(truth: Buffer, out: Buffer): Promise<number> {
  const { width: w, height: h } = await sharp(truth).metadata()
  const W = w!, H = h!
  const t = await sharp(truth).greyscale().raw().toBuffer()
  const o = await sharp(out).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()
  let ink = 0, hit = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] >= 128) continue
    ink++
    let found = false
    for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx
      if (yy >= 0 && yy < H && xx >= 0 && xx < W && o[yy * W + xx] < 128) { found = true; break }
    }
    if (found) hit++
  }
  return ink ? hit / ink : 1
}
