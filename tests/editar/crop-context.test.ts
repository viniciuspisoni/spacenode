import { describe, it, expect } from 'vitest'
import { MIN_CROP_SIDE, withMinimumContext } from '@/lib/edit-v4/crop-context'
import type { CropPlan } from '@/lib/spaces/edit-crop'

/** Monta um plano como o `planCrop` devolveria (sem redução: scale 1). */
function plan(left: number, top: number, width: number, height: number): CropPlan {
  return {
    region: { left, top, width, height },
    scale: 1,
    outWidth: width,
    outHeight: height,
    outMegapixels: (width * height) / 1_000_000,
  }
}

const MAX_MP = 2.36 // faixa barata do Seedream

describe('withMinimumContext', () => {
  it('cresce um crop minúsculo até o piso de contexto', () => {
    // O caso real de 10/09: pincel numa costura de estofado, bbox de ~130 px.
    const out = withMinimumContext(plan(900, 700, 130, 110), 2048, 1536, MAX_MP)
    expect(out.region.width).toBe(MIN_CROP_SIDE)
    expect(out.region.height).toBe(MIN_CROP_SIDE)
  })

  it('mantém a área marcada dentro do crop crescido', () => {
    const original = { left: 900, top: 700, width: 130, height: 110 }
    const out = withMinimumContext(plan(900, 700, 130, 110), 2048, 1536, MAX_MP)
    expect(out.region.left).toBeLessThanOrEqual(original.left)
    expect(out.region.top).toBeLessThanOrEqual(original.top)
    expect(out.region.left + out.region.width).toBeGreaterThanOrEqual(original.left + original.width)
    expect(out.region.top + out.region.height).toBeGreaterThanOrEqual(original.top + original.height)
  })

  it('cresce em volta do centro da marcação', () => {
    const out = withMinimumContext(plan(900, 700, 130, 110), 2048, 1536, MAX_MP)
    expect(out.region.left + out.region.width / 2).toBeCloseTo(900 + 130 / 2, 0)
    expect(out.region.top + out.region.height / 2).toBeCloseTo(700 + 110 / 2, 0)
  })

  it('não sai da imagem quando a marcação está no canto', () => {
    for (const p of [plan(0, 0, 60, 60), plan(1988, 1476, 60, 60)]) {
      const out = withMinimumContext(p, 2048, 1536, MAX_MP)
      expect(out.region.left).toBeGreaterThanOrEqual(0)
      expect(out.region.top).toBeGreaterThanOrEqual(0)
      expect(out.region.left + out.region.width).toBeLessThanOrEqual(2048)
      expect(out.region.top + out.region.height).toBeLessThanOrEqual(1536)
      expect(out.region.width).toBe(MIN_CROP_SIDE)
      expect(out.region.height).toBe(MIN_CROP_SIDE)
    }
  })

  it('não passa do tamanho da imagem quando ela é menor que o piso', () => {
    const out = withMinimumContext(plan(10, 10, 40, 40), 300, 200, MAX_MP)
    expect(out.region.width).toBe(200)
    expect(out.region.height).toBe(200)
    expect(out.region.left + out.region.width).toBeLessThanOrEqual(300)
    expect(out.region.top + out.region.height).toBeLessThanOrEqual(200)
  })

  it('devolve o plano intacto quando o crop já tem contexto', () => {
    const p = plan(100, 100, 900, 700)
    expect(withMinimumContext(p, 2048, 1536, MAX_MP)).toBe(p)
  })

  it('cresce só o lado que falta', () => {
    // Faixa larga e baixa (uma emenda horizontal): a largura já basta.
    const out = withMinimumContext(plan(200, 400, 800, 90), 2048, 1536, MAX_MP)
    expect(out.region.width).toBe(800)
    expect(out.region.height).toBe(MIN_CROP_SIDE)
  })

  it('recalcula escala e saída para o crop crescido', () => {
    const out = withMinimumContext(plan(900, 700, 130, 110), 2048, 1536, MAX_MP)
    expect(out.scale).toBe(1) // 512² = 0,26 MP, muito abaixo do teto
    expect(out.outWidth).toBe(out.region.width)
    expect(out.outHeight).toBe(out.region.height)
    expect(out.outMegapixels).toBeCloseTo((512 * 512) / 1_000_000, 6)
  })

  it('respeita o teto de megapixels ao crescer', () => {
    const out = withMinimumContext(plan(0, 0, 100, 100), 4000, 4000, 0.1)
    expect(out.region.width).toBe(MIN_CROP_SIDE)
    expect(out.outMegapixels).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(out.scale).toBeLessThan(1)
  })

  it('o piso derruba a ampliação pedida ao modelo', () => {
    // Sem piso o modelo recebia ~130 px e devolvia 1024²: 7,9× de invenção.
    // Com piso ele recebe 512 e a ampliação cai para 2×.
    const semPiso = 1024 / 130
    const out = withMinimumContext(plan(900, 700, 130, 110), 2048, 1536, MAX_MP)
    const comPiso = 1024 / out.outWidth
    expect(semPiso).toBeGreaterThan(7)
    expect(comPiso).toBeLessThanOrEqual(2)
  })
})
