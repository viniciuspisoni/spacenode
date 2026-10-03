// tests/fidelity/ink-score.test.ts
//
// Prova a tese que motivou o portão de tinta: numa PLANTA BAIXA (traço fino), o
// `computeGeometryScore` não separa "mesma planta humanizada" de "planta
// diferente", e o `computeInkScore` separa.
//
// Números medidos nestas fixtures (2026-09-22):
//
//   caso                 ink     geometry
//   fiel, piso claro     1.000   0.882
//   fiel, piso escuro    1.000   0.818
//   parede movida        0.369   0.761
//   ambiente removido    0.562   0.877   ← acima da planta CORRETA de piso escuro
//   planta redesenhada   0.362   0.733
//
// A linha do ambiente removido é o resumo do problema: a régua antiga classifica
// uma planta com parede faltando como MAIS fiel que uma planta certa cujo piso
// escureceu. Ela mede escuridão e borda grossa, não estrutura.

import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { computeInkScore } from '@/lib/ai/fidelity/ink-score'
import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'
import { BASE, drawPlan } from './plan-fixtures'

describe('computeInkScore — planta baixa (traço fino)', () => {
  it('devolve null quando o original não tem traço (foto/render)', async () => {
    const flat = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 180, g: 170, b: 160 } },
    }).png().toBuffer()
    expect(await computeInkScore(flat, flat)).toBeNull()
  })

  it('humanização FIEL passa alto — mesmo com piso escuro', async () => {
    const original = await drawPlan(BASE)
    const claro  = await drawPlan({ ...BASE, humanize: true, floorTone: 225 })
    const escuro = await drawPlan({ ...BASE, humanize: true, floorTone: 70 })

    const a = await computeInkScore(original, claro)
    const b = await computeInkScore(original, escuro)

    expect(a!.score).toBeGreaterThan(0.9)
    // O caso que um limiar de cinza absoluto erraria: o piso escuro não muda o
    // score, porque o black-hat mede estrutura fina, não nível de cinza.
    expect(b!.score).toBeGreaterThan(0.9)
    expect(Math.abs(a!.score - b!.score)).toBeLessThan(0.05)
  })

  it('parede movida DERRUBA o score', async () => {
    const original = await drawPlan(BASE)
    const movida   = await drawPlan({ ...BASE, humanize: true, partitionX: 0.66 })
    const fiel     = await drawPlan({ ...BASE, humanize: true })

    const mov = await computeInkScore(original, movida)
    const ok  = await computeInkScore(original, fiel)

    // Margem folgada: a decisão de retry tem que ser inequívoca, não estatística.
    expect(ok!.score - mov!.score).toBeGreaterThan(0.4)
    expect(mov!.worstRegionRecall).toBeLessThan(0.2)
  })

  it('ambiente removido DERRUBA o score', async () => {
    const original = await drawPlan(BASE)
    const semSala  = await drawPlan({ ...BASE, humanize: true, hasPartitionY: false })
    const fiel     = await drawPlan({ ...BASE, humanize: true })

    const sem = await computeInkScore(original, semSala)
    const ok  = await computeInkScore(original, fiel)

    expect(ok!.score - sem!.score).toBeGreaterThan(0.3)
    // O recall GLOBAL mal se mexe (uma divisória é pouca tinta no total) — é o
    // componente local que pega. Se esta linha cair, o peso está errado.
    expect(sem!.lineRecall).toBeGreaterThan(0.9)
    expect(sem!.worstRegionRecall).toBeLessThan(0.5)
  })

  it('planta inteiramente redesenhada fica bem abaixo da fiel', async () => {
    const original = await drawPlan(BASE)
    const outra    = await drawPlan({
      ...BASE, humanize: true, partitionX: 0.38, partitionY: 0.68, doorY: 0.7,
    })
    const fiel     = await drawPlan({ ...BASE, humanize: true })

    const nova = await computeInkScore(original, outra)
    const ok   = await computeInkScore(original, fiel)

    expect(ok!.score - nova!.score).toBeGreaterThan(0.4)
  })
})

describe('computeGeometryScore no MESMO material — por que foi trocado', () => {
  it('não separa a planta fiel da planta com parede movida', async () => {
    const original = await drawPlan(BASE)
    const fiel     = await drawPlan({ ...BASE, humanize: true })
    const movida   = await drawPlan({ ...BASE, humanize: true, partitionX: 0.66 })

    const geoGap = (await computeGeometryScore(original, fiel)).score
                 - (await computeGeometryScore(original, movida)).score
    const inkGap = (await computeInkScore(original, fiel))!.score
                 - (await computeInkScore(original, movida))!.score

    // A régua de tinta abre uma distância MUITO maior entre o certo e o errado
    // do que a régua de bordas a 384 px. Se um dia isto falhar, é porque o
    // geometry score melhorou pra line art — aí reavaliar o portão.
    expect(inkGap).toBeGreaterThan(geoGap * 3)
  })

  it('classifica uma planta com ambiente REMOVIDO acima de uma planta correta', async () => {
    const original   = await drawPlan(BASE)
    const fielEscuro = await drawPlan({ ...BASE, humanize: true, floorTone: 70 })
    const semSala    = await drawPlan({ ...BASE, humanize: true, hasPartitionY: false })

    const geoFiel = (await computeGeometryScore(original, fielEscuro)).score
    const geoSem  = (await computeGeometryScore(original, semSala)).score
    const inkFiel = (await computeInkScore(original, fielEscuro))!.score
    const inkSem  = (await computeInkScore(original, semSala))!.score

    // O bug, fixado como teste: a régua antiga INVERTE o pódio.
    expect(geoSem).toBeGreaterThan(geoFiel)
    // A nova acerta a ordem.
    expect(inkFiel).toBeGreaterThan(inkSem)
  })
})
