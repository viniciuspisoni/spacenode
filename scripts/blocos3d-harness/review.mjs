#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'

const dir = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Uso: node scripts/blocos3d-harness/review.mjs <diretório-da-execução>')
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const objects = [...new Set(Object.keys(manifest).map(key => key.split('/')[0]))].sort()
const cards = []
for (const object of objects) {
  const referenceDir = join(dir, 'references', object)
  const sources = await readdir(referenceDir).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e))
  const sourceCards = sources.filter(f => /^(front|left|back|right)\.(jpe?g|png|webp)$/i.test(f))
    .map(file => `<figure><img src="references/${encodeURIComponent(object)}/${encodeURIComponent(file)}" alt="${esc(object)}: ${esc(file)}"><figcaption>Referência · ${esc(file)}</figcaption></figure>`).join('')
  const modelCards = ['h31', 'h31_direct', 'hunyuan', 'rodin'].map(model => {
    const row = manifest[`${object}/${model}`]
    if (!row) return ''
    const preview = row.preview ? `<img src="${encodeURIComponent(basename(row.preview))}" alt="Prévia ${esc(model)}">` : '<div class="blank">Prévia indisponível</div>'
    const analysis = row.analysis
    const details = row.status === 'completed' ?
      `${Number(row.triangles).toLocaleString('pt-BR')} triângulos · ${(row.bytes / 1024 / 1024).toFixed(1)} MB` +
      (analysis ? `<br>${esc(analysis.sizeMeters?.join(' × ') ?? '?')} m · ${analysis.pbrMaterials}/${analysis.materials} materiais PBR` : '') +
      (analysis?.flags?.length ? `<br>Verificar: ${esc(analysis.flags.join(', '))}` : '') : esc(row.status)
    const download = row.status === 'completed' && row.file ?
      `<a href="${encodeURIComponent(basename(row.file))}" download>Baixar GLB e conferir em cena</a>` : ''
    return `<figure>${preview}<figcaption>${esc(model)} · ${details}<br>${download}</figcaption></figure>`
  }).join('')
  cards.push(`<section><h2>${esc(object)}</h2><div class="grid">${sourceCards}${modelCards}</div></section>`)
}
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisão de Blocos 3D</title>
<style>body{background:#151618;color:#fff;font:15px system-ui,sans-serif;margin:0;padding:32px;line-height:1.5}main{max-width:1440px;margin:auto}h1{font-size:28px;font-weight:500}h2{font-size:19px;font-weight:500;margin:36px 0 16px}p,figcaption{color:#bdc2c8}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}figure{margin:0;background:#1c1d20;border:0.5px solid #53575e;border-radius:14px;overflow:hidden}img,.blank{width:100%;height:230px;object-fit:contain;background:#222;display:grid;place-items:center}figcaption{padding:12px;font-size:12px}a{color:#fff;text-underline-offset:3px}section{border-top:0.5px solid #53575e}</style>
<main><h1>Blocos 3D · revisão de arquitetura</h1><p>Compare referência e prévia, depois abra cada GLB no visualizador ou software de projeto e preencha scores.csv. A prévia única não verifica costas, topologia ou escala.</p>${cards.join('')}</main></html>`
const path = join(dir, 'review.html')
await writeFile(path, html)
console.log(path)
