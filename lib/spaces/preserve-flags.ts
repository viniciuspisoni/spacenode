// lib/spaces/preserve-flags.ts
//
// Feature flag da revisão de preservação do Spaces ("Spaces Preserve V2").
//
// Princípio de produto: a imagem upada é a AUTORIDADE do projeto. O Spaces é
// variação controlada de um projeto real, não geração criativa livre. Esta
// flag liga o caminho que reforça essa preservação sem quebrar o fluxo atual.
//
// Lida POR CHAMADA (função, não const) — mesmo padrão do Editar v2
// (lib/edit-v2/flags.ts): permite alternar em runtime na Vercel sem rebuild e
// permite que smokes/testes alternem no mesmo processo.
//
// É NEXT_PUBLIC porque a UI (labels arquitetônicos, microcopy, comparação
// antes/depois) também precisa ler a flag no client. No server, NEXT_PUBLIC_*
// continua disponível em process.env.
//
// Desde o fluxo Referência → Ação → Gerar (2026-07), o pipeline de geração
// trata a preservação como comportamento ESTRUTURAL (lib/spaces/reference-
// prompt + lib/spaces/generation) e não depende mais desta flag. Ela segue
// lida pela UI legada (comparação antes/depois do VistaDetail).

// Flag ON  → labels/comparações revisadas na UI.
// Flag OFF → cópia anterior intacta.

export function spacesPreserveV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_SPACES_PRESERVE_V2 === '1'
}

// Kill-switch interno da checagem de preservação por VISÃO (Gemini multi-imagem
// comparando referência geométrica × generated). Default LIGADO, mas killável
// sem deploy (SPACES_PRESERVE_VISION_CHECK=0) caso custo/latência incomodem.
// As checagens estruturais (aspect ratio etc.) não dependem disto — rodam
// sempre.
export function visionPreservationCheckEnabled(): boolean {
  return process.env.SPACES_PRESERVE_VISION_CHECK !== '0'
}
