import { describe, expect, it } from 'vitest'
import { layoutLabels } from '@/lib/apresentar/plan-labels'
import type { PlanRoom } from '@/lib/apresentar/config'

function room(partial: Partial<PlanRoom>): PlanRoom {
  return { name: 'Sala', kind: 'social', cx: 0.5, cy: 0.5, w: 0.3, h: 0.3, ...partial }
}

const W = 2000
const H = 1500

describe('layoutLabels', () => {
  it('posiciona no centro do ambiente, em px da imagem', () => {
    const [label] = layoutLabels([room({ cx: 0.25, cy: 0.8 })], W, H)
    expect(label.x).toBe(500)
    expect(label.y).toBe(1200)
  })

  it('não passa da fonte base mesmo num ambiente enorme', () => {
    const grande = layoutLabels([room({ w: 0.9, h: 0.9 })], W, H)[0]
    // 1,65% de 2000 = 33px. Salão inteiro não vira outdoor.
    expect(grande.fontSize).toBeCloseTo(33, 0)
  })

  it('encolhe a fonte para o nome caber na largura do ambiente', () => {
    // 0,05 da largura = 100 px: nem com a quebra em duas linhas cabe a fonte
    // base, então é a largura que manda.
    const estreito = layoutLabels([room({ name: 'Área de Serviço', w: 0.05 })], W, H)[0]
    const largo    = layoutLabels([room({ name: 'Área de Serviço', w: 0.5  })], W, H)[0]
    expect(estreito.fontSize).toBeLessThan(largo.fontSize)
    // A linha mais longa tem que caber na largura do ambiente.
    const maiorLinha = Math.max(...estreito.lines.map(l => l.length))
    expect(estreito.fontSize * maiorLinha * 0.66).toBeLessThanOrEqual(0.05 * W)
  })

  it('quebra nome longo em duas linhas equilibradas quando o ambiente é estreito', () => {
    const [label] = layoutLabels([room({ name: 'Área de Serviço', w: 0.1, h: 0.3 })], W, H)
    expect(label.lines).toEqual(['Área de', 'Serviço'])
    expect(label.lineHeight).toBeGreaterThan(label.fontSize)
  })

  it('não quebra quando uma linha só rende fonte maior', () => {
    const [label] = layoutLabels([room({ name: 'Sala de Jantar', w: 0.6, h: 0.5 })], W, H)
    expect(label.lines).toEqual(['Sala de Jantar'])
  })

  it('não hifeniza nome de uma palavra só', () => {
    const [label] = layoutLabels([room({ name: 'Churrasqueira', w: 0.3, h: 0.3 })], W, H)
    expect(label.lines).toEqual(['Churrasqueira'])
  })

  it('descarta ambiente pequeno demais para um rótulo legível', () => {
    // Um lavabo minúsculo com um nome longo: melhor sem nome que atravessado.
    const out = layoutLabels([room({ name: 'Área de Serviço', w: 0.02, h: 0.02 })], W, H)
    expect(out).toHaveLength(0)
  })

  it('nome longo em ambiente baixo é limitado pela ALTURA', () => {
    const baixo = layoutLabels([room({ name: 'Hall', w: 0.6, h: 0.04 })], W, H)[0]
    expect(baixo.fontSize).toBeLessThanOrEqual(0.04 * H * 0.42 + 0.05)
  })

  it('ignora nome em branco e imagem sem dimensão', () => {
    expect(layoutLabels([room({ name: '   ' })], W, H)).toHaveLength(0)
    expect(layoutLabels([room({})], 0, 0)).toHaveLength(0)
  })

  it('mantém a ordem dos ambientes que sobrevivem', () => {
    const out = layoutLabels(
      [
        room({ name: 'Sala',    cx: 0.2, w: 0.3 }),
        room({ name: 'Closet',  cx: 0.5, w: 0.02, h: 0.02 }), // cai fora
        room({ name: 'Cozinha', cx: 0.8, w: 0.3 }),
      ],
      W, H,
    )
    expect(out.map(l => l.name)).toEqual(['Sala', 'Cozinha'])
  })
})
