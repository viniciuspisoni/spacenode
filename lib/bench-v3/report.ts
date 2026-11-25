// lib/bench-v3/report.ts
//
// Agrega results.jsonl: custo real, falhas e nota geométrica por motor;
// custo e taxa de leitura válida por leitor; decisões por juiz. Gera a
// planilha que o arquiteto preenche e, quando ela volta preenchida, mede a
// concordância de cada juiz com a avaliação humana.
//
// O número que decide o motor é custo por imagem APROVADA, não a média.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { BenchRecord } from './runner'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round = (x: number | null, d = 3) => (x === null ? null : Number(x.toFixed(d)))

export interface HumanRow { caso: string; motor: string; aprovado: boolean | null }

export const HUMAN_COLUMNS = ['caso', 'motor', 'arquivo', 'camera_ok', 'volumes_ok', 'aberturas_ok', 'materiais_ok', 'objetos_ok', 'realismo_1a5', 'aprovado_s_n', 'observacoes']

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

export function readHumanSheet(file: string): HumanRow[] {
  if (!existsSync(file)) return []
  const [head, ...rows] = parseCsv(readFileSync(file, 'utf8'))
  const col = (name: string) => head.indexOf(name)
  return rows.map(r => {
    const a = (r[col('aprovado_s_n')] ?? '').trim().toLowerCase()
    return { caso: r[col('caso')], motor: r[col('motor')], aprovado: a === 's' ? true : a === 'n' ? false : null }
  })
}

export function writeHumanSheet(records: BenchRecord[], outDir: string, run: number): string {
  const file = join(outDir, 'avaliacao-humana.csv')
  if (existsSync(file)) return file // nunca sobrescreve o que o arquiteto já preencheu
  const gens = records.filter(r => r.phase === 'generate' && r.ok && r.run === run)
  const lines = [HUMAN_COLUMNS.join(',')]
  for (const g of gens.sort((a, b) => a.case.localeCompare(b.case) || a.subject.localeCompare(b.subject))) {
    lines.push([g.case, g.subject, relative(outDir, String(g.imageFile)), '', '', '', '', '', '', '', ''].map(csvCell).join(','))
  }
  writeFileSync(file, `${lines.join('\n')}\n`)
  return file
}

export function buildReport(records: BenchRecord[], human: HumanRow[] = []) {
  const by = <K extends string>(phase: BenchRecord['phase']) =>
    records.filter(r => r.phase === phase).reduce((m, r) => {
      ;(m[r.subject as K] ??= []).push(r)
      return m
    }, {} as Record<K, BenchRecord[]>)

  const engines = Object.entries(by('generate')).map(([id, rs]) => {
    const ok = rs.filter(r => r.ok)
    const scores = ok.map(r => (r.geometry as { score: number }).score)
    const approvals = human.filter(h => h.motor === id && h.aprovado !== null)
    const approved = approvals.filter(h => h.aprovado).length
    const spent = rs.reduce((a, r) => a + r.costUsd, 0)
    return {
      motor: id, imagens: ok.length, falhas: rs.length - ok.length,
      notaGeometricaMedia: round(mean(scores)), notaGeometricaPior: round(scores.length ? Math.min(...scores) : null),
      custoMedioUsd: round(mean(ok.map(r => r.costUsd)), 4), custoTotalUsd: round(spent, 2),
      latenciaMediaS: round(mean(ok.map(r => (r.latencyMs ?? 0) / 1000)), 1),
      aprovacaoHumana: approvals.length ? round(approved / approvals.length) : null,
      // Custo por imagem aprovada: inclui as falhas e as reprovadas no gasto.
      custoPorAprovadaUsd: approvals.length && approved ? round((spent / ok.length) * approvals.length / approved, 4) : null,
    }
  }).sort((a, b) => (b.notaGeometricaMedia ?? 0) - (a.notaGeometricaMedia ?? 0))

  const readers = Object.entries(by('read')).map(([id, rs]) => ({
    leitor: id, fichasValidas: rs.filter(r => r.ok).length, falhas: rs.filter(r => !r.ok).length,
    custoMedioUsd: round(mean(rs.filter(r => r.ok).map(r => r.costUsd)), 4),
    latenciaMediaS: round(mean(rs.filter(r => r.ok).map(r => (r.latencyMs ?? 0) / 1000)), 1),
  }))

  const humanKey = new Map(human.map(h => [`${h.caso}|${h.motor}`, h.aprovado]))
  const judges = Object.entries(by('judge')).map(([id, rs]) => {
    const ok = rs.filter(r => r.ok)
    const decisions = ok.map(r => ({ rule: String(r.ruleDecision), h: humanKey.get(`${r.case}|${r.engine}`) ?? null }))
    const compared = decisions.filter(d => d.h !== null)
    const agree = compared.filter(d => (d.rule === 'entregar') === d.h).length
    return {
      juiz: id, avaliacoes: ok.length, falhas: rs.length - ok.length,
      entregar: decisions.filter(d => d.rule === 'entregar').length,
      refazer: decisions.filter(d => d.rule === 'refazer').length,
      aviso: decisions.filter(d => d.rule === 'entregar_com_aviso').length,
      custoMedioUsd: round(mean(ok.map(r => r.costUsd)), 4),
      concordanciaHumana: compared.length ? round(agree / compared.length) : null,
      // O erro grave: o juiz manda entregar o que o arquiteto reprovou.
      falsosAprovados: compared.filter(d => d.rule === 'entregar' && d.h === false).length,
    }
  })

  const total = records.reduce((a, r) => a + r.costUsd, 0)
  return {
    gastoTotalUsd: round(total, 2),
    gastoPorFase: Object.fromEntries((['read', 'generate', 'judge'] as const).map(p =>
      [p, round(records.filter(r => r.phase === p).reduce((a, r) => a + r.costUsd, 0), 2)])),
    custosDesconhecidosCobradosPeloTeto: records.filter(r => !r.costKnown).length,
    motores: engines, leitores: readers, juizes: judges,
  }
}
