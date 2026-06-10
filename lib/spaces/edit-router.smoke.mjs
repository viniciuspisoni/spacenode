// Smoke test do editRouter (rodar com: node lib/spaces/edit-router.smoke.mjs).
// JS puro de propósito: fica FORA do programa TS (tsconfig só inclui .ts/.tsx/.mts),
// então não polui `tsc --noEmit`, mas ainda valida o roteamento contra a spec.

import {
  routeEdit,
  classifyPromptComplexity,
  editButtonLabel,
  editChargeExplanation,
  endpointProvider,
  estimateProviderCostUsd,
} from './edit-router.ts'

let passed = 0
let failed = 0

function check(name, cond, detail) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`✗ FAIL: ${name}`, detail !== undefined ? detail : '')
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCO 1 — roteamento LEGADO (Flux), preservado atrás de EDIT_GOOGLE_FIRST=0.
// As flags são lidas POR CHAMADA, então dá pra alternar no mesmo processo.
// ════════════════════════════════════════════════════════════════════════════
process.env.EDIT_GOOGLE_FIRST = '0'
delete process.env.EDIT_FLUX_FALLBACK
delete process.env.VERTEX_IMAGEN_ENABLED

// Base: imagem do Spacenode, máscara pequena, prompt simples, não-4K.
function base(over = {}) {
  return {
    tool:                   'remove',
    prompt:                 'remover o poste',
    hasMask:                true,
    maskAreaRatio:          0.08,
    imageMegapixels:        2,
    outputResolution:       'current',
    preservationMode:       'max',
    isGeneratedBySpacenode: true,
    freeFixesUsedForImage:  0,
    monthlyFreeFixesUsed:   0,
    monthlyFreeFixesLimit:  10,
    userPlan:               'pro',
    ...over,
  }
}

// 1) Correção grátis canônica (remove → fill dedicado, per-image, SEM crop)
{
  const r = routeEdit(base())
  check('free fix → 0 nodes', r.costNodes === 0, r)
  check('free fix → isFreeFix', r.isFreeFix === true, r)
  check('free fix remove → flux-pro/v1/fill', r.endpoint === 'fal-ai/flux-pro/v1/fill', r)
  check('free fix remove → no crop (fill é per-image)', r.shouldUseCrop === false, r)
}

// 1b) fix_detail grátis → flux-kontext-lora (inpaint por MP, COM crop)
{
  const r = routeEdit(base({ tool: 'fix_detail', prompt: 'corrigir artefato' }))
  check('fix_detail free → 0 nodes', r.costNodes === 0, r)
  check('fix_detail free → flux-kontext-lora', r.endpoint === 'fal-ai/flux-kontext-lora/inpaint', r)
  check('fix_detail free → crop on', r.shouldUseCrop === true, r)
  check('fix_detail free → maxCropMegapixels set', typeof r.maxCropMegapixels === 'number', r)
}

// 2) Grátis bloqueada por teto mensal → correção rápida paga (1 node)
{
  const r = routeEdit(base({ monthlyFreeFixesUsed: 10, monthlyFreeFixesLimit: 10 }))
  check('monthly limit hit → 1 node', r.costNodes === 1, r)
  check('monthly limit hit → not free', r.isFreeFix === false, r)
  check('monthly limit hit remove → flux-pro/v1/fill', r.endpoint === 'fal-ai/flux-pro/v1/fill', r)
}

// 3) Grátis bloqueada porque a imagem já usou grátis → 1 node
{
  const r = routeEdit(base({ freeFixesUsedForImage: 1 }))
  check('image already used free → 1 node', r.costNodes === 1, r)
  check('image already used free → not free', r.isFreeFix === false, r)
}

// 4) Imagem NÃO gerada pelo Spacenode (fix tool, máscara pequena) → localizada 2 nodes
{
  const r = routeEdit(base({ isGeneratedBySpacenode: false }))
  check('not-spacenode remove → 2 nodes', r.costNodes === 2, r)
  check('not-spacenode remove → flux-pro/v1/fill', r.endpoint === 'fal-ai/flux-pro/v1/fill', r)
}

// 5) 4K (fix tool, máscara pequena, Spacenode) → não entra na faixa rápida → localizada 2 nodes
{
  const r = routeEdit(base({ outputResolution: '4K' }))
  check('4K small fix → 2 nodes', r.costNodes === 2, r)
  check('4K → never free', r.isFreeFix === false, r)
}

