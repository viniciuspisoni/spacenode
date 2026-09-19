// tests/upscale/classify-source.test.ts
//
// O classificador decide se o Topaz roda no Text Refine (desenho técnico puro)
// ou no High Fidelity V2 (todo o resto). O erro caro é o falso POSITIVO — um
// render mandado pro Text Refine perde textura (MEDICOES.md §9) — então os
// negativos aqui são os casos que mais se parecem com planta sem ser.

import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { classifySource } from '@/lib/upscale/classify-source'

const W = 800, H = 600

/** Planta sintética: paredes, porta em arco, rótulos e cotas — traço sobre branco. */
function plantaSvg(bg = '#ffffff', ink = '#111111'): Buffer {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g stroke="${ink}" fill="none">
    <rect x="80" y="60" width="640" height="460" stroke-width="8"/>
    <line x1="360" y1="60" x2="360" y2="330" stroke-width="5"/>
    <line x1="80" y1="330" x2="520" y2="330" stroke-width="5"/>
    <path d="M360 260 A50 50 0 0 1 310 310" stroke-width="1.5"/>
    <rect x="120" y="100" width="150" height="80" stroke-width="1.5"/>
    <line x1="80" y1="560" x2="720" y2="560" stroke-width="1"/>
  </g>
  <g font-family="Arial" fill="${ink}">
    <text x="150" y="230" font-size="18" font-weight="bold">SALA</text>
    <text x="150" y="252" font-size="13">24,10 m²</text>
    <text x="420" y="200" font-size="18" font-weight="bold">COZINHA</text>
    <text x="380" y="585" font-size="12">8,00</text>
  </g>
</svg>`)
}

/** "Render": gradientes e sombreado — nada de traço puro. */
async function renderFake(): Promise<Buffer> {
  const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fa8dc"/><stop offset="1" stop-color="#e8f0f8"/></linearGradient>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d6e4a"/><stop offset="1" stop-color="#c9a77a"/></linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <rect x="100" y="200" width="600" height="300" fill="url(#wall)"/>
  <rect x="0" y="480" width="800" height="120" fill="#4d7a3a"/>
</svg>`)
  return sharp(svg).png().toBuffer()
}

describe('classifySource', () => {
  it('reconhece planta em traço sobre branco', async () => {
    const r = await classifySource(await sharp(plantaSvg()).png().toBuffer())
    expect(r.kind).toBe('line-art')
    expect(r.stats.lightPct).toBeGreaterThan(80)
    expect(r.stats.saturation).toBeLessThan(0.03)
  })

  it('continua reconhecendo depois de compressão JPEG forte', async () => {
    const jpeg = await sharp(plantaSvg()).resize(400, 300).jpeg({ quality: 40 }).toBuffer()
    expect((await classifySource(jpeg)).kind).toBe('line-art')
  })

  it('reconhece planta em fundo cinza claro (papel/escaneado)', async () => {
    const r = await classifySource(await sharp(plantaSvg('#ececec', '#222222')).png().toBuffer())
    expect(r.kind).toBe('line-art')
  })

  it('NÃO classifica render como desenho', async () => {
    expect((await classifySource(await renderFake())).kind).toBe('image')
  })

  it('NÃO classifica render sobre fundo branco como desenho (o negativo difícil)', async () => {
    // Fundo claro passa no primeiro portão; meios-tons e saturação barram.
    const render = await sharp(await renderFake()).resize(400).toBuffer()
    const emBranco = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
      .composite([{ input: render, left: 200, top: 150 }]).png().toBuffer()
    const r = await classifySource(emBranco)
    expect(r.kind).toBe('image')
    expect(r.stats.lightPct).toBeGreaterThan(70) // prova que foi pelo portão certo
  })

  it('NÃO classifica prancha (render + texto) como desenho', async () => {
    const render = await sharp(await renderFake()).resize(450).toBuffer()
    const prancha = await sharp(plantaSvg('#f4f2ee')).composite([{ input: render, left: 40, top: 40 }]).png().toBuffer()
    expect((await classifySource(prancha)).kind).toBe('image')
  })

  it('NÃO classifica render em preto e branco como desenho', async () => {
    // Saturação zero passa; os meios-tons do sombreado barram.
    const cinza = await sharp(await renderFake()).greyscale().png().toBuffer()
    expect((await classifySource(cinza)).kind).toBe('image')
  })

  it('aceita PNG com alfa (transparência vira fundo)', async () => {
    const comAlfa = await sharp(plantaSvg()).ensureAlpha().png().toBuffer()
    await expect(classifySource(comAlfa)).resolves.toBeTruthy()
  })
})
