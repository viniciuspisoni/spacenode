// Camada de texto: o que precisa sobreviver a um salvar/abrir.
//
// O raster do texto NÃO é persistido (um data URL de PNG no JSON do projeto
// seria enorme), então o que garante que a camada não some é o par
// spec-no-documento + saneamento tolerante. É isso que estes testes travam —
// a rasterização em si depende de canvas e vive no browser.

import { describe, expect, it } from 'vitest'
import { defaultTextSpec, sanitizeTextSpec } from '@/lib/finalizar/text-layer'
import { deserializeDocument, createDocument, newElementLayer } from '@/lib/finalizar/composition'

describe('sanitizeTextSpec', () => {
  it('devolve null para o que não é camada de texto', () => {
    expect(sanitizeTextSpec(null)).toBeNull()
    expect(sanitizeTextSpec(undefined)).toBeNull()
    expect(sanitizeTextSpec({})).toBeNull()
    expect(sanitizeTextSpec('Texto')).toBeNull()
  })

  it('preenche o que falta com o padrão', () => {
    const s = sanitizeTextSpec({ content: 'Sala de estar' })
    expect(s).not.toBeNull()
    expect(s!.content).toBe('Sala de estar')
    expect(s!.font).toBe('sans')
    expect(s!.weight).toBe(400)
    expect(s!.color).toBe('#ffffff')
    expect(s!.align).toBe('left')
  })

  it('recusa fonte e cor que não existem', () => {
    const s = sanitizeTextSpec({ content: 'x', font: 'comic-sans', color: 'red' })!
    expect(s.font).toBe('sans')
    expect(s.color).toBe('#ffffff')
  })

  it('prende os números na faixa', () => {
    const s = sanitizeTextSpec({ content: 'x', size: 99, lineHeight: -4, tracking: 50 })!
    expect(s.size).toBeLessThanOrEqual(1)
    expect(s.lineHeight).toBeGreaterThanOrEqual(0.7)
    expect(s.tracking).toBeLessThanOrEqual(1)
  })

  it('corta conteúdo absurdo em vez de guardar', () => {
    const s = sanitizeTextSpec({ content: 'a'.repeat(5000) })!
    expect(s.content.length).toBe(2000)
  })
})

describe('camada de texto no documento', () => {
  const comTexto = () => {
    const doc = createDocument('https://exemplo/base.png', 1200, 800)
    doc.elements = [{
      ...newElementLayer({ url: '', name: 'Texto', category: 'texto', width: 0.3 }),
      text: defaultTextSpec(),
    }]
    return doc
  }

  it('sobrevive ao round-trip SEM url — que é como ela é salva', () => {
    const back = deserializeDocument(JSON.parse(JSON.stringify(comTexto())))
    expect(back).not.toBeNull()
    // A regressão que isto trava: o saneamento descartava todo elemento sem
    // url, o que apagaria toda camada de texto de todo projeto salvo.
    expect(back!.elements).toHaveLength(1)
    expect(back!.elements[0].text?.content).toBe('Texto')
    expect(back!.elements[0].category).toBe('texto')
  })

  it('não persiste o raster: data URL entra e sai vazio', () => {
    const doc = comTexto()
    doc.elements[0].url = 'data:image/png;base64,iVBORw0KGgo='
    const back = deserializeDocument(JSON.parse(JSON.stringify(doc)))!
    expect(back.elements[0].url).toBe('')
    expect(back.elements[0].text).not.toBeNull()
  })

  it('elemento de imagem SEM url continua sendo descartado', () => {
    const doc = createDocument('https://exemplo/base.png', 1200, 800)
    doc.elements = [newElementLayer({ url: '', name: 'Quebrado' })]
    const back = deserializeDocument(JSON.parse(JSON.stringify(doc)))!
    expect(back.elements).toHaveLength(0)
  })

  it('documento novo não tem camada de texto', () => {
    const doc = createDocument('https://exemplo/base.png', 100, 100)
    expect(doc.elements).toHaveLength(0)
  })
})

describe('curvas por canal', () => {
  it('nascem em identidade e voltam do round-trip', () => {
    const doc = createDocument('https://exemplo/base.png', 800, 600)
    for (const c of [doc.curveR, doc.curveG, doc.curveB]) {
      expect(c).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    }
    doc.curveR = [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }]
    const back = deserializeDocument(JSON.parse(JSON.stringify(doc)))!
    expect(back.curveR).toHaveLength(3)
    expect(back.curveR[1].y).toBeCloseTo(0.7, 5)
    expect(back.curveG).toHaveLength(2)
  })

  it('documento antigo, sem as curvas de canal, abre em identidade', () => {
    const doc = createDocument('https://exemplo/base.png', 800, 600) as unknown as Record<string, unknown>
    delete doc.curveR; delete doc.curveG; delete doc.curveB
    const back = deserializeDocument(JSON.parse(JSON.stringify(doc)))!
    expect(back.curveR).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    expect(back.curveB).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  })
})

describe('neblina e glow', () => {
  it('nascem zerados e aceitam a faixa', () => {
    const doc = createDocument('https://exemplo/base.png', 800, 600)
    expect(doc.adjust.dehaze).toBe(0)
    expect(doc.adjust.glow).toBe(0)
  })

  it('documento antigo abre com os dois em zero — nunca NaN', () => {
    const doc = createDocument('https://exemplo/base.png', 800, 600)
    const raw = JSON.parse(JSON.stringify(doc))
    delete raw.adjust.dehaze
    delete raw.adjust.glow
    const back = deserializeDocument(raw)!
    // NaN aqui viraria uniform NaN no shader e o efeito sairia mudo, sem erro
    // nenhum na tela — o modo de falha mais caro de diagnosticar que existe.
    expect(Number.isNaN(back.adjust.dehaze)).toBe(false)
    expect(back.adjust.dehaze).toBe(0)
    expect(back.adjust.glow).toBe(0)
  })

  it('prende a faixa', () => {
    const doc = createDocument('https://exemplo/base.png', 800, 600)
    const raw = JSON.parse(JSON.stringify(doc))
    raw.adjust.dehaze = 500
    raw.adjust.glow = -80
    const back = deserializeDocument(raw)!
    expect(back.adjust.dehaze).toBe(100)
    expect(back.adjust.glow).toBe(0)
  })
})