// 6) Prompt complexo (mesmo com fix + máscara pequena) → avançada 4 nodes, flux-pro/kontext
{
  const r = routeEdit(base({ prompt: 'transforme completamente o ambiente em estilo industrial, troque o piso e mude a iluminação também' }))
  check('complex → 4 nodes', r.costNodes === 4, r)
  check('complex → flux-pro/kontext', r.endpoint === 'fal-ai/flux-pro/kontext', r)
  check('complex → not free', r.isFreeFix === false, r)
}

// 7) Edição localizada (material → nano-banana/edit, editor forte) → 2 nodes
{
  const r = routeEdit(base({ tool: 'material', prompt: 'trocar a parede por concreto aparente' }))
  check('material small → 2 nodes', r.costNodes === 2, r)
  check('material small → nano-banana/edit', r.endpoint === 'fal-ai/nano-banana/edit', r)
  check('material small → crop off', r.shouldUseCrop === false, r)
}

// 7b) replace (usa reference real) continua no flux-kontext-lora com crop
{
  const r = routeEdit(base({ tool: 'replace', prompt: 'trocar a cadeira' }))
  check('replace small → flux-kontext-lora', r.endpoint === 'fal-ai/flux-kontext-lora/inpaint', r)
  check('replace small → crop on', r.shouldUseCrop === true, r)
}

// 8) Edição média (área 0.30) → 3 nodes, nano-banana/edit
{
  const r = routeEdit(base({ tool: 'material', maskAreaRatio: 0.30, prompt: 'trocar revestimento' }))
  check('medium mask → 3 nodes', r.costNodes === 3, r)
  check('medium mask → nano-banana/edit', r.endpoint === 'fal-ai/nano-banana/edit', r)
  check('medium mask → crop off', r.shouldUseCrop === false, r)
}

// 8b) Remoção de área média → flux-pro/v1/fill (3 nodes)
{
  const r = routeEdit(base({ maskAreaRatio: 0.30 }))
  check('remove medium → 3 nodes', r.costNodes === 3, r)
  check('remove medium → flux-pro/v1/fill', r.endpoint === 'fal-ai/flux-pro/v1/fill', r)
}

// 9) Ferramenta global (lighting) → 4 nodes, flux-pro/kontext
{
  const r = routeEdit(base({ tool: 'lighting', prompt: 'iluminação quente indireta' }))
  check('lighting → 4 nodes', r.costNodes === 4, r)
  check('lighting → flux-pro/kontext', r.endpoint === 'fal-ai/flux-pro/kontext', r)
  check('lighting → never free', r.isFreeFix === false, r)
}

// 10) Paisagismo → 4 nodes, flux-pro/kontext (e nunca grátis)
{
  const r = routeEdit(base({ tool: 'landscaping', prompt: 'jardim minimalista' }))
  check('landscaping → 4 nodes', r.costNodes === 4, r)
  check('landscaping → never free', r.isFreeFix === false, r)
}

// 11) Máscara grande (0.60) → 4 nodes, flux-pro/kontext
{
  const r = routeEdit(base({ tool: 'material', maskAreaRatio: 0.60, prompt: 'trocar parede' }))
  check('large mask → 4 nodes', r.costNodes === 4, r)
  check('large mask → flux-pro/kontext', r.endpoint === 'fal-ai/flux-pro/kontext', r)
}

// 12) Sem máscara → 4 nodes, flux-pro/kontext (nunca grátis)
{
  const r = routeEdit(base({ hasMask: false, tool: 'material', prompt: 'trocar parede' }))
  check('no mask → 4 nodes', r.costNodes === 4, r)
  check('no mask → never free', r.isFreeFix === false, r)
}

// 13) Premium explícito (não-4K, máscara pequena) → 5 nodes, gemini-3-pro
{
  const r = routeEdit(base({ userSelectedPremium: true }))
  check('premium → 5 nodes', r.costNodes === 5, r)
  check('premium → gemini-3-pro', r.endpoint === 'fal-ai/gemini-3-pro-image-preview/edit', r)
}

// 14) Premium + 4K → 6 nodes
{
  const r = routeEdit(base({ userSelectedPremium: true, outputResolution: '4K' }))
  check('premium 4K → 6 nodes', r.costNodes === 6, r)
}

