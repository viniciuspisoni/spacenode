// Harness de três camadas do Renderizar 3.0 (protótipo usado na fase D).
//
//   leitura (contrato) → geração com briefing → portão de geometria (grátis)
//   → juiz com checklist → entregar | retry localizado | trocar de motor
//
// No máximo `maxAttempts` gerações. O usuário recebe a melhor tentativa e
// nunca paga a segunda: o retry está no preço pelo E[t] (economics.ts).

import { computeGeometryScore } from '@/lib/ai/fidelity/geometry-score'
import { SAME_FAMILY, type GeneratorSpec, type LlmSpec } from './config'
import {
  JUDGE_SCHEMA, JUDGE_SYSTEM, READ_SCHEMA, READ_SYSTEM, READ_USER,
  contractToBriefing, judgeUser, strictPass, type JudgeVerdict, type ReadContract,
} from './contract'
import { benchPrompt, generate, uploadInput } from './image'
import { prepImage, visionJson } from './llm'

export interface HarnessDeps {
  reader: LlmSpec
  primary: GeneratorSpec
  fallback: GeneratorSpec
  judge: LlmSpec
  minGeometry: number
  maxAttempts: number
  /** Reserva de gasto antes de cada chamada paga (lança se estourar o teto). */
  reserve: (usd: number, what: string) => void
  /** Leitura já feita na fase A, se houver (o cache por input_url de produção). */
  cachedRead?: ReadContract | null
}

export interface Attempt {
  gen: string
  correction: string | null
  ok: boolean
  error: string | null
  geometry: number | null
  verdict: JudgeVerdict | null
  pass: boolean
  genUsd: number
  judgeUsd: number
  ms: number
}

export interface HarnessResult {
  read: ReadContract | null
  readUsd: number
  attempts: Attempt[]
  delivered: number | null
  png: Buffer | null
  totalUsd: number
}

export async function runHarness(caseName: string, input: Buffer, mime: string, projectType: 'interior' | 'exterior', d: HarnessDeps): Promise<HarnessResult & { pngs: Array<Buffer | null> }> {
  if (SAME_FAMILY[d.primary.family] === d.judge.family || SAME_FAMILY[d.fallback.family] === d.judge.family) {
    throw new Error(`juiz ${d.judge.id} é da mesma família de um dos motores — regra de autopreferência`)
  }
  const sharp = (await import('sharp')).default
  const meta = await sharp(input).metadata()
  const src = meta.width && meta.height ? { width: meta.width, height: meta.height } : null
  const small = await prepImage(input)

  // 1. Leitura
  let read = d.cachedRead ?? null
  let readUsd = 0
  if (!read) {
    d.reserve(0.08, `leitura ${d.reader.id}`)
    const r = await visionJson<ReadContract>({ spec: d.reader, system: READ_SYSTEM, user: READ_USER, images: [small], schema: READ_SCHEMA, schemaName: 'read_contract' })
    read = r.data
    readUsd = r.usd
  }

  const inputUrl = await uploadInput(caseName, input, mime)
  const attempts: Attempt[] = []
  const pngs: Array<Buffer | null> = []
  let gen = d.primary
  let correction: string | null = null

  for (let n = 0; n < d.maxAttempts; n++) {
    d.reserve(gen.estUsd, `geração ${gen.id}`)
    const prompt = benchPrompt(gen, projectType, read ? contractToBriefing(read) : undefined, correction ?? undefined)
    const g = await generate(gen, inputUrl, prompt, src)
    const att: Attempt = { gen: gen.id, correction, ok: g.ok, error: g.error, geometry: null, verdict: null, pass: false, genUsd: gen.estUsd, judgeUsd: 0, ms: g.ms }
    attempts.push(att)
    pngs.push(g.png)
    if (!g.ok || !g.png) { gen = d.fallback; correction = null; continue }

    // 2. Portão de geometria: reprovação grosseira não gasta juiz.
    att.geometry = (await computeGeometryScore(input, g.png)).score
    if (att.geometry < d.minGeometry) { gen = d.fallback; correction = null; continue }

    // 3. Juiz com checklist
    if (!read) { att.pass = true; break } // sem contrato não há checklist; entrega pelo portão
    d.reserve(0.06, `juiz ${d.judge.id}`)
    const v = await visionJson<JudgeVerdict>({
      spec: d.judge, system: JUDGE_SYSTEM, user: judgeUser(read),
      images: [small, await prepImage(g.png)], schema: JUDGE_SCHEMA, schemaName: 'judge_verdict',
    })
    att.judgeUsd = v.usd
    att.verdict = v.data
    if (!v.data) break // juiz falhou: entrega a melhor até aqui
    att.pass = strictPass(v.data, read)
    if (att.pass) break
    if (v.data.veredito === 'retry_localizado' && v.data.correcao) correction = v.data.correcao
    else { gen = d.fallback; correction = null }
  }

  const delivered = pickDelivered(attempts)
  const totalUsd = readUsd + attempts.reduce((a, t) => a + t.genUsd + t.judgeUsd, 0)
  return { read, readUsd, attempts, delivered, png: delivered === null ? null : pngs[delivered], pngs, totalUsd }
}

/** Melhor tentativa: aprovada > maior soma de notas do juiz > maior geometria. */
export function pickDelivered(attempts: Attempt[]): number | null {
  let best: number | null = null
  const score = (a: Attempt) =>
    (a.pass ? 1000 : 0) +
    (a.verdict ? a.verdict.geometria + a.verdict.materiais + a.verdict.luz + a.verdict.fotorrealismo : 0) * 10 +
    (a.geometry ?? 0)
  attempts.forEach((a, i) => {
    if (!a.ok) return
    if (best === null || score(a) > score(attempts[best])) best = i
  })
  return best
}
