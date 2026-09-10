// scripts/edit-v4-wand-calibrate.mts
//
// Calibra a varinha mágica do Editar V4 contra imagens REAIS, em vez de contra
// intuição. Roda a seleção em cada semente para uma grade de (tolerância × peso
// da luminância) e imprime a cobertura resultante.
//
// Como ler a tabela. Existem duas maneiras de a ferramenta ser inútil, e elas
// puxam para lados opostos:
//   - cobertura ALTA e igual em sementes de materiais diferentes = o
//     preenchimento vazou pelos degradês e pegou a cena inteira;
//   - cobertura perto de zero = a tolerância não vence nem a variação natural
//     do próprio material, e o usuário volta para o pincel.
// O ajuste bom é o maior valor em que sementes de materiais diferentes ainda
// devolvem áreas DIFERENTES e plausíveis.
//
// Uso:  npx tsx scripts/edit-v4-wand-calibrate.mts

import path from 'node:path'
import sharp from 'sharp'
import {
  buildColorIndex,
  magicWandSelect,
  selectionCoverage,
} from '../lib/selection/magic-wand'

interface Caso {
  arquivo: string
  /** Sementes em fração da imagem (0–1), com o nome do material esperado. */
  sementes: { nome: string; x: number; y: number }[]
}

const CASOS: Caso[] = [
  {
    arquivo: 'public/demo-render.jpg',
    sementes: [
      { nome: 'interior envidraçado', x: 0.45, y: 0.53 },
      { nome: 'laje de concreto', x: 0.35, y: 0.30 },
      { nome: 'gramado', x: 0.25, y: 0.92 },
      { nome: 'céu', x: 0.72, y: 0.08 },
    ],
  },
  {
    arquivo: 'public/gallery-living-after.jpg',
    sementes: [
      { nome: 'piso de madeira', x: 0.18, y: 0.88 },
      { nome: 'parede terracota', x: 0.88, y: 0.30 },
      { nome: 'sofá claro', x: 0.20, y: 0.72 },
    ],
  },
]

const TOLERANCIAS = [8, 11, 14, 18, 22]
const PESOS_LUMA = [0.12, 0.2, 0.35]

for (const caso of CASOS) {
  const file = path.resolve(process.cwd(), caso.arquivo)
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const index = buildColorIndex(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
  )

  console.log(`\n═══ ${caso.arquivo} — ${info.width}×${info.height} ═══`)
  for (const lumaWeight of PESOS_LUMA) {
    console.log(`\n  peso da luminância = ${lumaWeight}`)
    const header = ['tolerância'.padEnd(11), ...caso.sementes.map(s => s.nome.padStart(22))].join('')
    console.log('  ' + header)
    for (const tolerance of TOLERANCIAS) {
      const cols = caso.sementes.map(s => {
        const mask = magicWandSelect(
          index,
          Math.round(s.x * info.width),
          Math.round(s.y * info.height),
          { tolerance, contiguous: true, sampleRadius: 2, lumaWeight },
        )
        return `${(selectionCoverage(mask) * 100).toFixed(1)}%`.padStart(22)
      })
      console.log('  ' + String(tolerance).padEnd(11) + cols.join(''))
    }
  }
}
