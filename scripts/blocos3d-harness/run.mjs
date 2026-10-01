#!/usr/bin/env node
// Benchmark de blocos de arquitetura. Sem --execute, faz apenas o plano.
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { analyzeGlb } from './analyze.mjs'

const root = resolve(import.meta.dirname)
const args = process.argv.slice(2)
const value = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback
const execute = args.includes('--execute')
const fixtures = resolve(value('fixtures', join(root, 'objects')))
const output = resolve(value('out', join(root, 'runs', new Date().toISOString().replaceAll(':', '-'))))
const maxUsd = Number(value('max-usd', '0'))
const selected = value('models', 'h31,hunyuan,rodin').split(',')
const views = ['front', 'left', 'back', 'right']
const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

const models = {
  h31: {
    endpoint: n => n > 1 ? 'tripo3d/h3.1/multiview-to-3d' : 'tripo3d/h3.1/image-to-3d',
    price: () => 0.40,
    input: urls => ({ ...(urls.length > 1 ? { image_urls: urls } : { image_url: urls[0] }),
      texture: true, pbr: true, texture_quality: 'detailed', geometry_quality: 'standard',
      texture_alignment: 'original_image', auto_size: true }),
    glb: data => data.model_urls?.pbr_model?.url ?? data.model_urls?.glb?.url,
    preview: data => data.rendered_image?.url,
  },
  hunyuan: {
    endpoint: () => 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d',
    price: n => n > 1 ? 0.675 : 0.525,
    input: urls => ({ input_image_url: urls[0],
      ...(urls[1] ? { left_image_url: urls[1] } : {}),
      ...(urls[2] ? { back_image_url: urls[2] } : {}),
      ...(urls[3] ? { right_image_url: urls[3] } : {}),
      generate_type: 'Normal', enable_pbr: true }),
    glb: data => data.model_urls?.glb?.url ?? data.model_glb?.url,
    preview: data => data.thumbnail?.url,
  },
  rodin: {
    endpoint: () => 'fal-ai/hyper3d/rodin/v2.5',
    price: () => 0.40,
    input: urls => ({ image_urls: urls, tier: 'Gen-2.5-High',
      geometry_file_format: 'glb', material: 'PBR' }),
    glb: data => data.model_mesh?.url ?? data.model_meshes?.find(f => f.url?.endsWith('.glb'))?.url,
    preview: data => data.preview_image?.url ?? data.rendered_image?.url,
  },
}

for (const name of selected) if (!models[name]) throw new Error(`Motor desconhecido: ${name}`)
if (!Number.isFinite(maxUsd) || maxUsd < 0) throw new Error('--max-usd deve ser positivo')

async function objects() {
  const dirs = await readdir(fixtures, { withFileTypes: true }).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e))
  const found = []
  for (const dir of dirs.filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[a-z0-9-]+$/.test(dir.name)) throw new Error(`${dir.name}: use um slug minúsculo com letras, números e hífens`)
    const folder = join(fixtures, dir.name)
    const filenames = await readdir(folder)
    const files = []
    for (const pos of views) {
      const candidates = filenames.filter(f => basename(f, extname(f)) === pos && mime[extname(f).toLowerCase()])
      if (candidates.length > 1) throw new Error(`${dir.name}: duas fotos para ${pos}`)
      if (candidates.length) files.push(join(folder, candidates[0]))
      else if (files.length && filenames.some(f => views.slice(views.indexOf(pos) + 1).includes(basename(f, extname(f))))) {
        throw new Error(`${dir.name}: faltou ${pos}; vistas devem ser contíguas`)
      }
    }
    if (!files.length) throw new Error(`${dir.name}: faltou front.jpg/png/webp`)
    for (const file of files) {
      const bytes = await readFile(file)
      const meta = await sharp(bytes).metadata()
      if (Math.min(meta.width ?? 0, meta.height ?? 0) < 512 || bytes.length > 8 * 1024 * 1024) {
        throw new Error(`${file}: mínimo 512 px por lado; máximo 8 MB para comparar os três motores`)
      }
    }
    found.push({ name: dir.name, files })
  }
  return found
}

function inspect(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB inválido')
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  const triangles = (json.meshes ?? []).flatMap(m => m.primitives ?? []).reduce((sum, p) =>
    sum + Math.floor((json.accessors?.[p.indices ?? p.attributes?.POSITION]?.count ?? 0) / 3), 0)
  return { bytes: bytes.length, triangles, textures: json.textures?.length ?? 0 }
}

