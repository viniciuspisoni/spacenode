// lib/edit-v4/flags.ts
//
// Feature flags do Editar V4. Lidas POR CHAMADA (funções, não consts) — permite
// alternar em runtime no servidor sem rebuild. As `NEXT_PUBLIC_*` são inlinadas
// no bundle do cliente no BUILD: mudá-las exige redeploy pro cliente enxergar.

import type { EditV4Provider } from './types'

/** Liga a rota `/api/edit-v4`. Desligada → 404 (a rota não existe pro mundo). */
export function editV4Enabled(): boolean {
  return process.env.EDIT_V4_ENABLED === '1'
}

/** Liga a página `/app/editar-v4` e o fork do `/app/editar`. */
export function editV4UiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EDIT_V4 === '1'
}

/** Cobrança REAL de nodes no sucesso. FAIL-SAFE: só cobra com `=1` explícito —
 *  env ausente, `0` ou qualquer outro valor NÃO debita (cobrança simulada).
 *  Erro de configuração nunca pode virar node cobrado por engano. */
export function editV4ChargeEnabled(): boolean {
  return process.env.EDIT_V4_CHARGE === '1'
}

/** Rota PRIMÁRIA do Seedream. Default 'ark' (ModelArk direto): metade do preço
 *  da fal e 50–58 s contra ~130 s, medido em 2026-09-06. A outra rota é sempre
 *  o fallback por erro — nunca corrida em paralelo (hedge neste endpoint é
 *  cobrança dupla: as duas pernas cobram, ver PR #178/#190). */
export function editV4Route(): EditV4Provider {
  return process.env.EDIT_V4_ROUTE?.trim().toLowerCase() === 'fal' ? 'fal' : 'ark'
}

/** Modo rápido de otimização de prompt do Seedream (~13% mais rápido, qualidade
 *  "levemente menor" segundo a doc da ModelArk). Default OFF. */
export function editV4FastEnabled(): boolean {
  return process.env.EDIT_V4_FAST === '1'
}

/** Desenha o contorno da seleção na imagem enviada ao modelo, além da tag
 *  `<bbox>`. É recurso oficial do Seedream Pro ("marcações desenhadas") e
 *  localiza muito melhor que a caixa sozinha em seleção não-retangular.
 *  Default LIGADO; `EDIT_V4_OUTLINE=0` volta pro bbox puro (kill-switch para
 *  o caso de o contorno vazar como traço no resultado). */
export function editV4OutlineEnabled(): boolean {
  return process.env.EDIT_V4_OUTLINE !== '0'
}

/** Normalizador de instrução PT→EN (reusa a camada validada do V2). Default
 *  LIGADO. Falha do LLM nunca bloqueia: cai na instrução crua.
 *
 *  ⚠️ Depende do Gemini, que está com billing desativado desde 2026-09-07.
 *  Enquanto isso ele degrada sozinho (a chamada falha e devolve a instrução
 *  original) — as cláusulas rígidas do prompt seguram o contrato. */
export function editV4NormalizerEnabled(): boolean {
  return process.env.EDIT_V4_NORMALIZER !== '0'
}

/** Gate semântico pós-geração (visão compara original × resultado). Advisory
 *  quando há máscara (o recompose já garante os pixels), decisivo sem máscara.
 *  Mesma dependência do Gemini acima: indisponível → `skipped`, nunca bloqueia. */
export function editV4SemanticGateEnabled(): boolean {
  return process.env.EDIT_V4_SEMANTIC_GATE !== '0'
}

/** Expõe o bloco `debug` (rota, custo USD, métricas). Nunca em produção sem
 *  opt-in explícito. */
export function editV4DebugAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.EDIT_V4_DEBUG === '1'
}
