#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const dir = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Uso: node scripts/blocos3d-harness/report.mjs <diretório-da-execução>')
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const scoreRows = (await readFile(join(dir, 'scores.csv'), 'utf8')).trim().split(/\r?\n/).slice(1)
const scores = new Map(scoreRows.map(row => {
  const [object, model, ...numbers] = row.split(',')
  return [`${object}/${model}`, numbers.map(Number)]
}))
const names = ['h31', 'hunyuan', 'rodin']
const rows = names.map(name => {
  const tasks = Object.entries(manifest).filter(([key]) => key.endsWith(`/${name}`))
  const completed = tasks.filter(([, row]) => row.status === 'completed')
  const graded = completed.map(([key]) => scores.get(key))
    .filter(values => values?.length === 4 && values.every(v => Number.isInteger(v) && v >= 1 && v <= 5))
  const average = idx => graded.length ? graded.reduce((n, score) => n + score[idx], 0) / graded.length : 0
  const cost = tasks.reduce((n, [, row]) => n + (row.estimatedUsd ?? 0), 0)
  const perDelivered = completed.length ? cost / completed.length : 0
  const nodesAt = target => completed.length ? Math.ceil(((perDelivered * 6 * 1.12) + 0.05) /
    ((1 - target) * 0.0729) / 5) * 5 : null
  return {
    model: name, jobs: tasks.length, completed: completed.length, scored: graded.length,
    fourViews: tasks.filter(([, row]) => row.views === 4).length,
    fidelity: average(0), materials: average(1), geometry: average(2), scene: average(3),
    weighted: average(0) * 0.4 + average(1) * 0.25 + average(2) * 0.2 + average(3) * 0.15,
    estimatedUsd: cost, nodes75: nodesAt(0.75), nodes80: nodesAt(0.80),
  }
}).filter(row => row.jobs).sort((a, b) => b.weighted - a.weighted)

console.log('| Motor | Entregues | Notas | Fidelidade | Materiais | Geometria | Cena | Média ponderada | Nodes 75% | Nodes 80% |')
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
for (const row of rows) console.log(`| ${row.model} | ${row.completed}/${row.jobs} | ${row.scored} | ${row.fidelity.toFixed(2)} | ${row.materials.toFixed(2)} | ${row.geometry.toFixed(2)} | ${row.scene.toFixed(2)} | ${row.weighted.toFixed(2)} | ${row.nodes75 ?? '—'} | ${row.nodes80 ?? '—'} |`)
console.log('\nCusto em nodes: estimativa com câmbio de proteção R$6/US$, reserva adicional de 12%, R$0,05 de storage e piso legado R$0,0729/node. O custo real exige conciliação com a fatura fal.')
const samples = Math.max(...rows.map(row => row.jobs), 0)
const fourViews = Math.max(...rows.map(row => row.fourViews), 0)
if (samples < 10 || fourViews < 4 || rows.some(row => row.scored < 10)) {
  console.log(`Benchmark inconclusivo: ${samples} objetos, ${fourViews} com quatro vistas; são necessários 10 objetos avaliados por motor e quatro com quatro vistas.`)
}
