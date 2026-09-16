// Converte o export diário do Gerenciador de Anúncios (Meta) ou do Google Ads
// para o CSV que o painel /admin/marketing/ads aceita (lib/marketing/ads/csv.ts):
//   data,identificador,impressoes,cliques,investimento,leads
//
// Uso: node marketing/scripts/ads/gerenciador-csv-para-painel.mjs <export.csv> [--nivel anuncio|conjunto|campanha] [--out saida.csv]
//
// Como exportar:
//   Meta  → Gerenciador de Anúncios → nível Anúncios (ou Conjuntos/Campanhas) → Detalhamento "Por tempo: Dia"
//           → Relatórios → Exportar dados da tabela → CSV. Colunas mínimas: Nome do anúncio, Dia,
//           Impressões, Cliques no link, Valor gasto (BRL), Resultados.
//   Google → Campanhas/Grupos de anúncios → Segmentar "Dia" → Baixar → CSV. Colunas: Campanha ou
//           Grupo de anúncios, Dia, Impr., Cliques, Custo, Conversões.
// O nome no gerenciador PRECISA ser o identificador SN_* cadastrado no painel — linhas sem SN_ são ignoradas.
// Linhas do mesmo (dia, identificador) são somadas (ex.: Meta separa por posicionamento).
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
if (!file) { console.error('informe o CSV exportado'); process.exit(1) }
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const nivel = opt('nivel', 'anuncio')
const out = opt('out', path.join(path.dirname(file), `painel-${path.basename(file).replace(/\.csv$/i, '')}.csv`))

let raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
// Google Ads põe 2 linhas de título antes do cabeçalho ("Relatório ...", "Período ...").
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0)
const delim = (lines.find(l => l.includes('Impress') || l.includes('Impr.')) ?? lines[0]).split(';').length > (lines[0].split(',').length) ? ';' : ','
const parse = line => {
  const cells = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === delim) { cells.push(cur); cur = '' }
    else cur += c
  }
  cells.push(cur)
  return cells.map(s => s.trim())
}
const headerIdx = lines.findIndex(l => /impress|impr\./i.test(l))
if (headerIdx < 0) { console.error('não achei a linha de cabeçalho (precisa ter "Impressões"/"Impr.")'); process.exit(1) }
const header = parse(lines[headerIdx]).map(h => h.toLowerCase())
const rows = lines.slice(headerIdx + 1).map(parse).filter(r => r.length >= header.length - 1)

const ALIASES = {
  date: ['dia', 'day', 'data', 'date', 'início dos relatórios', 'reporting starts'],
  anuncio: ['nome do anúncio', 'nome do anuncio', 'ad name', 'anúncio', 'anuncio', 'ad'],
  conjunto: ['nome do conjunto de anúncios', 'nome do conjunto de anuncios', 'ad set name', 'grupo de anúncios', 'grupo de anuncios', 'ad group'],
  campanha: ['nome da campanha', 'campaign name', 'campanha', 'campaign'],
  impressions: ['impressões', 'impressoes', 'impressions', 'impr.', 'impr'],
  clicks: ['cliques no link', 'link clicks', 'cliques', 'clicks'],
  spend: ['valor gasto (brl)', 'amount spent (brl)', 'valor usado (brl)', 'valor gasto', 'amount spent', 'custo', 'cost'],
  leads: ['resultados', 'results', 'conversões', 'conversoes', 'conversions', 'leads', 'cadastros'],
}
const col = key => { for (const a of ALIASES[key]) { const i = header.indexOf(a); if (i >= 0) return i } return -1 }
const iDate = col('date'), iId = col(nivel), iImp = col('impressions'), iClk = col('clicks'), iSp = col('spend'), iLd = col('leads')
if (iDate < 0 || iId < 0 || iImp < 0 || iClk < 0 || iSp < 0) {
  console.error(`colunas faltando: data=${iDate} identificador(${nivel})=${iId} impressoes=${iImp} cliques=${iClk} investimento=${iSp}\ncabeçalho lido: ${header.join(' | ')}`)
  process.exit(1)
}
// Aceita "1.234" (milhar PT-BR), "1.234,56", "44,50", "44.50", "1,234.56" e "R$ 95,20".
const num = s => {
  const t = String(s ?? '').replace(/[R$\s]/g, '')
  if (!t || t === '--') return 0
  let n
  if (t.includes(',') && t.includes('.')) n = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (t.includes(',')) n = t.replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '')
  else n = t
  return Number(n) || 0
}
const isoDate = s => {
  const t = String(s).trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}
const acc = new Map()
let ignored = 0
for (const r of rows) {
  const id = (r[iId] ?? '').trim().toUpperCase()
  const d = isoDate(r[iDate])
  if (!/^SN_[A-Z0-9_]+$/.test(id) || !d) { ignored++; continue }
  const k = `${d}|${id}`
  const cur = acc.get(k) ?? { d, id, imp: 0, clk: 0, sp: 0, ld: 0, hasLd: iLd >= 0 }
  cur.imp += num(r[iImp]); cur.clk += num(r[iClk]); cur.sp += num(r[iSp]); if (iLd >= 0) cur.ld += num(r[iLd])
  acc.set(k, cur)
}
const outRows = [...acc.values()].sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id))
const csv = ['data,identificador,impressoes,cliques,investimento,leads', ...outRows.map(r => `${r.d},${r.id},${Math.round(r.imp)},${Math.round(r.clk)},${r.sp.toFixed(2)},${r.hasLd ? Math.round(r.ld) : ''}`)].join('\n') + '\n'
fs.writeFileSync(out, csv)
const total = outRows.reduce((s, r) => s + r.sp, 0)
console.log(`${outRows.length} linhas (nível ${nivel}), ${ignored} ignoradas sem SN_/data; investimento total R$ ${total.toFixed(2)}`)
console.log(`gravado: ${out} → colar no painel /admin/marketing/ads (aba Métricas). Máx. 500 linhas por envio.`)
