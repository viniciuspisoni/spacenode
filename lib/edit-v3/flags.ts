// lib/edit-v3/flags.ts
//
// Feature flags do Editar V3. Lidas POR CHAMADA (funções, não consts) — permite
// alternar em runtime na Vercel sem rebuild de servidor, e que smokes alternem
// no mesmo processo. As flags NEXT_PUBLIC_* são inlinadas no bundle do cliente
// no BUILD (mudar exige rebuild para o client enxergar — o read SSR é imediato).

/** Liga o motor V3 no servidor (rota /api/edit-v3/google). Desligada → 404. */
export function editV3Enabled(): boolean {
  return process.env.EDIT_V3_ENABLED === '1'
}

/** Liga a UI V3 (página /app/editar-v3). Versão server-side da flag pública. */
export function editV3UiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EDIT_V3 === '1'
}

/** Permite editar SEM máscara (por instrução; ex.: "retirar o tapete") nas ações
 *  remove/swap_material/refine_area. Default LIGADO. EDIT_V3_NO_MASK=0 reverte
 *  para o comportamento "toda ação exige seleção" (kill-switch). insert_element
 *  exige máscara independentemente desta flag. */
export function editV3NoMaskEnabled(): boolean {
  return process.env.EDIT_V3_NO_MASK !== '0'
}

/** Cobrança REAL de nodes no sucesso. FAIL-SAFE: default DESLIGADO — só cobra
 *  com EDIT_V3_CHARGE=1 EXPLÍCITO. Env ausente ou qualquer outro valor (0, etc.)
 *  → NÃO debita (cobrança simulada). Garante que nenhum node seja cobrado por
 *  engano de configuração. */
export function editV3ChargeEnabled(): boolean {
  return process.env.EDIT_V3_CHARGE === '1'
}

/** Permite o fallback FAL (nano-banana) quando a API Google falha. Default OFF
 *  — V3 é Google-first; o fallback é uma rede de segurança opcional. */
export function editV3FalFallbackEnabled(): boolean {
  return process.env.EDIT_V3_FAL_FALLBACK === '1'
}

/** Motor da edição (PROTÓTIPO 2026-09-05): EDIT_V3_ENGINE=seedream liga o
 *  Seedream 5.0 Pro Edit (fal) com a seleção como tag <bbox>; qualquer outro
 *  valor (ou ausente) = Google/Gemini, o caminho validado em prod. */
export function editV3Engine(): import('./types').EditV3Engine {
  return process.env.EDIT_V3_ENGINE?.trim().toLowerCase() === 'seedream' ? 'seedream' : 'google'
}

/** Rota do motor Seedream (PROTÓTIPO): EDIT_V3_SEEDREAM_ROUTE=ark chama a ModelArk
 *  (ByteDance direto: 2K em ~45 s e 1/3 do custo, medido 2026-09-06); qualquer outro
 *  valor = via fal. Só vale quando EDIT_V3_ENGINE=seedream. */
export function editV3SeedreamRoute(): 'fal' | 'ark' {
  return process.env.EDIT_V3_SEEDREAM_ROUTE?.trim().toLowerCase() === 'ark' ? 'ark' : 'fal'
}

/** Libera a Alta precisão (Gemini Pro). Default OFF (custo/validação). */
export function editV3AllowHighPrecision(): boolean {
  return process.env.EDIT_V3_ALLOW_PRO === '1'
}

/** Expõe bloco debug (provider/modelo/USD) — nunca em produção sem o opt-in. */
export function editV3DebugAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.EDIT_V3_DEBUG === '1'
}

/** Normalizador de instrução PT→EN (reusa lib/edit-v2/normalizer — clean e
 *  validado em prod). Default LIGADO; EDIT_V3_NORMALIZER=0 desliga
 *  (kill-switch). Falha do LLM nunca bloqueia: cai na instrução crua. */
export function editV3NormalizerEnabled(): boolean {
  return process.env.EDIT_V3_NORMALIZER !== '0'
}

/** Gate semântico pós-geração (Gemini vision compara original × resultado).
 *  Default LIGADO; EDIT_V3_SEMANTIC_GATE=0 desliga. Com máscara é ADVISORY
 *  (warning — o recompose já garante os pixels); sem máscara REJEITA — é a
 *  única proteção fina do modo (gates de pixel só pegam catástrofe). */
export function editV3SemanticGateEnabled(): boolean {
  return process.env.EDIT_V3_SEMANTIC_GATE !== '0'
}
