// lib/marketing/ads/csv.ts
//
// Parser do CSV de métricas diárias exportado/montado à mão a partir do
// gerenciador de anúncios. Módulo PURO (zero imports) — testável com node.
//
// Cabeçalho aceito (PT-BR ou inglês, qualquer ordem, ; ou , como separador):
//   data,identificador,impressoes,cliques,investimento,leads
//   date,identifier,impressions,clicks,spend,platform_leads
// A coluna de leads é opcional. Investimento em BRL decimal (vírgula ou
// ponto; "R$" e separador de milhar tolerados) → convertido para centavos.
// A tradução identificador→(level, entity_id) fica no service
// (resolveMetricIdentifiers) — aqui só shape e números.

export interface ParsedMetricRow {
  /** Linha original no CSV (1-based, contando o cabeçalho) — para mensagens. */
  line: number
  metric_date: string        // YYYY-MM-DD
  identifier: string
  impressions: number
  clicks: number
  spend_cents: number
  platform_leads: number | null
}

export interface CsvRowError {
  line: number
  message: string
}

export interface ParseMetricsCsvResult {
  rows: ParsedMetricRow[]
  errors: CsvRowError[]
}

/** Colunas canônicas por alias de cabeçalho (normalizado sem acento). */
type CsvField = 'metric_date' | 'identifier' | 'impressions' | 'clicks' | 'spend' | 'platform_leads'

const HEADER_ALIASES: Record<string, CsvField> = {
  data: 'metric_date',
  date: 'metric_date',
  identificador: 'identifier',
  identifier: 'identifier',
  impressoes: 'impressions',
  impressions: 'impressions',
  cliques: 'clicks',
  clicks: 'clicks',
  investimento: 'spend',
  spend: 'spend',
  leads: 'platform_leads',
  platform_leads: 'platform_leads',
}

const REQUIRED_FIELDS: readonly CsvField[] = ['metric_date', 'identifier', 'impressions', 'clicks', 'spend']

const MAX_DATA_ROWS = 500

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeHeaderCell(cell: string): string {
  return cell
    .replace(/^﻿/, '')    // BOM do Excel
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Split de linha com suporte a aspas duplas ("" = aspa literal). */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

/** Aceita YYYY-MM-DD ou DD/MM/YYYY (formato BR); valida data real. */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  let iso: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s
  } else {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
    if (m) iso = `${m[3]}-${m[2]}-${m[1]}`
  }
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null
  return iso
}

/** Inteiro ≥ 0, tolerando separador de milhar com ponto ("1.234"). */
function parseCount(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+$/.test(s)) return null
  return Number(s)
}

/** BRL decimal → centavos. Vírgula é decimal (ponto vira milhar); sem vírgula,
 *  "1.234"/"2.500" (grupos de 3) é milhar — mesma heurística de parseCount —
 *  e só então o ponto restante é decimal. "R$" e espaços tolerados. */
function parseMoneyToCents(raw: string): number | null {
  let s = raw.trim().replace(/^r\$\s*/i, '').replace(/\s+/g, '')
  if (!s) return null
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const value = Number(s)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

// ── Parser ─────────────────────────────────────────────────────────────────────

export function parseMetricsCsv(text: string): ParseMetricsCsvResult {
  const rows: ParsedMetricRow[] = []
  const errors: CsvRowError[] = []

  const lines = text.split(/\r?\n/)

  // Primeira linha não-vazia = cabeçalho.
  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) {
    return { rows, errors: [{ line: 1, message: 'CSV vazio' }] }
  }

  const headerLine = lines[headerIndex]
  // Excel pt-BR exporta com ponto-e-vírgula; detectar pelo cabeçalho.
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  const delimiter = semis > commas ? ';' : ','

  const columns = new Map<CsvField, number>()
  splitCsvLine(headerLine, delimiter).forEach((cell, idx) => {
    const field = HEADER_ALIASES[normalizeHeaderCell(cell)]
    if (field && !columns.has(field)) columns.set(field, idx)
  })

  const missing = REQUIRED_FIELDS.filter(f => !columns.has(f))
  if (missing.length > 0) {
    return {
      rows,
      errors: [{
        line: headerIndex + 1,
        message: 'Cabeçalho inválido — esperado data,identificador,impressoes,cliques,investimento[,leads] '
          + '(ou date,identifier,impressions,clicks,spend[,platform_leads])',
      }],
    }
  }

  let dataRows = 0
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const lineNumber = i + 1
    const rawLine = lines[i]
    if (rawLine.trim().length === 0) continue

    dataRows++
    if (dataRows > MAX_DATA_ROWS) {
      errors.push({ line: lineNumber, message: `Máximo de ${MAX_DATA_ROWS} linhas por importação — divida o arquivo` })
      break
    }

    const cells = splitCsvLine(rawLine, delimiter)
    const cell = (field: CsvField): string => cells[columns.get(field) as number]?.trim() ?? ''

    const problems: string[] = []

    const metricDate = parseDate(cell('metric_date'))
    if (!metricDate) problems.push(`data inválida "${cell('metric_date')}" (use YYYY-MM-DD ou DD/MM/YYYY)`)

    const identifier = cell('identifier')
    if (!identifier) problems.push('identificador vazio')

    const impressions = parseCount(cell('impressions'))
    if (impressions === null) problems.push(`impressões inválidas "${cell('impressions')}"`)

    const clicks = parseCount(cell('clicks'))
    if (clicks === null) problems.push(`cliques inválidos "${cell('clicks')}"`)

    const spendCents = parseMoneyToCents(cell('spend'))
    if (spendCents === null) problems.push(`investimento inválido "${cell('spend')}"`)

    let platformLeads: number | null = null
    if (columns.has('platform_leads')) {
      const rawLeads = cell('platform_leads')
      if (rawLeads) {
        platformLeads = parseCount(rawLeads)
        if (platformLeads === null) problems.push(`leads inválidos "${rawLeads}"`)
      }
    }

    if (problems.length > 0) {
      errors.push({ line: lineNumber, message: problems.join('; ') })
      continue
    }

    rows.push({
      line: lineNumber,
      metric_date: metricDate as string,
      identifier,
      impressions: impressions as number,
      clicks: clicks as number,
      spend_cents: spendCents as number,
      platform_leads: platformLeads,
    })
  }

  return { rows, errors }
}
