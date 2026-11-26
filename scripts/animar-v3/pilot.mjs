import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { buildProviderRequest, calculateEconomics, DIRECTION_VERSION, PROFILES } from '../../lib/video/direction-v3.mjs'
import { PILOT_PROFILES, SCENES } from './fixtures.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const queueHost = 'https://queue.fal.run'
const reviewCriteria = ['watchedFullClip', 'comparedReference', 'geometry', 'materials', 'camera', 'singleTake', 'lightAndReflections']
const maxVideoBytes = 80 * 1024 * 1024

export function planPilot(scenes = SCENES, profiles = PILOT_PROFILES) {
  const jobs = scenes.flatMap(scene => profiles.map(profile => {
    if (!Object.hasOwn(PROFILES, profile)) throw new Error(`Perfil desconhecido: ${profile}`)
    const config = PROFILES[profile]
    return { scene: scene.id, profile, endpoint: config.endpoint, resolution: config.resolution, estimateUSD: config.usd }
  }))
  const estimateUSD = Number(jobs.reduce((sum, job) => sum + job.estimateUSD, 0).toFixed(3))
  return { jobs, estimateUSD, minimumBudgetUSD: Math.ceil(estimateUSD * 110) / 100 }
}

function authorizedBudget(budget, plan) {
  if (!Number.isFinite(budget) || budget < plan.minimumBudgetUSD) {
    throw new Error(`O orçamento precisa cobrir US$ ${plan.minimumBudgetUSD.toFixed(2)}, incluindo 10% de reserva.`)
  }
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function atomicWrite(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, data, { flag: 'wx' })
  await rename(temp, path)
}

function saveJSON(path, data) {
  return atomicWrite(path, `${JSON.stringify(data, null, 2)}\n`)
}

function queueURL(value, requestId, suffix = '') {
  const url = new URL(value)
  if (url.origin !== queueHost || url.username || url.password || !url.pathname.endsWith(`/requests/${requestId}${suffix}`)) {
    throw new Error('URL da fila incompatível com o pedido.')
  }
  return url.href
}

