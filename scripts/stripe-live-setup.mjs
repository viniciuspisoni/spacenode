// ── Setup LIVE do Stripe — rodar depois da ativação da conta ─────────────────
//
// Replica em modo live o que foi validado em teste (2026-07-15): catálogo
// v2.1 (4 planos × mensal/anual + 3 Lumens), Billing Portal e webhook — e
// grava os envs de produção na Vercel com o único método confiável (--value).
//
// RE-RUN é seguro: preços/portal existentes são REUTILIZADOS (nada duplica) e
// o webhook endpoint é recriado (o whsec_ só existe na resposta de criação —
// rotacionar é a única forma de recuperá-lo após uma falha parcial de envs).
//
// USO (PowerShell, na raiz do repo, com `npx vercel whoami` autenticado):
//   $env:STRIPE_LIVE_SECRET_KEY = "sk_live_…"   # do Dashboard, modo live
//   node scripts/stripe-live-setup.mjs
//   Remove-Item Env:STRIPE_LIVE_SECRET_KEY
//
// O script NUNCA imprime segredos e NÃO altera o .env.local (dev fica em teste).
// Valores espelham lib/plans.ts e lib/lumens.ts — se a tabela de preços mudar,
// atualizar aqui junto.

import { spawnSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Stripe = require('stripe')

const KEY = process.env.STRIPE_LIVE_SECRET_KEY
if (!KEY || !/^(sk|rk)_live_/.test(KEY)) {
  console.error('✗ Defina STRIPE_LIVE_SECRET_KEY com uma chave LIVE (sk_live_…). Abortando.')
  process.exit(1)
}
const stripe = new Stripe(KEY)

// ── Pré-checagens ─────────────────────────────────────────────────────────────
const account = await stripe.accounts.retrieve()
if (!account.charges_enabled) {
  console.error('✗ A conta ainda não está com cobranças habilitadas (charges_enabled=false).')
  console.error('  Conclua a ativação no Dashboard (KYB) e rode de novo.')
  process.exit(1)
}
// ── Catálogo v2.1 ─────────────────────────────────────────────────────────────
const PLANS = [
  { id: 'starter', name: 'SPACENODE Starter', nodes: 750,  monthly: 8900,  annual: 89000  },
  { id: 'pro',     name: 'SPACENODE Pro',     nodes: 1800, monthly: 19900, annual: 199000 },
  { id: 'studio',  name: 'SPACENODE Studio',  nodes: 3500, monthly: 34900, annual: 349000 },
  { id: 'office',  name: 'SPACENODE Office',  nodes: 8000, monthly: 69900, annual: 699000 },
]
const LUMENS = [
  { size: 500,  name: 'SPACENODE Lumen 500',   amount: 8900  },
  { size: 1500, name: 'SPACENODE Lumen 1.500', amount: 21900 },
  { size: 4000, name: 'SPACENODE Lumen 4.000', amount: 49900 },
]

const envs = {}

// Preços já criados num run anterior são reutilizados via lookup_key
// (lookup_keys aceita no máx. 10 por chamada — paginamos).
const LOOKUP_KEYS = [
  ...PLANS.flatMap(p => [`${p.id}_monthly`, `${p.id}_annual`]),
  ...LUMENS.map(l => `lumen_${l.size}`),
]
const existingPrices = new Map()
for (let i = 0; i < LOOKUP_KEYS.length; i += 10) {
  const page = await stripe.prices.list({
    lookup_keys: LOOKUP_KEYS.slice(i, i + 10),
    active: true,
    limit: 100,
  })
  for (const pr of page.data) existingPrices.set(pr.lookup_key, pr)
}

// Preço reutilizado que diverge do catálogo aborta em vez de herdar em
// silêncio: se a tabela mudou, arquive o preço antigo no Dashboard (o
// lookup_key transfere na recriação) e rode de novo.
function assertPriceMatches(found, lookupKey, amount, interval /* null = avulso */) {
  const foundInterval = found.recurring?.interval ?? null
  if (found.unit_amount === amount && found.currency === 'brl' && foundInterval === interval) return
  console.error(
    `✗ ${lookupKey} já existe (${found.id}) mas DIVERGE do catálogo: ` +
    `${found.unit_amount} ${found.currency} ${foundInterval ?? 'avulso'} ≠ ${amount} brl ${interval ?? 'avulso'}.`
  )
  console.error('  Arquive o preço antigo no Dashboard e rode de novo.')
  process.exit(1)
}

// Reuso de produto por metadata cobre o run anterior que caiu entre criar o
// produto e criar o preço (evita produto duplicado no catálogo live).
async function findOrCreateProduct(query, params) {
  const hit = await stripe.products.search({ query, limit: 1 })
  if (hit.data.length > 0) return hit.data[0].id
  const product = await stripe.products.create(params)
  return product.id
}

for (const p of PLANS) {
  let productId = null
  for (const cycle of ['monthly', 'annual']) {
    const lookupKey = `${p.id}_${cycle}`
    const envName   = `STRIPE_PRICE_ID_${p.id.toUpperCase()}_${cycle.toUpperCase()}`
    const amount    = cycle === 'monthly' ? p.monthly : p.annual
    const found     = existingPrices.get(lookupKey)
    if (found) {
      assertPriceMatches(found, lookupKey, amount, cycle === 'monthly' ? 'month' : 'year')
      envs[envName] = found.id
      productId ??= typeof found.product === 'string' ? found.product : found.product.id
      console.log(`↻ ${lookupKey} já existe → ${found.id}`)
      continue
    }
    if (!productId) {
      productId = await findOrCreateProduct(
        `active:'true' AND metadata['plan_id']:'${p.id}' AND metadata['catalog']:'v2.1'`,
        {
          name: p.name,
          description: `Plano ${p.name.replace('SPACENODE ', '')} — ${p.nodes.toLocaleString('pt-BR')} nodes/mês`,
          metadata: { plan_id: p.id, nodes: String(p.nodes), catalog: 'v2.1' },
        }
      )
    }
    const price = await stripe.prices.create({
      product: productId,
      currency: 'brl',
      unit_amount: amount,
      recurring: { interval: cycle === 'monthly' ? 'month' : 'year' },
      nickname: `${p.name.replace('SPACENODE ', '')} ${cycle === 'monthly' ? 'mensal' : 'anual'}`,
      lookup_key: lookupKey,
      transfer_lookup_key: true,
    })
    envs[envName] = price.id
    console.log(`✔ ${price.lookup_key} → ${price.id}`)
  }
}

for (const l of LUMENS) {
  const lookupKey = `lumen_${l.size}`
  const envName   = `STRIPE_PRICE_ID_LUMEN_${l.size}`
  const found     = existingPrices.get(lookupKey)
  if (found) {
    assertPriceMatches(found, lookupKey, l.amount, null)
    envs[envName] = found.id
    console.log(`↻ ${lookupKey} já existe → ${found.id}`)
    continue
  }
  const productId = await findOrCreateProduct(
    `active:'true' AND metadata['pack_size']:'${l.size}' AND metadata['catalog']:'v2.1'`,
    {
      name: l.name,
      description: `${l.size.toLocaleString('pt-BR')} nodes avulsos — validade de 90 dias`,
      metadata: { pack_size: String(l.size), validity_days: '90', catalog: 'v2.1' },
    }
  )
  const price = await stripe.prices.create({
    product: productId,
    currency: 'brl',
    unit_amount: l.amount,
    nickname: `Lumen ${l.size.toLocaleString('pt-BR')}`,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  })
  envs[envName] = price.id
  console.log(`✔ ${lookupKey} → ${price.id}`)
}

// ── Billing Portal (reutiliza config de run anterior pelo headline) ──────────
const PORTAL_HEADLINE = 'SPACENODE — gerencie sua assinatura'
const portalConfigs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
let portal = portalConfigs.data.find(c => c.business_profile?.headline === PORTAL_HEADLINE)
if (portal) {
  console.log(`↻ portal já existe → ${portal.id}`)
} else {
  portal = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: PORTAL_HEADLINE,
      privacy_policy_url: 'https://spacenode.app/privacidade',
      terms_of_service_url: 'https://spacenode.app/termos',
    },
    default_return_url: 'https://spacenode.app/app/billing',
    features: {
      invoice_history:       { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
    },
  })
  console.log(`✔ portal → ${portal.id}`)
}
envs.STRIPE_PORTAL_CONFIG_ID = portal.id

