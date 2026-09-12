// ── Cria o Product/Price do Essence no Stripe (mensal + anual) ───────────────
//
// Script ADITIVO e não-destrutivo: cria só o Product/Price do Essence,
// reutilizando se já existir (por lookup_key). NÃO mexe no webhook, não
// reescreve outros envs, não faz redeploy — ao contrário de
// scripts/stripe-live-setup.mjs, que reconfigura o catálogo inteiro e por
// isso é arriscado demais para rodar só para adicionar um plano novo.
//
// USO:
//   node scripts/stripe-add-essence-price.mjs
//   → usa STRIPE_SECRET_KEY do ambiente (.env.local em dev). Roda no MESMO
//     modo (teste ou live) da chave usada — não pede chave separada.
//
// Depois de rodar, adicione os Price IDs impressos como
// STRIPE_PRICE_ID_ESSENCE_MONTHLY / _ANNUAL no ambiente correspondente
// (.env.local para teste; Vercel → Production para live).

import { createRequire } from 'module'
import { readFileSync, existsSync, appendFileSync } from 'fs'

const require = createRequire(import.meta.url)
const Stripe = require('stripe')

// Carrega .env.local manualmente (sem depender de dotenv estar instalado).
if (!process.env.STRIPE_SECRET_KEY && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('✗ STRIPE_SECRET_KEY não encontrada no ambiente nem em .env.local.')
  process.exit(1)
}
const MODE = KEY.startsWith('sk_live_') ? 'LIVE' : KEY.startsWith('sk_test_') ? 'TESTE' : 'desconhecido'
console.log(`→ usando chave em modo ${MODE}`)

const stripe = new Stripe(KEY)

const PLAN = { id: 'essence', name: 'SPACENODE Essence', nodes: 800, monthly: 9900, annual: 99000 }

const lookupKeys = [`${PLAN.id}_monthly`, `${PLAN.id}_annual`]
const existing = new Map()
const page = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, limit: 100 })
for (const pr of page.data) existing.set(pr.lookup_key, pr)

function assertPriceMatches(found, lookupKey, amount, interval) {
  const foundInterval = found.recurring?.interval ?? null
  if (found.unit_amount === amount && found.currency === 'brl' && foundInterval === interval) return
  console.error(
    `✗ ${lookupKey} já existe (${found.id}) mas DIVERGE do catálogo: ` +
    `${found.unit_amount} ${found.currency} ${foundInterval ?? 'avulso'} ≠ ${amount} brl ${interval ?? 'avulso'}.`
  )
  console.error('  Arquive o preço antigo no Dashboard e rode de novo.')
  process.exit(1)
}

async function findOrCreateProduct() {
  const hit = await stripe.products.search({
    query: `active:'true' AND metadata['plan_id']:'${PLAN.id}' AND metadata['catalog']:'v2.2'`,
    limit: 1,
  })
  if (hit.data.length > 0) return hit.data[0].id
  const product = await stripe.products.create({
    name: PLAN.name,
    description: `Plano ${PLAN.name.replace('SPACENODE ', '')} — ${PLAN.nodes.toLocaleString('pt-BR')} nodes/mês`,
    metadata: { plan_id: PLAN.id, nodes: String(PLAN.nodes), catalog: 'v2.2' },
  })
  return product.id
}

const envs = {}
let productId = null
for (const cycle of ['monthly', 'annual']) {
  const lookupKey = `${PLAN.id}_${cycle}`
  const envName   = `STRIPE_PRICE_ID_${PLAN.id.toUpperCase()}_${cycle.toUpperCase()}`
  const amount    = cycle === 'monthly' ? PLAN.monthly : PLAN.annual
  const found     = existing.get(lookupKey)
  if (found) {
    assertPriceMatches(found, lookupKey, amount, cycle === 'monthly' ? 'month' : 'year')
    envs[envName] = found.id
    productId ??= typeof found.product === 'string' ? found.product : found.product.id
    console.log(`↻ ${lookupKey} já existe → ${found.id}`)
    continue
  }
  productId ??= await findOrCreateProduct()
  const price = await stripe.prices.create({
    product: productId,
    currency: 'brl',
    unit_amount: amount,
    recurring: { interval: cycle === 'monthly' ? 'month' : 'year' },
    nickname: `Essence ${cycle === 'monthly' ? 'mensal' : 'anual'}`,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  })
  envs[envName] = price.id
  console.log(`✔ ${lookupKey} → ${price.id}`)
}

console.log('\nAdicione ao ambiente correspondente:')
for (const [k, v] of Object.entries(envs)) console.log(`${k}=${v}`)

if (MODE === 'TESTE' && existsSync('.env.local')) {
  const current = readFileSync('.env.local', 'utf8')
  const missing = Object.entries(envs).filter(([k]) => !current.includes(`${k}=`))
  if (missing.length > 0) {
    appendFileSync(
      '.env.local',
      '\n# Essence — gerado por scripts/stripe-add-essence-price.mjs (2026-09-12)\n' +
      missing.map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
    )
    console.log('\n✔ .env.local atualizado com as env vars acima.')
  }
}
