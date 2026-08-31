// scripts/test-marketing-units.mjs
//
// Testes de unidade dos módulos PUROS do sistema editorial (sem DB, sem rede):
//   - workflow.ts  → máquina de status (integridade das transições)
//   - storage.ts   → validação de MIME/tamanho/chave dos uploads de marca
//   - brand-check  → toBrandCheckRules (override via banco)
// Roda com: node scripts/test-marketing-units.mjs   (Node ≥ 22.6, type-stripping)

import {
  canTransitionBrief, assertBriefTransition, nextBriefStatuses,
  canTransitionIdea, isBriefStatus, BRIEF_STATUSES,
} from '../lib/marketing/workflow.ts'
import {
  allowedMimeForKind, signMarketingUpload, confirmMarketingUpload,
  signMarketingAssetUrl, MARKETING_MAX_BYTES,
} from '../lib/marketing/storage.ts'

let failures = 0
function check(name, cond, extra) {
  if (cond) { console.log(`  ok  ${name}`) }
  else { failures++; console.error(`FALHOU ${name}${extra ? ` — ${extra}` : ''}`) }
}
// ── workflow: transições válidas e inválidas ───────────────────────────────────
console.log('workflow (máquina de status):')
check('brief_draft → awaiting_review permitido', canTransitionBrief('brief_draft', 'awaiting_review'))
check('awaiting_review → approved permitido', canTransitionBrief('awaiting_review', 'approved'))
check('awaiting_review → changes_requested permitido', canTransitionBrief('awaiting_review', 'changes_requested'))
check('awaiting_review → rejected permitido', canTransitionBrief('awaiting_review', 'rejected'))
check('approved → ready_for_production permitido', canTransitionBrief('approved', 'ready_for_production'))
check('final_review → ready_to_schedule permitido', canTransitionBrief('final_review', 'ready_to_schedule'))
check('brief_draft → approved BLOQUEADO (pula revisão)', !canTransitionBrief('brief_draft', 'approved'))
check('rejected é terminal', !canTransitionBrief('rejected', 'awaiting_review'))
check('analyzed é terminal', !canTransitionBrief('analyzed', 'published'))
check('approved → published BLOQUEADO (sem produção)', !canTransitionBrief('approved', 'published'))
let e = null
try { assertBriefTransition('brief_draft', 'published') } catch (err) { e = err }
check('assertBriefTransition lança em transição inválida', e instanceof Error)
check('nextBriefStatuses(awaiting_review) lista as 3 saídas',
  nextBriefStatuses('awaiting_review').length === 3)
check('idea open → converted permitido', canTransitionIdea('open', 'converted'))
check('idea converted → open BLOQUEADO', !canTransitionIdea('converted', 'open'))
check('isBriefStatus valida membro', isBriefStatus('approved') && !isBriefStatus('foo'))
check('todas as 12 saídas de status são membros válidos',
  BRIEF_STATUSES.every(s => nextBriefStatuses(s).every(isBriefStatus)))

// ── storage: allowedMimeForKind ────────────────────────────────────────────────
console.log('\nstorage (validação de assets):')
check('logo aceita png/webp', JSON.stringify(allowedMimeForKind('logo')) === JSON.stringify(['image/png', 'image/webp']))
check('logo NÃO aceita jpeg', !(allowedMimeForKind('logo') ?? []).includes('image/jpeg'))
check('video aceita só mp4', JSON.stringify(allowedMimeForKind('video')) === JSON.stringify(['video/mp4']))
check('brand_file aceita pdf', (allowedMimeForKind('brand_file') ?? []).includes('application/pdf'))
check('kind inexistente → null', allowedMimeForKind('telepatia') === null)

// stub do admin client: registra a chamada de createSignedUploadUrl / list / remove
function makeStubAdmin(listResult) {
  const calls = { signed: 0, listed: 0, removed: [] }
  return {
    calls,
    storage: {
      from() {
        return {
          async createSignedUploadUrl(key) { calls.signed++; return { data: { token: 'stub-token', signedUrl: 'https://stub/' + key }, error: null } },
          async list() { calls.listed++; return listResult },
          async remove(keys) { calls.removed.push(...keys); return { data: null, error: null } },
          async createSignedUrl(key, ttl) { return { data: { signedUrl: `https://stub/${key}?ttl=${ttl}` }, error: null } },
        }
      },
    },
  }
}

