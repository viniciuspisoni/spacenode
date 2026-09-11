// Exporta conversões OFF-LINE por gclid para importar no Google Ads
// ("Conversões de cliques" → upload de planilha/CSV), a partir do funil
// first-party (marketing.acquisition_events). Sem tag no site: o Google só
// recebe o identificador do clique + nome/hora/valor da conversão.
//
// Uso: node marketing/scripts/ads/export-google-conversions.mjs [--since 2026-08-10] [--until 2026-09-08]
//        [--out marketing/output/ads/google-conversions-<hoje>.csv] [--dry]
//
// Saída (formato aceito pelo Google Ads, 1ª linha = fuso):
//   Parameters:TimeZone=America/Sao_Paulo
//   Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
//
// Conversões emitidas (os NOMES precisam existir na conta, tipo "Importar → cliques"):
//   Cadastro   — evento `signup` cujo cookie de atribuição trazia gclid (1 por usuário)
//   Assinatura — evento `subscription_started` de um usuário cujo signup tinha gclid
//                (valor = value_cents/100 em BRL; Starter = R$ 89,00)
// Janela do Google: o clique tem que ter ≤ 90 dias. Linhas mais velhas são
// descartadas com aviso. Nunca grava e-mail, nome ou IP — só o gclid.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..')
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def }
const DRY = args.includes('--dry')
const today = new Date()
const iso = d => d.toISOString().slice(0, 10)
const since = opt('since', iso(new Date(today.getTime() - 30 * 86400e3)))
const until = opt('until', iso(today))
const out = opt('out', path.join(REPO, 'marketing', 'output', 'ads', `google-conversions-${iso(today)}.csv`))

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const mkt = sb.schema('marketing')

// 1. Todos os signups com gclid (o cookie guarda first e last touch; o gclid do
//    last touch é o clique que precede o cadastro).
const { data: signups, error: e1 } = await mkt
  .from('acquisition_events')
  .select('user_id, created_at, utm')
  .eq('event_type', 'signup')
if (e1) throw new Error(`signup: ${e1.message}`)
const gclidByUser = new Map()
for (const s of signups) {
  const g = s.utm?.last?.gclid ?? s.utm?.first?.gclid
  if (g && s.user_id) gclidByUser.set(s.user_id, { gclid: g, signup_at: s.created_at, click_at: s.utm?.last?.at ?? s.utm?.first?.at ?? null })
}

// 2. Assinaturas iniciadas por esses usuários (valor em BRL).
const { data: subs, error: e2 } = await mkt
  .from('acquisition_events')
  .select('user_id, created_at, value_cents, plan_id')
  .eq('event_type', 'subscription_started')
if (e2) throw new Error(`subscription_started: ${e2.message}`)

// 3. Monta linhas na janela pedida e dentro dos 90 dias do clique.
const fmt = ts => {
  // Google aceita "yyyy-MM-dd HH:mm:ss" no fuso declarado em Parameters:TimeZone.
  const d = new Date(ts)
  const sp = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const p = n => String(n).padStart(2, '0')
  return `${sp.getFullYear()}-${p(sp.getMonth() + 1)}-${p(sp.getDate())} ${p(sp.getHours())}:${p(sp.getMinutes())}:${p(sp.getSeconds())}`
}
const inWindow = ts => { const d = ts.slice(0, 10); return d >= since && d <= until }
const tooOld = clickAt => clickAt && (today.getTime() - new Date(clickAt).getTime()) > 90 * 86400e3
const rows = []
let dropped = 0
for (const [userId, s] of gclidByUser) {
  if (inWindow(s.signup_at)) {
    if (tooOld(s.click_at)) { dropped++; continue }
    rows.push(['Cadastro', s.gclid, fmt(s.signup_at), '', ''])
  }
}
for (const sub of subs) {
  const s = sub.user_id && gclidByUser.get(sub.user_id)
  if (!s || !inWindow(sub.created_at)) continue
  if (tooOld(s.click_at)) { dropped++; continue }
  const value = sub.value_cents != null ? (sub.value_cents / 100).toFixed(2) : '89.00'
  rows.push(['Assinatura', s.gclid, fmt(sub.created_at), value, 'BRL'])
}
rows.sort((a, b) => a[2].localeCompare(b[2]))

const header = 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency'
const csv = ['Parameters:TimeZone=America/Sao_Paulo', header, ...rows.map(r => [r[1], r[0], r[2], r[3], r[4]].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n'

const cad = rows.filter(r => r[0] === 'Cadastro').length
const ass = rows.filter(r => r[0] === 'Assinatura').length
console.log(`janela ${since}..${until}: ${cad} Cadastro, ${ass} Assinatura (${dropped} fora dos 90 dias do clique); ${gclidByUser.size} cadastros com gclid no total`)
if (DRY) { console.log(csv.split('\n').slice(0, 6).join('\n') + (rows.length > 4 ? '\n...' : '')); process.exit(0) }
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, csv)
console.log(`gravado: ${out}`)
console.log('Importar em: Google Ads → Metas → Conversões → Uploads → "Conversões de cliques" (planilha). As ações "Cadastro" e "Assinatura" precisam existir como "Importar → Outras fontes de dados → Cliques".')
