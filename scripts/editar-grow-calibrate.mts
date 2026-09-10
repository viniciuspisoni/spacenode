// scripts/editar-grow-calibrate.mts
//
// Calibra o "Expandir p/ o material" contra imagens REAIS.
//
// O crescimento parte de MUITOS pontos ao mesmo tempo (todos os pixels
// marcados), e não de um. Isso muda o comportamento em relação ao clique: cada
// ponto de partida é uma chance a mais de o preenchimento achar uma ponte entre
// dois materiais, então a mesma tolerância que se comporta num clique pode
// vazar aqui. A tabela abaixo mede exatamente essa diferença.
//
// Como ler: para cada marcação simulada (um retângulo de pincel sobre um
// material), a linha mostra a cobertura da imagem em cada tolerância. Ao lado
// vai a mesma medida para um CLIQUE no mesmo ponto — é a comparação que
// interessa, porque diz se crescer a partir de muitos pontos se comporta
// diferente de crescer a partir de um.
//
// O que a rodada de 10/09 mostrou, no render onde o caso real falhou:
//
//   marcação               |   t=9 |  t=11 |  t=14 |  t=18
//   apoio de pés (couro)   |  0.4% |  0.4% |  4.2% | 12.7%
//   poltrona (couro)       |  2.3% |  2.6% | 27.4% | 33.8%
//   carpete                |  7.1% | 16.8% | 33.3% | 46.7%
//   marcenaria clara       |  0.0% |  0.0% | 29.3% | 40.0%
//
//   1. crescer ≈ clicar: as duas colunas batem em quase toda a grade, então
//      partir de muitos pontos NÃO torna o vazamento mais provável;
//   2. não existe tolerância certa: o couro só vira "a peça" em 14, e em 14 o
//      carpete já tomou um terço da cena. Por isso a tolerância é um controle
//      na tela, e o botão é instantâneo e grátis — a pessoa itera.
//
// A imagem do caso não está no repositório (é um render de cliente). Aponte
// `arquivo` para qualquer render seu; o script pula os que não existirem.
//
// Uso:  npx tsx scripts/editar-grow-calibrate.mts

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {
  buildColorIndex,
  growSelectionToMaterial,
  magicWandSelect,
  selectionCoverage,
  type ColorIndex,
} from '../lib/selection/magic-wand'

interface Marcacao {
  nome: string
  /** Centro da pincelada, em fração da imagem. */
  x: number
  y: number
  /** Raio da pincelada, em fração do lado maior. */
  r: number
}

interface Caso {
  arquivo: string
  marcacoes: Marcacao[]
}

const CASOS: Caso[] = [
  {
    // O render do escritório onde o teste real falhou (10/09): poltrona de
    // couro com apoio de pés, carpete cinza, marcenaria clara, vidro.
    arquivo: '.tmp-cal/office.png',
    marcacoes: [
      { nome: 'apoio de pés (couro)', x: 0.672, y: 0.855, r: 0.004 },
      { nome: 'poltrona (couro)', x: 0.700, y: 0.655, r: 0.004 },
      { nome: 'carpete', x: 0.30, y: 0.86, r: 0.004 },
      { nome: 'marcenaria clara', x: 0.42, y: 0.30, r: 0.004 },
      { nome: 'céu / vidro', x: 0.90, y: 0.20, r: 0.004 },
    ],
  },
]

const TOLERANCIAS = [3, 5, 7, 9, 11, 14, 18]
const LADO = 2304

/** Pincelada quadrada, como a que o usuário faz. */
function marcar(index: ColorIndex, m: Marcacao): Uint8Array {
  const mask = new Uint8Array(index.width * index.height)
  const raio = Math.max(2, Math.round(m.r * Math.max(index.width, index.height)))
  const cx = Math.round(m.x * index.width)
  const cy = Math.round(m.y * index.height)
  for (let y = Math.max(0, cy - raio); y <= Math.min(index.height - 1, cy + raio); y++) {
    for (let x = Math.max(0, cx - raio); x <= Math.min(index.width - 1, cx + raio); x++) {
      mask[y * index.width + x] = 255
    }
  }
  return mask
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6)

for (const caso of CASOS) {
  const file = path.resolve(process.cwd(), caso.arquivo)
  if (!fs.existsSync(file)) {
    console.log(`
(pulando ${caso.arquivo} — arquivo não encontrado)`)
    continue
  }
  const img = sharp(file)
  const meta = await img.metadata()
  const k = Math.min(1, LADO / Math.max(meta.width ?? 1, meta.height ?? 1))
  const w = Math.max(2, Math.round((meta.width ?? 1) * k))
  const h = Math.max(2, Math.round((meta.height ?? 1) * k))
  const { data } = await img.resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const index = buildColorIndex(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w, h)

  console.log(`\n=== ${caso.arquivo}  (${w}x${h}) ===`)
  console.log(['marcação'.padEnd(22), 'marcado', ...TOLERANCIAS.map(t => `t=${t}`.padStart(6))].join(' | '))

  for (const m of caso.marcacoes) {
    const mask = marcar(index, m)
    const covMarc = selectionCoverage(mask)
    const linha = TOLERANCIAS.map((tolerance) => {
      const out = growSelectionToMaterial(index, mask, { tolerance, contiguous: true, sampleRadius: 4 })
      return pct(selectionCoverage(out))
    })
    console.log([m.nome.padEnd(22), pct(covMarc), ...linha].join(' | '))
  }

  // Comparação: o MESMO ponto, no clique de uma varinha só.
  console.log('\n-- clique único (varinha), mesmo ponto --')
  for (const m of caso.marcacoes) {
    const linha = TOLERANCIAS.map((tolerance) => {
      const out = magicWandSelect(index, m.x * w, m.y * h, { tolerance, contiguous: true, sampleRadius: 4 })
      return pct(selectionCoverage(out))
    })
    console.log([m.nome.padEnd(22), '      ', ...linha].join(' | '))
  }
}