// ── Webhook (secret capturado só na criação — vai direto pra Vercel) ─────────
// O whsec_ antigo não é recuperável via API, então re-run rotaciona o endpoint.
// Ordem do cutover: cria o NOVO primeiro (nenhum evento fica sem destinatário),
// grava envs, remove os antigos e só então redeploya. Se a gravação de envs
// falhar, os endpoints antigos seguem intactos e a prod continua saudável.
// Num re-run com tráfego live, as entregas do endpoint novo falham (400) até o
// redeploy terminar — o Stripe retenta e se recupera sozinho, mas evite
// re-rodar à toa em produção estável.
const WEBHOOK_URL = 'https://spacenode.app/api/stripe/webhook'
const priorHooks = (await stripe.webhookEndpoints.list({ limit: 100 })).data
  .filter(h => h.url === WEBHOOK_URL)
const webhook = await stripe.webhookEndpoints.create({
  url: WEBHOOK_URL,
  enabled_events: ['checkout.session.completed', 'invoice.paid', 'customer.subscription.deleted'],
  description: 'SPACENODE produção (live)',
})
console.log(`✔ webhook → ${webhook.id} (secret não exibido)`)

// ── Envs de produção na Vercel ────────────────────────────────────────────────
// Único método não-interativo confiável: --value … --yes (stdin grava VAZIO!).
function setEnv(name, value, sensitive = false) {
  spawnSync('npx', ['vercel', 'env', 'rm', name, 'production', '-y'], { shell: true, stdio: 'ignore' })
  const args = ['vercel', 'env', 'add', name, 'production', '--value', value, '--yes']
  if (sensitive) args.push('--sensitive')
  const r = spawnSync('npx', args, { shell: true, stdio: 'ignore' })
  console.log((r.status === 0 ? '✔ env ' : '✗ env FALHOU ') + name)
  return r.status === 0
}