// 15) classifyPromptComplexity
check('complexity: simple', classifyPromptComplexity('remover o carro') === 'simple')
check('complexity: complex (style+multi)', classifyPromptComplexity('transforme completamente em estilo industrial e mude a iluminação e adicione plantas também') === 'complex')
check('complexity: empty → simple', classifyPromptComplexity('') === 'simple')

// 16) UI helpers
check('label: free', editButtonLabel(routeEdit(base())) === 'Corrigir grátis')
check('label: 2 nodes', editButtonLabel(routeEdit(base({ tool: 'material', prompt: 'trocar parede' }))) === 'Gerar edição — 2 nodes')
check('label: advanced 4', editButtonLabel(routeEdit(base({ tool: 'lighting' }))) === 'Gerar edição avançada — 4 nodes')
check('label: premium 6', editButtonLabel(routeEdit(base({ userSelectedPremium: true, outputResolution: '4K' }))) === 'Gerar premium — 6 nodes')
check('label: quick 1 node', editButtonLabel(routeEdit(base({ freeFixesUsedForImage: 1 }))) === 'Corrigir — 1 node')
check('explain: free', editChargeExplanation(routeEdit(base())) === 'Pequena correção com máscara. Esta edição será gratuita.')
check('explain: localized', editChargeExplanation(routeEdit(base({ tool: 'material', prompt: 'trocar parede' }))) === 'Edição localizada usando modo econômico.')
check('explain: advanced', editChargeExplanation(routeEdit(base({ tool: 'lighting' }))) === 'Edição ampla. Será usado um modelo avançado para preservar qualidade.')

// 17) endpointProvider
check('provider: fal', endpointProvider('fal-ai/nano-banana/edit') === 'fal')
check('provider: vertex', endpointProvider('vertex/imagen-edit') === 'vertex')
check('provider: google', endpointProvider('google/gemini-3.1-flash-image') === 'google')

// 18) estimateProviderCostUsd
check('cost: per_image nano-banana', estimateProviderCostUsd('fal-ai/nano-banana/edit', 4) === 0.039)
check('cost: per_mp flux-kontext-lora 2MP', estimateProviderCostUsd('fal-ai/flux-kontext-lora/inpaint', 2) === 0.07)
check('cost: per_image flux-pro/v1/fill', estimateProviderCostUsd('fal-ai/flux-pro/v1/fill', 5) === 0.04)

// 19) Referências (caso central): fix_detail + consistency_reference → nano-banana
{
  const r = routeEdit(base({ tool: 'fix_detail', prompt: 'manter consistente com a vista mestre',
    references: [{ id: 'm', url: 'https://x/master.jpg', role: 'consistency_reference', source: 'project' }] }))
  check('consistency ref → nano-banana/edit', r.endpoint === 'fal-ai/nano-banana/edit', r)
}
// 20) replace + referência continua no flux-kontext-lora (usa reference_image_url)
{
  const r = routeEdit(base({ tool: 'replace', prompt: 'trocar a cadeira',
    references: [{ id: 'o', url: 'https://x/obj.jpg', role: 'object_reference', source: 'upload' }] }))
  check('replace + ref → flux-kontext-lora', r.endpoint === 'fal-ai/flux-kontext-lora/inpaint', r)
}
// 21) material + referência de TEXTURA → inpaint ANCORADO (surface targeting):
//     a máscara é restrição rígida; nano-banana (sem ref) aplicava em outra superfície.
{
  const r = routeEdit(base({ tool: 'material', prompt: 'aplicar este porcelanato',
    references: [{ id: 't', url: 'https://x/tex.jpg', role: 'material_texture', source: 'upload' }] }))
  check('material + ref → flux-kontext-lora (anchored)', r.endpoint === 'fal-ai/flux-kontext-lora/inpaint', r)
  check('material + ref → crop on (anchored inpaint)', r.shouldUseCrop === true, r)
  check('material + ref → 2 nodes', r.costNodes === 2, r)
}
// 22) material SEM referência segue no nano-banana (editor por instrução)
{
  const r = routeEdit(base({ tool: 'material', prompt: 'deixar a parede de concreto' }))
  check('material no-ref → nano-banana/edit', r.endpoint === 'fal-ai/nano-banana/edit', r)
}
// 23) material + ref com máscara MÉDIA (18–40%) também ancora no inpaint (Bug B:
//     o tier médio antes cravava nano-banana e ignorava a referência).
{
  const r = routeEdit(base({ tool: 'material', maskAreaRatio: 0.30, prompt: 'aplicar este porcelanato',
    references: [{ id: 't', url: 'https://x/tex.jpg', role: 'material_texture', source: 'upload' }] }))
  check('material+ref medium → flux-kontext-lora', r.endpoint === 'fal-ai/flux-kontext-lora/inpaint', r)
  check('material+ref medium → 3 nodes', r.costNodes === 3, r)
  check('material+ref medium → crop on', r.shouldUseCrop === true, r)
}
// 24) material SEM ref com máscara média continua no nano-banana
{
  const r = routeEdit(base({ tool: 'material', maskAreaRatio: 0.30, prompt: 'parede de concreto' }))
  check('material no-ref medium → nano-banana/edit', r.endpoint === 'fal-ai/nano-banana/edit', r)
}

