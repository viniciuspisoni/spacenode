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
// Flag ON  → novo prompt builder (lib/spaces/preserve-prompt), níveis de
//            preservação (lib/spaces/preservation), source lock, metadados
//            source/generated separados, labels revisados, validações simples.
// Flag OFF → comportamento anterior intacto (salvo correção crítica de bug).

export function spacesPreserveV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_SPACES_PRESERVE_V2 === '1'
}

// Kill-switch interno da checagem de preservação por VISÃO (Gemini multi-imagem
// comparando source × generated). Só roda quando o Preserve V2 está on; default
// LIGADO, mas killável sem deploy (SPACES_PRESERVE_VISION_CHECK=0) caso custo/
// latência incomodem. As checagens estruturais (aspect ratio etc.) não dependem
// disto — rodam sempre que o Preserve V2 está on.
export function visionPreservationCheckEnabled(): boolean {
  return process.env.SPACES_PRESERVE_VISION_CHECK !== '0'
}
