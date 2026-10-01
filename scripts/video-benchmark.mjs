// Benchmark cego: 12 cenas próprias do repositório × Veo Lite / Veo completo.
// Sem --run apenas confere imagens e calcula o teto de inferência.
// Com --run exige FAL_KEY e grava vídeos + mapa cego em benchmark-output/ (gitignored).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import sharp from 'sharp'
import { fal } from '@fal-ai/client'

const root = process.cwd()
const output = path.join(root, 'benchmark-output', 'animar-2026-10')
const scenes = [
  ['casa', 'marketing/renders/depois/casa.jpg'],
  ['comercial', 'marketing/renders/depois/comercial.jpg'],
  ['coworking', 'marketing/renders/depois/coworking.jpg'],
  ['industrial', 'marketing/renders/depois/industrial.jpg'],
  ['banheiro', 'marketing/renders/depois/banheiro.jpg'],
  ['cozinha-ceramica', 'public/proj-cozinha-ceramica-render.jpg'],
  ['cozinha-ilha', 'public/proj-cozinha-ilha-render.jpg'],
  ['entrada-corredor', 'public/proj-entrada-corredor-render.jpg'],
  ['home-office', 'public/proj-home-office-render.jpg'],
  ['living-estante', 'public/proj-living-estante-render.jpg'],
  ['sala-estar', 'public/proj-sala-estar-render.jpg'],
  ['sala-jantar', 'public/proj-sala-jantar-render.jpg'],
]
const models = [
  { code: 'lite', endpoint: 'fal-ai/veo3.1/lite/image-to-video', usdPerSecond: 0.05 },
  { code: 'full', endpoint: 'fal-ai/veo3.1/image-to-video', usdPerSecond: 0.20 },
]
const prompt = 'Subtle slow camera dolly through the exact architectural scene. Preserve geometry, proportions, window and door positions, materials, furniture and lighting. No people, no structural changes, no added objects. Stable straight lines, physically plausible motion.'
const run = process.argv.includes('--run')

async function exists(file) {
  try { await access(file); return true } catch { return false }
}

async function imageBytes(file) {
  const input = await readFile(path.join(root, file))
  const meta = await sharp(input).metadata()
  if (!meta.width || !meta.height) throw new Error(`Dimensões inválidas: ${file}`)
  const width = Math.min(meta.width, Math.floor(meta.height * 2.49))
  // Mesmo recorte e resize para todos os motores; panoramas extremos perdem
  // somente as bordas necessárias para ficar dentro do limite de proporção.
  return sharp(input).extract({ left: Math.floor((meta.width - width) / 2), top: 0, width, height: meta.height })
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer()
}

async function main() {
  for (const [, file] of scenes) await imageBytes(file)
  const ceiling = scenes.length * 8 * models.reduce((sum, model) => sum + model.usdPerSecond, 0)
  console.log(`${scenes.length} cenas, ${models.length} motores, 8 s, 1080p sem áudio; inferência estimada: US$ ${ceiling.toFixed(2)}.`)
  if (!run) return
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY ausente; nenhum job foi enviado')
  fal.config({ credentials: process.env.FAL_KEY })
  await mkdir(output, { recursive: true })
  const mappingFile = path.join(output, 'mapping.json')
  let jobs
  if (await exists(mappingFile)) {
    jobs = JSON.parse(await readFile(mappingFile, 'utf8')).jobs
    if (jobs.length !== scenes.length * models.length) throw new Error('Mapa anterior incompatível')
  } else {
    jobs = scenes.flatMap(([scene, file]) => models.map(model => ({
      scene, file, model: model.code, endpoint: model.endpoint, alias: randomUUID().slice(0, 12),
    })))
    await writeFile(mappingFile, JSON.stringify({ prompt, jobs }, null, 2))
    await writeFile(path.join(output, 'ratings.csv'), 'alias,geometria,materiais,movimento,artefatos,observacoes\n' +
      jobs.map(j => `${j.alias},,,,,`).join('\n') + '\n')
  }
  for (const [scene, file] of scenes) {
    const pending = []
    for (const job of jobs.filter(j => j.scene === scene)) {
      if (!await exists(path.join(output, `${job.alias}.mp4`))) pending.push(job)
    }
    if (!pending.length) continue
    const bytes = await imageBytes(file)
    const imageUrl = await fal.storage.upload(new File([bytes], `${scene}.jpg`, { type: 'image/jpeg' }))
    for (const job of pending) {
      console.log(`Gerando ${job.alias} (${scene})`)
      const result = await fal.subscribe(job.endpoint, { input: {
        image_url: imageUrl, prompt, duration: '8s', resolution: '1080p',
        aspect_ratio: 'auto', generate_audio: false,
      } })
      const videoUrl = result.data?.video?.url
      if (typeof videoUrl !== 'string') throw new Error(`Resposta sem vídeo: ${job.alias}`)
      const response = await fetch(videoUrl)
      if (!response.ok) throw new Error(`Download falhou: ${job.alias} (${response.status})`)
      await writeFile(path.join(output, `${job.alias}.mp4`), Buffer.from(await response.arrayBuffer()))
    }
  }
  console.log(`Vídeos e ficha cega em ${output}`)
}

await main()
