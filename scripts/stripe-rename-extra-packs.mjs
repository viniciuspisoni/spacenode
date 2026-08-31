// Renomeia os produtos Stripe dos packs avulsos: "Lumen X" → "Nodes extras — Pack X".
//
// O nome do Product é o que aparece no Checkout e nos RECIBOS por e-mail do
// Stripe — é a última superfície onde "Lumen" sobreviveria após a unificação
// de 2026-08-31. Idempotente: roda quantas vezes quiser.
//
// Uso (o modo — teste ou live — vem da STRIPE_SECRET_KEY carregada):
//   node --env-file=.env.local scripts/stripe-rename-extra-packs.mjs
//
// Para produção, rodar com a chave live (ex.: env exportada no shell do dono):
//   STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_ID_LUMEN_500=price_... \
//   STRIPE_PRICE_ID_LUMEN_1500=price_... STRIPE_PRICE_ID_LUMEN_4000=price_... \
//   node scripts/stripe-rename-extra-packs.mjs

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('STRIPE_SECRET_KEY ausente — carregue o .env.local (--env-file) ou exporte a env.')
  process.exit(1)
}
const MODE = KEY.startsWith('sk_live') ? 'LIVE' : 'TESTE'

// Prefixo "SPACENODE" segue a convenção dos demais produtos do catálogo.
const PACKS = [
  { size: 500,  name: 'SPACENODE Nodes extras 500',   desc: '500 nodes avulsos, sem validade.' },
  { size: 1500, name: 'SPACENODE Nodes extras 1.500', desc: '1.500 nodes avulsos, sem validade.' },
  { size: 4000, name: 'SPACENODE Nodes extras 4.000', desc: '4.000 nodes avulsos, sem validade.' },
]

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${path}: ${json.error?.message ?? res.status}`)
  return json
}

console.log(`Modo: ${MODE}\n`)
let changed = 0
for (const pack of PACKS) {
  const priceId = process.env[`STRIPE_PRICE_ID_LUMEN_${pack.size}`]
  if (!priceId) {
    console.log(`• ${pack.size}: STRIPE_PRICE_ID_LUMEN_${pack.size} vazio neste ambiente — pulando`)
    continue
  }
  const price   = await stripe(`prices/${priceId}`)
  const prodId  = typeof price.product === 'string' ? price.product : price.product?.id
  const product = await stripe(`products/${prodId}`)
  if (product.name === pack.name && product.description === pack.desc) {
    console.log(`• ${pack.size}: já está como "${pack.name}" — ok`)
    continue
  }
  await stripe(`products/${prodId}`, { name: pack.name, description: pack.desc })
  console.log(`• ${pack.size}: "${product.name}" → "${pack.name}"`)
  changed++
}
console.log(`\nConcluído (${changed} produto${changed === 1 ? '' : 's'} renomeado${changed === 1 ? '' : 's'}).`)
