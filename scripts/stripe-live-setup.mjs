// ── Setup LIVE do Stripe — roda UMA vez, depois da ativação da conta ─────────
//
// Replica em modo live o que foi validado em teste (2026-07-15): catálogo
// v2.1 (4 planos × mensal/anual + 3 Lumens), Billing Portal e webhook — e
// grava os envs de produção na Vercel com o único método confiável (--value).
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
const existing = await stripe.products.search({ query: "active:'true' AND metadata['catalog']:'v2.1'", limit: 1 })
if (existing.data.length > 0) {
  console.error('✗ Já existe catálogo v2.1 em live (' + existing.data[0].id + '). Abortando para não duplicar.')
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

for (const p of PLANS) {
  const product = await stripe.products.create({
    name: p.name,
    description: `Plano ${p.name.replace('SPACENODE ', '')} — ${p.nodes.toLocaleString('pt-BR')} nodes/mês`,
    metadata: { plan_id: p.id, nodes: String(p.nodes), catalog: 'v2.1' },
  })
  for (const cycle of ['monthly', 'annual']) {
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'brl',
      unit_amount: cycle === 'monthly' ? p.monthly : p.annual,
      recurring: { interval: cycle === 'monthly' ? 'month' : 'year' },
      nickname: `${p.name.replace('SPACENODE ', '')} ${cycle === 'monthly' ? 'mensal' : 'anual'}`,
      lookup_key: `${p.id}_${cycle}`,
    })
    envs[`STRIPE_PRICE_ID_${p.id.toUpperCase()}_${cycle.toUpperCase()}`] = price.id
    console.log(`✔ ${price.lookup_key} → ${price.id}`)
  }
}

for (const l of LUMENS) {
  const product = await stripe.products.create({
    name: l.name,
    description: `${l.size.toLocaleString('pt-BR')} nodes avulsos — validade de 90 dias`,
    metadata: { pack_size: String(l.size), validity_days: '90', catalog: 'v2.1' },
  })
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'brl',
    unit_amount: l.amount,
    nickname: `Lumen ${l.size.toLocaleString('pt-BR')}`,
    lookup_key: `lumen_${l.size}`,
  })
  envs[`STRIPE_PRICE_ID_LUMEN_${l.size}`] = price.id
  console.log(`✔ lumen_${l.size} → ${price.id}`)
}

// ── Billing Portal ────────────────────────────────────────────────────────────
const portal = await stripe.billingPortal.configurations.create({
  business_profile: {
    headline: 'SPACENODE — gerencie sua assinatura',
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
envs.STRIPE_PORTAL_CONFIG_ID = portal.id
console.log(`✔ portal → ${portal.id}`)

// ── Webhook (secret capturado só na criação — vai direto pra Vercel) ─────────
const webhook = await stripe.webhookEndpoints.create({
  url: 'https://spacenode.app/api/stripe/webhook',
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
for (const [k, v] of Object.entries(envs)) ok = setEnv(k, v) && ok

if (!ok) {
  console.error('✗ Algum env falhou — NÃO redeploye. Confira com `npx vercel env ls production`.')
  process.exit(1)
}

// ── Redeploy ──────────────────────────────────────────────────────────────────
console.log('… redeployando produção')
const rd = spawnSync('npx', ['vercel', 'redeploy', 'spacenode.app'], { shell: true, stdio: 'inherit' })
if (rd.status !== 0) { console.error('✗ Redeploy falhou — rode `npx vercel redeploy spacenode.app`.'); process.exit(1) }

console.log('\n✅ Stripe LIVE configurado. Próximo passo: pedir ao Claude a verificação')
console.log('   pós-live (sonda do checkout, conferência do catálogo e do webhook).')
console.log('   Lembre de limpar a chave da sessão: Remove-Item Env:STRIPE_LIVE_SECRET_KEY')