// 25) P1-4: referência NÃO-âncora (imagem original) não liga o inpaint ancorado —
//     material + original_image (só) fica no nano-banana, não reproduz a superfície antiga.
{
  const r = routeEdit(base({ tool: 'material', prompt: 'trocar o piso',
    references: [{ id: 'o', url: 'https://x/orig.jpg', role: 'original_image', source: 'original' }] }))
  check('legacy: material + ref não-âncora → nano-banana', r.endpoint === 'fal-ai/nano-banana/edit', r)
}

// ════════════════════════════════════════════════════════════════════════════
// BLOCO 2 — roteamento GOOGLE-FIRST (default em produção: flag ausente).
// ════════════════════════════════════════════════════════════════════════════
delete process.env.EDIT_GOOGLE_FIRST

// G1) Correção grátis canônica → 0 nodes, Nano Banana 2 mascarado (Vertex off)
{
  const r = routeEdit(base())
  check('GF free fix → 0 nodes', r.costNodes === 0, r)
  check('GF free fix → isFreeFix', r.isFreeFix === true, r)
  check('GF free fix → nano-banana-2', r.endpoint === 'fal-ai/nano-banana-2/edit', r)
  check('GF free fix → no crop (per-image)', r.shouldUseCrop === false, r)
  check('GF retryPolicy → 1 retry grátis', r.retryPolicy.maxAutoRetries === 1 && r.retryPolicy.freeRetry === true, r)
  check('GF retryPolicy → sem fallback Flux (flag off)', r.retryPolicy.fallback === null, r)
}

// G2) P0 corrigido: prompt complexo COM máscara fica mask-aware (nunca Kontext)
{
  const r = routeEdit(base({ tool: 'material',
    prompt: 'transforme completamente o ambiente em estilo industrial, troque o piso e mude a iluminação também' }))
  check('GF complex+mask → 4 nodes', r.costNodes === 4, r)
  check('GF complex+mask → nano-banana-2 (mask-aware)', r.endpoint === 'fal-ai/nano-banana-2/edit', r)
}

// G3) Máscara grande COM máscara → mask-aware (não Kontext)
{
  const r = routeEdit(base({ tool: 'material', maskAreaRatio: 0.60, prompt: 'trocar parede' }))
  check('GF large mask → 4 nodes', r.costNodes === 4, r)
  check('GF large mask → nano-banana-2', r.endpoint === 'fal-ai/nano-banana-2/edit', r)
}

// G4) SEM máscara → edição conversacional Gemini 3.1 Flash (instrução)
{
  const r = routeEdit(base({ hasMask: false, tool: 'style', prompt: 'mais escandinavo' }))
  check('GF no mask → 4 nodes', r.costNodes === 4, r)
  check('GF no mask → gemini-3.1-flash instruct', r.endpoint === 'google/gemini-3.1-flash-image', r)
}

// G5) Variação controlada (sem máscara) → instrução
{
  const r = routeEdit(base({ hasMask: false, tool: 'variation', prompt: 'variar decoração mantendo layout' }))
  check('GF variation → gemini-3.1-flash instruct', r.endpoint === 'google/gemini-3.1-flash-image', r)
}

