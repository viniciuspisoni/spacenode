// lib/ai/seedream-size.ts
//
// Tamanho de saída do Seedream 5.0 Pro dentro da FAIXA BARATA de preço.
//
// Os dois provedores cobram o Seedream em duas faixas, pela ÁREA da imagem de
// saída (conferido em 2026-09-09):
//   fal (bytedance/seedream/v5/pro/edit): ≤ 1536×1536 → US$ 0,0675 · acima
//     (até 2048²) → US$ 0,135
//   ModelArk direto:                      ≤ 2,61 MP   → US$ 0,045  · acima → 0,09
// O Quasar corre ModelArk × FAL em paralelo (hedge de 60 s em image-provider) e
// os DOIS cobram quando o hedge dispara — então o alvo é o menor teto, o da
// fal: 2.359.296 px. Assim a geração cai na faixa barata ganhe quem ganhar.
//
// O que muda na prática: 'auto_2K' entrega ~4,2 MP (medido em prod: 2368×1776,
// 3296×1280); a faixa barata entrega ~2,36 MP — 76% do lado, 57% dos pixels.
// Em 16:9 são 2048×1152, que é o que "2K" significa fora daqui (o 'auto_2K'
// do Seedream é quase 2,7K de lado maior).
//
// Desligado por padrão: só vale com SEEDREAM_CHEAP_TIER=1.
//
// CLIENT-SAFE nas funções de cálculo; seedreamCheapTierEnabled lê env (server).

/** Teto da faixa barata da fal (1536²) — o mais apertado dos dois provedores. */
export const SEEDREAM_LOW_TIER_MAX_PIXELS = 1536 * 1536
/** Piso do schema da fal (1024²): abaixo disso o endpoint recusa. */
export const SEEDREAM_MIN_PIXELS = 1024 * 1024

/** Faixa barata ligada? Default desligado — sem a env nada muda. */
export function seedreamCheapTierEnabled(): boolean {
  return process.env.SEEDREAM_CHEAP_TIER === '1'
}

/** Maior tamanho que ainda cabe na faixa barata, no aspecto do original e em
 *  múltiplos de 16. null quando não dá pra calcular (sem dimensões) — aí o
 *  caller mantém o 'auto_2K' de hoje. */
export function seedreamCheapSize(
  width: number | null | undefined,
  height: number | null | undefined,
): { width: number; height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null
  // Envelope de aspecto do endpoint (1/16 a 16) — igual ao adaptador do Editar.
  const aspect = Math.max(1 / 16, Math.min(16, width / height))
  const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16)
  let w = round16(Math.sqrt(SEEDREAM_LOW_TIER_MAX_PIXELS * aspect))
  let h = round16(w / aspect)
  // O arredondamento pode passar do teto (aí sai caro) ou cair abaixo do piso
  // do schema (aí a fal recusa): desce/sobe de 16 em 16 até caber nos dois.
  for (let i = 0; i < 64 && w * h > SEEDREAM_LOW_TIER_MAX_PIXELS; i++) { w -= 16; h = round16(w / aspect) }
  for (let i = 0; i < 64 && w * h < SEEDREAM_MIN_PIXELS;           i++) { w += 16; h = round16(w / aspect) }
  if (w * h > SEEDREAM_LOW_TIER_MAX_PIXELS || w * h < SEEDREAM_MIN_PIXELS) return null
  return { width: w, height: h }
}