async function main() {
  const samples = await objects()
  const tasks = samples.flatMap(object => selected.map(name => ({
    id: `${object.name}/${name}`, object: object.name, name, files: object.files,
    endpoint: models[name].endpoint(object.files.length), estimatedUsd: models[name].price(object.files.length),
  })))
  const total = tasks.reduce((n, task) => n + task.estimatedUsd, 0)
  console.log(JSON.stringify({ fixtures, objects: samples.length, fourViews: samples.filter(x => x.files.length === 4).length,
    tasks: tasks.length, estimatedUsd: Number(total.toFixed(3)), maxUsd, plan: tasks.map(t =>
      ({ id: t.id, views: t.files.length, endpoint: t.endpoint, usd: t.estimatedUsd })) }, null, 2))
  if (!execute) return
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY não configurada')
  if (!tasks.length || !maxUsd || total > maxUsd + 1e-9) throw new Error('Plano vazio ou acima do teto --max-usd')
  fal.config({ credentials: process.env.FAL_KEY })
  await mkdir(output, { recursive: true })
  for (const object of samples) {
    const referenceDir = join(output, 'references', object.name)
    await mkdir(referenceDir, { recursive: true })
    await Promise.all(object.files.map(file => copyFile(file, join(referenceDir, basename(file)))))
  }
  const manifestPath = join(output, 'manifest.json')
  const prior = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(e => e.code === 'ENOENT' ? {} : Promise.reject(e))
  const manifest = { ...prior }
  const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const uploaded = new Map()
  for (const task of tasks) {
    const prev = manifest[task.id]
    if (prev && prev.endpoint !== task.endpoint) throw new Error(`${task.id}: endpoint mudou; use outro --out`)
    if (prev?.status === 'completed' || prev?.status === 'failed') continue
    // Um request_id já gravado é retomado; nenhum job é enviado duas vezes.
    if (!prev?.requestId) {
      const urls = []
      for (const file of task.files) {
        if (!uploaded.has(file)) {
          const data = await readFile(file)
          uploaded.set(file, await fal.storage.upload(new File([data], basename(file), { type: mime[extname(file).toLowerCase()] })))
        }
        urls.push(uploaded.get(file))
      }
      const submitted = await fal.queue.submit(task.endpoint, { input: models[task.name].input(urls) })
      manifest[task.id] = { endpoint: task.endpoint, requestId: submitted.request_id,
        estimatedUsd: task.estimatedUsd, views: task.files.length,
        status: 'submitted', submittedAt: new Date().toISOString() }
      await save()
    }
    const row = manifest[task.id]
    const started = Date.now()
    try {
      while (true) {
        const status = await fal.queue.status(task.endpoint, { requestId: row.requestId, logs: false })
        if (status.status === 'COMPLETED') break
        if (Date.now() - started > 30 * 60_000) throw new Error('Timeout: retome com o mesmo --out')
        await new Promise(done => setTimeout(done, 5000))
      }
      const result = (await fal.queue.result(task.endpoint, { requestId: row.requestId })).data
      const url = models[task.name].glb(result)
      if (!url) throw new Error('Resposta sem URL de GLB')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Download GLB: HTTP ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      const metadata = inspect(bytes)
      const file = join(output, `${task.object}--${task.name}.glb`)
      await writeFile(file, bytes)
      let analysis = null
      try { analysis = await analyzeGlb(file) }
      catch (error) { console.warn(task.id, 'análise técnica indisponível:', String(error)) }
      let preview = null
      const previewUrl = models[task.name].preview(result)
      if (previewUrl) {
        try {
          const previewResult = await fetch(previewUrl)
          if (previewResult.ok) {
            const raw = Buffer.from(await previewResult.arrayBuffer())
            if (raw.byteLength <= 10 * 1024 * 1024) {
              preview = `${task.object}--${task.name}.png`
              await writeFile(join(output, preview), await sharp(raw).resize(800, 800, { fit: 'inside' }).png().toBuffer())
            }
          }
        } catch (error) { console.warn(task.id, 'prévia indisponível:', String(error)) }
      }
      manifest[task.id] = { ...row, status: 'completed', file, ...metadata,
        analysis, preview,
        durationMs: Date.now() - new Date(row.submittedAt).getTime(), completedAt: new Date().toISOString() }
    } catch (e) {
      // Preserve o request_id: uma falha de download pode ser retomada sem custo novo.
      manifest[task.id] = { ...row, status: 'retryable', error: String(e) }
    }
    await save()
    console.log(task.id, manifest[task.id].status, manifest[task.id].error ?? '')
  }
  const scoresPath = join(output, 'scores.csv')
  const existing = await readFile(scoresPath, 'utf8').catch(e => e.code === 'ENOENT' ?
    'object,model,fidelity,materials,geometry,scene\n' : Promise.reject(e))
  const seen = new Set(existing.trim().split(/\r?\n/).slice(1).map(line => line.split(',').slice(0, 2).join('/')))
  const missing = tasks.filter(t => manifest[t.id]?.status === 'completed' && !seen.has(t.id))
  await writeFile(scoresPath, existing.replace(/\s*$/, '\n') + missing.map(t => `${t.object},${t.name},,,,\n`).join(''))
  console.log(`Resultados: ${manifestPath}`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
