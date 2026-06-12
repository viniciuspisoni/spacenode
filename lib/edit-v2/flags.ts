// lib/edit-v2/flags.ts
//
// Feature flags do Editar v2 ("o novo editor arquitetônico da SpaceNode").
// Lidas POR CHAMADA (funções, não consts) — permite alternar em runtime na
// Vercel sem rebuild e permite que smokes/testes alternem no mesmo processo.
//
// Flags de produto (aprovadas pelo fundador em 2026-06-12):
//   EDIT_V2_ENABLED        — liga o motor v2 no servidor (rotas/router)
//   NEXT_PUBLIC_EDIT_V2    — liga a UI nova (lida direto no client; aqui só
//                            existe o helper server-side p/ SSR)
//   VERTEX_IMAGEN_ENABLED  — liga o provider Vertex Imagen (inpaint c/ máscara
//                            real; exige GOOGLE_VERTEX_* provisionadas)
//   GEMINI_EDIT_ENABLED    — liga o provider Gemini Image via API direta
//                            (gemini-3.1-flash-image / gemini-3-pro-image)
//
// Kill-switches internos (default LIGADO; não são flags de produto — existem
// para medirmos custo/latência das camadas invisíveis e poder desligar sem
// deploy, conforme pedido do fundador):
//   EDIT_V2_NORMALIZER=0      — desliga o normalizador de instrução
//   EDIT_V2_SEMANTIC_GATE=0   — desliga o gate semântico pós-geração
//   EDIT_V2_FAL_FALLBACK=1    — (default DESLIGADO) permite fallback FAL de
//                               emergência; nunca usado na rota primária.

export function editV2Enabled(): boolean {
  return process.env.EDIT_V2_ENABLED === '1'
}

/** Versão server-side da flag de UI (SSR decide qual fluxo renderizar). */
export function editV2UiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EDIT_V2 === '1'
}

export function vertexImagenEnabled(): boolean {
  return process.env.VERTEX_IMAGEN_ENABLED === '1'
}

export function geminiEditEnabled(): boolean {
  return process.env.GEMINI_EDIT_ENABLED === '1'
}

export function normalizerEnabled(): boolean {
  return process.env.EDIT_V2_NORMALIZER !== '0'
}

export function semanticGateEnabled(): boolean {
  return process.env.EDIT_V2_SEMANTIC_GATE !== '0'
}

export function falFallbackEnabled(): boolean {
  return process.env.EDIT_V2_FAL_FALLBACK === '1'
}

/** Snapshot imutável das flags — o router é puro e recebe isto como parâmetro,
 *  o que torna a matriz de roteamento 100% testável sem mexer em process.env. */
export interface EditV2Flags {
  v2Enabled: boolean
  vertexImagen: boolean
  geminiEdit: boolean
  normalizer: boolean
  semanticGate: boolean
  falFallback: boolean
}

export function currentFlags(): EditV2Flags {
  return {
    v2Enabled: editV2Enabled(),
    vertexImagen: vertexImagenEnabled(),
    geminiEdit: geminiEditEnabled(),
    normalizer: normalizerEnabled(),
    semanticGate: semanticGateEnabled(),
    falFallback: falFallbackEnabled(),
  }
}
