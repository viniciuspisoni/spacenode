// Valida a conexao com a Meta Marketing API: token, conta de anuncios,
// conta do Instagram e campanhas existentes. Nao cria nem altera nada.
// Uso: node test-meta-connection.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
for (const key of ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_IG_ACCOUNT_ID', 'META_APP_ID', 'META_APP_SECRET']) {
  const m = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, 'm'))
  if (m) process.env[key] = m[1].trim().replace(/^["']|["']$/g, '')
}

if (!process.env.META_ACCESS_TOKEN) {
  console.error('META_ACCESS_TOKEN nao encontrado no .env.local — siga o passo a passo de setup primeiro.')
  process.exit(1)
}

const { debugToken, getAdAccount, getInstagramAccount, listCampaigns, META_GRAPH_VERSION } = await import('./lib/meta/ads.ts')

console.log(`Graph API ${META_GRAPH_VERSION}\n`)

// 1. Token
try {
  const t = await debugToken()
  const expira = t.expiresAt === 0 ? 'nunca (token de System User)' : new Date(t.expiresAt * 1000).toLocaleString('pt-BR')
  console.log(`[token] valido: ${t.isValid} | tipo: ${t.type} | expira: ${expira}`)
  console.log(`[token] escopos: ${t.scopes.join(', ') || '(nenhum)'}`)
  const precisa = ['ads_management', 'ads_read', 'business_management']
  const faltam = precisa.filter((s) => !t.scopes.includes(s))
  if (faltam.length) console.warn(`[token] AVISO - escopos faltando para automacao: ${faltam.join(', ')}`)
} catch (e) {
  console.error('[token] FALHOU:', e.message)
  process.exit(1)
}

// 2. Conta de anuncios
try {
  const acc = await getAdAccount()
  const status = acc.account_status === 1 ? 'ATIVA' : `status ${acc.account_status} (1 = ativa)`
  console.log(`\n[ad account] ${acc.name} (${acc.id}) | ${status} | moeda ${acc.currency} | fuso ${acc.timezone_name}`)
} catch (e) {
  console.error('\n[ad account] FALHOU:', e.message)
}

// 3. Instagram
if (process.env.META_IG_ACCOUNT_ID) {
  try {
    const ig = await getInstagramAccount()
    console.log(`[instagram] @${ig.username} (${ig.id}) | ${ig.followers_count ?? '?'} seguidores`)
  } catch (e) {
    console.error('[instagram] FALHOU:', e.message)
  }
} else {
  console.warn('[instagram] META_IG_ACCOUNT_ID nao definido — pulei a checagem')
}

// 4. Campanhas existentes (leitura)
try {
  const camps = await listCampaigns()
  console.log(`\n[campanhas] ${camps.length} encontrada(s)`)
  for (const c of camps) console.log(`  - ${c.name} | ${c.objective} | ${c.effective_status}`)
} catch (e) {
  console.error('\n[campanhas] FALHOU:', e.message)
}

console.log('\nConexao validada. Proxima fase: criacao automatizada de campanhas OUTCOME_TRAFFIC.')