let ok = true
ok = setEnv('STRIPE_SECRET_KEY', KEY, true) && ok
ok = setEnv('STRIPE_WEBHOOK_SECRET', webhook.secret, true) && ok
ok = setEnv('NEXT_PUBLIC_APP_URL', 'https://spacenode.app') && ok
for (const [k, v] of Object.entries(envs)) ok = setEnv(k, v) && ok

if (!ok) {
  console.error('✗ Algum env falhou — NÃO redeploye. Confira com `npx vercel env ls production`')
  console.error('  e rode o script de novo (re-run é seguro: reutiliza catálogo/portal e rotaciona o webhook;')
  console.error('  os endpoints antigos ficaram intactos, então a prod atual segue funcionando).')
  process.exit(1)
}

// Envs gravados: agora sim os endpoints antigos podem sair de cena.
for (const h of priorHooks) {
  await stripe.webhookEndpoints.del(h.id)
  console.log(`↻ webhook antigo removido (${h.id})`)
}

// ── Redeploy ──────────────────────────────────────────────────────────────────
console.log('… redeployando produção')
const rd = spawnSync('npx', ['vercel', 'redeploy', 'spacenode.app'], { shell: true, stdio: 'inherit' })
if (rd.status !== 0) { console.error('✗ Redeploy falhou — rode `npx vercel redeploy spacenode.app`.'); process.exit(1) }

console.log('\n✅ Stripe LIVE configurado. Próximo passo: pedir ao Claude a verificação')
console.log('   pós-live (sonda do checkout, conferência do catálogo e do webhook).')
console.log('   Lembre de limpar a chave da sessão: Remove-Item Env:STRIPE_LIVE_SECRET_KEY')
