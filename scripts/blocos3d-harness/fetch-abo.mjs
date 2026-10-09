#!/usr/bin/env node
// Baixa um conjunto fixo de referências reais do Amazon Berkeley Objects (CC BY 4.0).
// Não gera modelos e não faz chamadas pagas.
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const BASE = 'https://amazon-berkeley-objects.s3.amazonaws.com'
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ??
  fileURLToPath(new URL('./objects/', import.meta.url)))
const selected = [
  ['sofa-veludo', '02449ddc', true],
  ['poltrona-curva', 'f8022078', true],
  ['mesa-lateral', '679b10f7', true],
  ['banqueta', 'becf9a78', true],
  ['mesa-escritorio', '1bdc0922', false],
  ['luminaria-mesa', 'e6fc4d94', false],
  ['pendente-vidro', '7938c7a9', false],
  ['vaso-ceramica', '8e44c8b9', false],
  ['cachepot-textura', '45f8623c', false],
  ['estante', '95ce334f', false],
  ['buffet-madeira', 'e99ace86', false],
  ['cama-estofada', '3e50d60d', false],
]
const spinIds = new Set(selected.map(([, id]) => id))
const cache = resolve(process.argv.find(arg => arg.startsWith('--cache='))?.slice(8) ?? join(out, '.abo-cache'))

async function download(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`)
  const partial = `${path}.partial`
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    await rename(partial, path)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

async function cached(relative) {
  await mkdir(cache, { recursive: true })
  const path = join(cache, relative.split('/').at(-1))
  try { await stat(path) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    await download(`${BASE}/${relative}`, path)
  }
  return path
}

async function * gzipLines(path) {
  const stream = (await import('node:fs')).createReadStream(path).pipe(createGunzip())
  yield * createInterface({ input: stream, crlfDelay: Infinity })
}

const spins = new Map()
for await (const line of gzipLines(await cached('spins/metadata/spins.csv.gz'))) {
  const [id, azimuth, , height, width, path] = line.split(',')
  if (spinIds.has(id) && ['9', '27', '45', '63'].includes(azimuth) &&
      Math.min(Number(height), Number(width)) >= 512) {
    if (!spins.has(id)) spins.set(id, new Map())
    spins.get(id).set(Number(azimuth), path)
  }
}

const listings = new Map()
for await (const line of gzipLines(await cached('listings/metadata/listings_0.json.gz'))) {
  const data = JSON.parse(line)
  if (spinIds.has(data.spin_id) && !listings.has(data.spin_id)) listings.set(data.spin_id, data)
}

await mkdir(out, { recursive: true })
const license = join(out, 'LICENSE-CC-BY-4.0.txt')
try { await readFile(license) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  await download(`${BASE}/LICENSE-CC-BY-4.0.txt`, license)
}

for (const [slug, id, multiview] of selected) {
  const record = spins.get(id)
  // A série gira em incrementos de 5°. 9/63/45/27 são os eixos
  // frente/esquerda/trás/direita da orientação de catálogo.
  const angles = multiview ? [9, 63, 45, 27] : [9]
  if (angles.some(angle => !record?.get(angle))) throw new Error(`${slug}: vista ausente ou menor que 512 px`)
  const dir = join(out, slug)
  await mkdir(dir, { recursive: true })
  const previous = await readFile(join(dir, 'meta.json'), 'utf8').then(JSON.parse)
    .catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))
  const files = {}
  await Promise.all(angles.map(async (angle, index) => {
    const name = ['front', 'left', 'back', 'right'][index] + '.jpg'
    const relative = record.get(angle)
    const path = join(dir, name)
    const source = `${BASE}/spins/original/${relative}`
    const exists = await stat(path).then(() => true).catch(error => error.code === 'ENOENT' ? false : Promise.reject(error))
    if (!exists || previous?.files?.[name] !== source) await download(source, path)
    files[name] = source
  }))
  const name = listings.get(id)?.item_name?.find(item => item.language_tag === 'en_US')?.value ?? slug
  await writeFile(join(dir, 'meta.json'), JSON.stringify({
    name, spinId: id, source: `${BASE}/index.html`, license: 'CC BY 4.0',
    credit: 'Amazon.com (data); Amazon Berkeley Objects team (dataset), see source', files,
    note: 'Fotografias de catálogo 360°. Frente no quadro 9; laterais nos 63 e 27; traseira no 45. Conferir visualmente antes do benchmark.',
  }, null, 2) + '\n')
  console.log(`${slug}: ${angles.length} vista(s)`)
}
await writeFile(join(out, 'README.md'), `# Referências ABO · Blocos 3D\n\n` +
  `12 produtos de mobiliário e decoração (24 fotografias; 4 conjuntos de quatro vistas).\n` +
  `Fonte: ${BASE}/index.html. Fotos: Amazon.com. Dataset: equipe Amazon Berkeley Objects.\n` +
  `Licença: CC BY 4.0, texto em LICENSE-CC-BY-4.0.txt; URLs exatas em cada meta.json.\n\n` +
  `As imagens foram selecionadas de uma série de fotografia de catálogo 360°.\n` +
  `Conferir os ângulos e a adequação visual antes de pagar por gerações.\n` +
  `Este conjunto mede qualidade em objetos isolados de catálogo; acrescente fotos\n` +
  `próprias de arquitetura e uma importação em cena antes do lançamento.\n`)
console.log(`Fotos prontas em ${out}. Revise as imagens antes de --execute.`)