// sign: MIME permitido
const okSign = await signMarketingUpload(makeStubAdmin(), 'image', 'image/png', 1024)
check('sign aceita MIME permitido e emite key', okSign.ok && /^brand\/image\/\d+-[a-z0-9]{6}\.png$/.test(okSign.result.key), JSON.stringify(okSign))

// sign: MIME bloqueado (gif) — NÃO deve chamar o storage
const stubBad = makeStubAdmin()
const badMime = await signMarketingUpload(stubBad, 'image', 'image/gif', 1024)
check('sign rejeita MIME bloqueado', !badMime.ok && badMime.status === 400)
check('sign NÃO tocou o storage em MIME inválido', stubBad.calls.signed === 0)

// sign: arquivo acima do limite
const tooBig = await signMarketingUpload(makeStubAdmin(), 'image', 'image/png', MARKETING_MAX_BYTES + 1)
check('sign rejeita arquivo acima de 25MB', !tooBig.ok && tooBig.status === 400)

// sign: tamanho zero/negativo
const zero = await signMarketingUpload(makeStubAdmin(), 'image', 'image/png', 0)
check('sign rejeita tamanho 0', !zero.ok)

// confirm: chave inválida (não passa no KEY_RE)
const badKey = await confirmMarketingUpload(makeStubAdmin({ data: [], error: null }), 'image', 'brand/image/../escapar.png')
check('confirm rejeita chave malformada', !badKey.ok && badKey.status === 400)

// confirm: objeto não encontrado
const notFound = await confirmMarketingUpload(
  makeStubAdmin({ data: [], error: null }), 'image', 'brand/image/1700000000000-abcxyz.png')
check('confirm rejeita objeto ausente', !notFound.ok && notFound.status === 400)

// confirm: objeto oversized → rejeita E remove o objeto
const oversizedStub = makeStubAdmin({
  data: [{ name: '1700000000000-abcxyz.png', metadata: { size: MARKETING_MAX_BYTES + 10, mimetype: 'image/png' } }],
  error: null,
})
const oversized = await confirmMarketingUpload(oversizedStub, 'image', 'brand/image/1700000000000-abcxyz.png')
check('confirm rejeita objeto oversized', !oversized.ok)
check('confirm remove objeto inválido do storage', oversizedStub.calls.removed.length === 1)

// confirm: MIME real divergente do kind → rejeita
const wrongMimeStub = makeStubAdmin({
  data: [{ name: '1700000000000-abcxyz.png', metadata: { size: 1024, mimetype: 'application/x-msdownload' } }],
  error: null,
})
const wrongMime = await confirmMarketingUpload(wrongMimeStub, 'image', 'brand/image/1700000000000-abcxyz.png')
check('confirm rejeita MIME real fora do domínio', !wrongMime.ok && wrongMimeStub.calls.removed.length === 1)

// confirm: caminho feliz
const goodStub = makeStubAdmin({
  data: [{ name: '1700000000000-abcxyz.png', metadata: { size: 2048, mimetype: 'image/png' } }],
  error: null,
})
const good = await confirmMarketingUpload(goodStub, 'image', 'brand/image/1700000000000-abcxyz.png')
check('confirm aceita objeto válido', good.ok && good.result.size === 2048)

// signed URL de exibição pede TTL e devolve URL
const signedUrl = await signMarketingAssetUrl(makeStubAdmin(), 'brand/image/1700000000000-abcxyz.png')
check('signMarketingAssetUrl devolve URL assinada com TTL', typeof signedUrl === 'string' && signedUrl.includes('ttl='))
check('signMarketingAssetUrl(null) devolve null', (await signMarketingAssetUrl(makeStubAdmin(), null)) === null)

console.log('')
if (failures > 0) { console.error(`${failures} verificação(ões) falharam`); process.exit(1) }
console.log('Todos os testes de unidade passaram.')