// G6) Premium mascarado → Nano Banana Pro (5 nodes); premium sem máscara → 6
{
  const r = routeEdit(base({ userSelectedPremium: true, tool: 'material', prompt: 'trocar piso' }))
  check('GF premium masked → 5 nodes', r.costNodes === 5, r)
  check('GF premium masked → nano-banana-pro', r.endpoint === 'fal-ai/nano-banana-pro/edit', r)
  const r2 = routeEdit(base({ userSelectedPremium: true, hasMask: false, tool: 'variation', prompt: 'variar' }))
  check('GF premium no-mask → 6 nodes', r2.costNodes === 6, r2)
  check('GF premium no-mask → gemini-3-pro instruct', r2.endpoint === 'google/gemini-3-pro-image', r2)
}

// G7) Referência de textura → NB2 multi-imagem (não Flux)
{
  const r = routeEdit(base({ tool: 'material', prompt: 'aplicar este porcelanato',
    references: [{ id: 't', url: 'https://x/tex.jpg', role: 'material_texture', source: 'upload' }] }))
  check('GF material+ref → nano-banana-2', r.endpoint === 'fal-ai/nano-banana-2/edit', r)
  check('GF material+ref → 2 nodes', r.costNodes === 2, r)
}

// G8) Vertex ligado → inpaint preciso para remove/material SEM referência (com crop)
{
  process.env.VERTEX_IMAGEN_ENABLED = '1'
  const r = routeEdit(base())
  check('GF vertex on remove → vertex/imagen-edit', r.endpoint === 'vertex/imagen-edit', r)
  check('GF vertex on remove → crop on', r.shouldUseCrop === true, r)
  const rRef = routeEdit(base({ tool: 'material', prompt: 'aplicar porcelanato',
    references: [{ id: 't', url: 'https://x/t.jpg', role: 'material_texture', source: 'upload' }] }))
  check('GF vertex on + ref → nano-banana-2 (multi-imagem)', rRef.endpoint === 'fal-ai/nano-banana-2/edit', rRef)
  delete process.env.VERTEX_IMAGEN_ENABLED
}

// G9) Fallback Flux do retry — só atrás de EDIT_FLUX_FALLBACK=1
{
  process.env.EDIT_FLUX_FALLBACK = '1'
  const r = routeEdit(base()) // remove
  check('GF flux fallback remove → flux-pro/v1/fill', r.retryPolicy.fallback?.endpoint === 'fal-ai/flux-pro/v1/fill', r.retryPolicy)
  const rm = routeEdit(base({ tool: 'material', prompt: 'trocar piso' }))
  check('GF flux fallback material → flux-kontext-lora', rm.retryPolicy.fallback?.endpoint === 'fal-ai/flux-kontext-lora/inpaint', rm.retryPolicy)
  check('GF flux fallback material → crop on no fallback', rm.retryPolicy.fallback?.shouldUseCrop === true, rm.retryPolicy)
  const rn = routeEdit(base({ hasMask: false, tool: 'style', prompt: 'mais claro' }))
  check('GF flux fallback no-mask → flux-pro/kontext', rn.retryPolicy.fallback?.endpoint === 'fal-ai/flux-pro/kontext', rn.retryPolicy)
  check('GF fallback não re-tenta (maxAutoRetries 0)', rn.retryPolicy.fallback?.retryPolicy.maxAutoRetries === 0, rn.retryPolicy)
  delete process.env.EDIT_FLUX_FALLBACK
}

// G10) Labels premium cobrem os endpoints novos
{
  const label = editButtonLabel(routeEdit(base({ userSelectedPremium: true, tool: 'material', prompt: 'piso' })))
  check('GF label premium NB Pro', label === 'Gerar premium — 5 nodes', label)
}

// G11) Custos USD dos endpoints novos
check('GF cost: nano-banana-2', estimateProviderCostUsd('fal-ai/nano-banana-2/edit', 4) === 0.045)
check('GF cost: nano-banana-pro', estimateProviderCostUsd('fal-ai/nano-banana-pro/edit', 4) === 0.15)
check('GF provider: nano-banana-2 → fal', endpointProvider('fal-ai/nano-banana-2/edit') === 'fal')
check('GF provider: gemini-3-pro instruct → google', endpointProvider('google/gemini-3-pro-image') === 'google')

console.log(`\neditRouter smoke: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