async function falRequest(url, key, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Key ${key}`, ...options.headers },
  })
  if (!response.ok) throw new Error(`fal HTTP ${response.status}`)
  return response.json()
}

export async function submitJob(request, key, fetchImpl = fetch) {
  const response = await falRequest(`${queueHost}/${request.endpoint}`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' },
    body: JSON.stringify(request.input),
  }, fetchImpl)
  const requestId = response.request_id
  if (typeof requestId !== 'string' || !/^[\da-f-]{36}$/i.test(requestId)) throw new Error('Resposta da fila sem ID válido.')
  return { requestId, statusURL: queueURL(response.status_url, requestId, '/status'), resultURL: queueURL(response.response_url, requestId) }
}

async function prepareImages(scenes) {
  const { default: sharp } = await import('sharp')
  return Promise.all(scenes.map(async scene => {
    const original = await readFile(join(root, scene.file))
    const [width, height] = scene.format === '9:16' ? [720, 1280] : [1280, 720]
    const bytes = await sharp(original).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer()
    return { scene, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
  }))
}

async function writeReferences(out, images) {
  for (const { scene, bytes } of images) await writeFile(join(out, `${scene.id}.jpg`), bytes)
}

async function previewReferences(out) {
  const images = await prepareImages(SCENES)
  await mkdir(dirname(out), { recursive: true })
  await mkdir(out)
  await writeReferences(out, images)
  console.log(`Prévia dos enquadramentos em ${out}.`)
}

async function submitPilot(out, budget, key, plan) {
  authorizedBudget(budget, plan)
  const images = await prepareImages(SCENES)
  await mkdir(dirname(out), { recursive: true })
  await mkdir(out)
  await mkdir(join(out, 'review'))
  await mkdir(join(out, 'results'))
  const journalPath = join(out, 'jobs.json')
  const jobs = plan.jobs.map(job => ({ ...job, alias: randomUUID(), state: 'planned', actualUSD: null }))
  const journal = { version: DIRECTION_VERSION, createdAt: new Date().toISOString(), budgetUSD: budget, estimateUSD: plan.estimateUSD, jobs }
  const byScene = new Map(images.map(image => [image.scene.id, image]))
  await writeReferences(join(out, 'review'), images)
  await saveJSON(join(out, 'review', 'reviews.json'), jobs.map(({ alias, scene }) => ({
    alias, scene, ...Object.fromEntries(reviewCriteria.map(key => [key, null])), evidence: '',
  })).sort((a, b) => a.scene.localeCompare(b.scene) || a.alias.localeCompare(b.alias)))
  await saveJSON(journalPath, journal)

  for (const job of jobs) {
    const { scene, bytes, sha256 } = byScene.get(job.scene)
    const request = buildProviderRequest({ profile: job.profile, imageUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, ...scene })
    job.state = 'submitting'
    job.submittedAt = new Date().toISOString()
    job.imageSHA256 = sha256
    job.prompt = request.input.prompt
    await saveJSON(journalPath, journal)
    try {
      Object.assign(job, await submitJob(request, key), { state: 'submitted' })
      await saveJSON(journalPath, journal)
      console.log(`Enviado ${job.alias} (${job.scene})`)
    } catch (error) {
      job.state = 'submission-unknown'
      job.error = error.message
      await saveJSON(journalPath, journal)
      console.error(`Envio incerto de ${job.alias}. Confira a fila antes de qualquer novo envio. Os jobs com ID ainda serão coletados.`)
      break
    }
  }
}

function resultPath(out, alias) {
  if (!/^[\da-f-]{36}$/i.test(alias)) throw new Error('ID local inválido.')
  return join(out, 'results', `${alias}.json`)
}

async function collectJob(out, job, key) {
  const path = resultPath(out, job.alias)
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const status = await falRequest(queueURL(job.statusURL, job.requestId, '/status'), key)
  if (status.status !== 'COMPLETED') return false
  if (status.error || status.error_type) {
    await saveJSON(path, { state: 'failed', finishedAt: new Date().toISOString(), errorType: status.error_type ?? 'provider_error' })
    return true
  }
  const result = await falRequest(queueURL(job.resultURL, job.requestId), key)
  const url = new URL(result.video?.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname.endsWith('.fal.media') || url.hostname === 'storage.googleapis.com')) {
    throw new Error('Origem do arquivo de vídeo inesperada.')
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error(`Download de vídeo HTTP ${response.status}`)
  const chunks = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.byteLength
    if (length > maxVideoBytes) throw new Error('Vídeo acima do limite local de 80 MiB.')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Arquivo sem cabeçalho MP4 esperado.')
  await atomicWrite(join(out, 'review', `${job.alias}.mp4`), bytes)
  await saveJSON(path, { state: 'downloaded', finishedAt: new Date().toISOString() })
  return true
}

async function collectPilot(out, key) {
  const { jobs } = await readJSON(join(out, 'jobs.json'))
  let pending = jobs.filter(job => job.state === 'submitted' || (job.requestId && job.statusURL && job.resultURL))
  const deadline = Date.now() + 15 * 60_000
  while (pending.length && Date.now() < deadline) {
    const remaining = []
    for (const job of pending) {
      try {
        if (!await collectJob(out, job, key)) remaining.push(job)
      } catch (error) {
        console.error(`Coleta de ${job.alias}: ${error.message}`)
        remaining.push(job)
      }
      if (Date.now() >= deadline) break
    }
    if (Date.now() >= deadline) break
    pending = remaining
    if (pending.length) await delay(8_000)
  }
  if (pending.length) console.error(`Coleta pendente em ${out}; use --collect para consultar os IDs existentes.`)
  return pending.length === 0 && jobs.every(job => job.state === 'submitted')
}

export function summarizePilot(jobs, reviews, results) {
  const byAlias = new Map(reviews.map(review => [review.alias, review]))
  const groups = new Map()
  for (const job of jobs) {
    const group = groups.get(job.profile) ?? { profile: job.profile, planned: 0, approved: 0, rejected: 0, unverified: 0, billedJobs: 0, knownUSD: 0, pricedJobs: 0 }
    group.planned += 1
    const review = byAlias.get(job.alias)
    const state = results.get(job.alias)
    const reviewed = state === 'downloaded' && review?.watchedFullClip === true && review.comparedReference === true &&
      typeof review.evidence === 'string' && review.evidence.trim()
    if (state === 'failed' || (reviewed && reviewCriteria.some(field => review[field] === false))) group.rejected += 1
    else if (reviewed && reviewCriteria.every(field => review[field] === true)) group.approved += 1
    else group.unverified += 1
    if (['submitted', 'submitting', 'submission-unknown'].includes(job.state)) {
      group.pricedJobs += 1
      if (typeof job.actualUSD === 'number' && Number.isFinite(job.actualUSD) && job.actualUSD >= 0) {
        group.billedJobs += 1
        group.knownUSD += job.actualUSD
      }
    }
    groups.set(job.profile, group)
  }
  return [...groups.values()].map(group => {
    const observedUSD = group.billedJobs === group.pricedJobs && group.unverified === 0 && group.approved > 0
      ? group.knownUSD / group.approved
      : null
    return { ...group, observedUSD, economics: observedUSD === null ? null : calculateEconomics(observedUSD, { observed: true }) }
  })
}

async function scorePilot(out) {
  const { jobs } = await readJSON(join(out, 'jobs.json'))
  const reviews = await readJSON(join(out, 'review', 'reviews.json'))
  const results = new Map()
  for (const job of jobs) {
    try {
      results.set(job.alias, (await readJSON(resultPath(out, job.alias))).state)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  console.log(JSON.stringify(summarizePilot(jobs, reviews, results), null, 2))
}

async function main() {
  const { values } = parseArgs({ options: {
    run: { type: 'boolean' }, collect: { type: 'boolean' }, score: { type: 'boolean' }, prepare: { type: 'boolean' },
    out: { type: 'string' }, 'budget-usd': { type: 'string' }, profiles: { type: 'string' },
  } })
  const operations = [values.run, values.collect, values.score, values.prepare].filter(Boolean).length
  if (operations > 1) throw new Error('Use apenas uma operação por vez.')
  if (values.profiles !== undefined && operations && !values.run) throw new Error('Use --profiles no planejamento ou no envio.')
  const profiles = values.profiles?.split(',').map(profile => profile.trim()) ?? PILOT_PROFILES
  if (profiles.some(profile => !Object.hasOwn(PROFILES, profile)) || new Set(profiles).size !== profiles.length) {
    throw new Error('Use uma lista de perfis conhecidos e sem repetição.')
  }
  if (operations === 0) {
    const plan = planPilot(SCENES, profiles)
    console.table(profiles.map(profile => ({
      perfil: profile, motor: PROFILES[profile].label, resolucao: PROFILES[profile].resolution, custoUSD: PROFILES[profile].usd,
      nodesSimulados: calculateEconomics(PROFILES[profile].usd).nodes,
    })))
    console.log(`${plan.jobs.length} takes de 5 s. Estimativa US$ ${plan.estimateUSD.toFixed(2)}. Orçamento mínimo US$ ${plan.minimumBudgetUSD.toFixed(2)}.`)
    return
  }
  if (!values.out) throw new Error('Informe --out com o caminho da rodada.')
  const out = resolve(values.out)
  if (values.prepare) return previewReferences(out)
  if (values.score) return scorePilot(out)
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY ausente. Nenhum pedido foi enviado.')
  if (values.run) await submitPilot(out, Number(values['budget-usd']), key, planPilot(SCENES, profiles))
  if (!await collectPilot(out, key)) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
