import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildDirection, buildProviderRequest, calculateEconomics, PROFILES } from '../../lib/video/direction-v3.mjs'
import { planPilot, submitJob, summarizePilot } from './pilot.mjs'

const imageUrl = 'https://example.test/reference.jpg'
const endUrl = 'https://example.test/end.jpg'

test('a direção mantém a câmera fixa e limita o movimento à vegetação existente', () => {
  const prompt = buildDirection({ take: 'camera-fixa', anchors: ['window mullions'], ambient: 'vegetation' })
  assert.match(prompt, /locked tripod/)
  assert.match(prompt, /only in existing foliage/)
  assert.match(prompt, /window mullions/)
  assert.match(prompt, /no cuts or transitions/)
  assert.throws(() => buildDirection({ take: 'camera-fixa', anchors: [] }), /água ou vegetação/)
  assert.throws(() => buildDirection({ take: 'duas-vistas', anchors: [] }), /segundo quadro/)
  assert.throws(() => buildDirection({ take: 'deslizar', anchors: [], finalFrame: true }), /segundo quadro/)
  assert.throws(() => buildDirection({ take: 'constructor', anchors: [] }), /desconhecido/)
})

test('os modelos recebem os campos documentados para a mesma direção', () => {
  const payloads = Object.fromEntries(Object.keys(PROFILES).map(profile => [profile, buildProviderRequest({
    profile, imageUrl, endUrl, take: 'duas-vistas', anchors: ['vertical wall edges'],
  }).input]))

  assert.equal(payloads['kling25-1080'].image_url, imageUrl)
  assert.equal(payloads['kling25-1080'].tail_image_url, endUrl)
  assert.equal(payloads['kling25-1080'].duration, '5')
  assert.equal(payloads['h3-max-768'].resolution, '768P')
  assert.equal(payloads['h3-max-768'].prompt_expansion_mode, 'disabled')
  assert.equal(payloads['kling4-720'].start_image_url, imageUrl)
  assert.equal(payloads['kling4-720'].end_image_url, endUrl)
  assert.equal(payloads['kling4-720'].duration, 5)
  assert.equal(payloads['kling4-1080'].resolution, '1080p')
  assert.equal(payloads['seedance25-720'].generate_audio, false)
  assert.equal(payloads['seedance25-720'].aspect_ratio, 'auto')
  assert.equal(payloads['seedance25-720'].duration, '5')
  assert.equal(new Set(Object.values(payloads).map(input => input.prompt)).size, 1)
})

test('preflight do Essence anual projeta margem mínima de contribuição de 70%', () => {
  const expectedNodes = [65, 75, 140, 210, 415]
  Object.values(PROFILES).forEach((profile, index) => {
    const economics = calculateEconomics(profile.usd)
    assert.equal(economics.nodes, expectedNodes[index])
    assert.ok(economics.margin >= 0.70)
    assert.ok(economics.fitsMonthlyAllowance)
  })
  assert.equal(calculateEconomics(5.82).fitsMonthlyAllowance, false)
  assert.throws(() => calculateEconomics(NaN), /inválido/)
  const plan = planPilot()
  assert.deepEqual([plan.jobs.length, plan.estimateUSD, plan.minimumBudgetUSD], [16, 15.60, 17.16])
})

test('a fila guarda o identificador recebido e recusa URL de status de outro host', async () => {
  const request = buildProviderRequest({ profile: 'kling4-720', imageUrl, take: 'deslizar', anchors: [] })
  const requestId = '8de016ca-3fa2-462b-bb37-aeebb698ca18'
  const resultURL = `https://queue.fal.run/kling/v4/requests/${requestId}`
  const success = { request_id: requestId, response_url: resultURL, status_url: `${resultURL}/status` }
  let calls = 0
  const result = await submitJob(request, 'fake', async (url, options) => {
    calls += 1
    assert.equal(url, 'https://queue.fal.run/kling/v4/image-to-video')
    assert.equal(options.headers.Authorization, 'Key fake')
    assert.deepEqual(JSON.parse(options.body), request.input)
    return Response.json(success)
  })
  assert.equal(calls, 1)
  assert.equal(result.requestId, requestId)
  await assert.rejects(submitJob(request, 'fake', async () => Response.json({ ...success, status_url: 'https://example.test/other' })), /URL da fila/)
})

test('custo observado inclui takes reprovados e exige fatura para cada tentativa', () => {
  const jobs = [0, 1, 2].map(index => ({ alias: `clip-${index}`, profile: 'kling25-1080', state: 'submitted', actualUSD: 0.35 }))
  const base = { watchedFullClip: true, comparedReference: true, geometry: true, materials: true, camera: true,
    singleTake: true, lightAndReflections: true, evidence: 'Esquadrias e juntas preservadas no take inteiro.' }
  const reviews = [{ alias: 'clip-0', ...base }, { alias: 'clip-1', ...base, geometry: false, evidence: 'Batente desaparece em 2 s.' }]
  const results = new Map([['clip-0', 'downloaded'], ['clip-1', 'downloaded'], ['clip-2', 'failed']])
  const [total] = summarizePilot(jobs, reviews, results)
  assert.deepEqual([total.approved, total.rejected, total.unverified], [1, 2, 0])
  assert.ok(Math.abs(total.observedUSD - 1.05) < 1e-12)
  assert.ok(total.economics.nodes > calculateEconomics(0.35).nodes)
  assert.equal(summarizePilot(jobs, [{ ...base, alias: 'clip-0', watchedFullClip: false }, reviews[1]], results)[0].observedUSD, null)
  jobs[1].actualUSD = null
  assert.equal(summarizePilot(jobs, reviews, results)[0].observedUSD, null)
})

test('a CLI não envia pedidos com chave ausente ou orçamento insuficiente', () => {
  const pilot = fileURLToPath(new URL('./pilot.mjs', import.meta.url))
  const args = [pilot, '--run', '--budget-usd', '1', '--out', 'unused']
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, FAL_KEY: '' } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /FAL_KEY ausente/)
  const budget = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, FAL_KEY: 'fake' } })
  assert.equal(budget.status, 1)
  assert.match(budget.stderr, /orçamento precisa cobrir/)
})
