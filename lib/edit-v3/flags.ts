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

/** Libera a Alta precisão (Gemini Pro). Default OFF (custo/validação). */
export function editV3AllowHighPrecision(): boolean {
  return process.env.EDIT_V3_ALLOW_PRO === '1'
}

/** Expõe bloco debug (provider/modelo/USD) — nunca em produção sem o opt-in. */
export function editV3DebugAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.EDIT_V3_DEBUG === '1'
}
