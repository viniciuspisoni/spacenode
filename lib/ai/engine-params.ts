// ── Parâmetros do endpoint por motor PÚBLICO (Vega · Pulsar · Quasar) ────────
//
// Fonte única do payload que vai ao fornecedor no Renderizar. Vivia dentro de
// app/api/generate/route.ts; saiu pra cá porque o benchmark de fidelidade
// (tests/fidelity/bench.test.ts) montava os parâmetros por conta própria e
// ficou pra trás — media o Quasar com params do GPT Image 2 (`quality`,
// `image_size: 'auto'`) muito depois da troca pro Seedream 5.0 Pro. Régua e
// produção agora leem daqui.
//
// Orion NÃO passa por este arquivo: o schema da Image API é outro e o piloto
// vive em lib/orion/provider.ts.
//
// Mapping de resolução interna → param do fornecedor por motor:
//   Vega   (Gemini 3 Pro Image edit) → `resolution` ∈ '1K'|'2K'|'4K'
//   Pulsar (Nano Banana 2 edit)      → `resolution` ∈ '1K'|'2K'|'4K'
//     HD interno mapeia para '1K' na Fal.ai (NB2 não tem rótulo "HD" nativo).
//   Quasar (Seedream 5.0 Pro edit)   → `image_size` = 'auto_2K' (ou WxH da faixa barata)
//     'auto_*' segue o aspecto da imagem de entrada. O endpoint tem teto de
//     2048×2048, por isso o Quasar só oferece 2K (lib/engines). Schema da FAL
//     sem seed/quality/aspect_ratio.

import type { EngineId, Resolution } from '@/lib/engines'
import { seedreamCheapSize, seedreamCheapTierEnabled } from '@/lib/ai/seedream-size'

export interface FalParamsOpts {
  /** Pede a faixa barata do Seedream INDEPENDENTE de `SEEDREAM_CHEAP_TIER`.
   *
   *  Existe porque a env é GLOBAL e o Quasar é o motor padrão do Renderizar:
   *  ligá-la pra fechar a margem de UM módulo encolheria toda imagem do
   *  Renderizar de ~4,2 MP pra ~2,36 MP (57% dos pixels) como efeito colateral.
   *
   *  Quem passa `true` está dizendo que, naquele módulo, o tamanho da faixa
   *  barata é suficiente para a entrega. É o caso da Planta Humanizada: 2,36 MP
   *  já é mais do que uma planta de apresentação precisa, e é o que põe a
   *  ferramenta em 83% de margem no piso. NÃO é o caso do Renderizar, onde o
   *  render é o produto final e o usuário compara pixel a pixel. */
  forceCheapTier?: boolean
}

export function falParamsForEngine(
  engine:      EngineId,
  resolution:  Resolution,
  aspectRatio: string | null = null,
  sourceSize:  { width: number; height: number } | null = null,
  opts:        FalParamsOpts = {},
): Record<string, unknown> {
  if (engine === 'quasar') {
    // Seedream 5.0 Pro Edit: só campos do schema (conferido 2026-09-04).
    // 'auto_2K' preserva a proporção do input no maior tamanho do endpoint.
    // Na faixa barata pedimos WxH explícito no teto de preço
    // (lib/ai/seedream-size): metade do custo nos dois provedores e 76% do
    // lado. Sem as dimensões do original, segue o 'auto_2K'.
    const cheap = (opts.forceCheapTier || seedreamCheapTierEnabled())
      ? seedreamCheapSize(sourceSize?.width, sourceSize?.height)
      : null
    return {
      image_size:    cheap ?? 'auto_2K',
      num_images:    1,
      // Master lossless — alinha o caminho FAL com o GCP/Vertex (que já
      // devolve PNG). JPEG aqui criava uma geração de perda logo na origem
      // da cadeia render → editar → ampliar.
      output_format: 'png',
    }
  }
  // vega | pulsar
  const map: Record<Resolution, string> = { hd: '1K', '2k': '2K', '4k': '4K' }
  return {
    resolution:    map[resolution],
    num_images:    1,
    output_format: 'png',
    // Pino de formato (lib/ai/aspect-ratio): presente só quando o aspecto do
    // original bate (≤2%) com um valor suportado — previne o drift de
    // enquadramento em vez de puni-lo depois via aspectDelta. Ausente, o
    // motor segue o formato do input (default 'auto').
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
  }
}
