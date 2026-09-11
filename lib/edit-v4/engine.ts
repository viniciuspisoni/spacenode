// lib/edit-v4/engine.ts
//
// O motor do Editar V4: Seedream 5.0 Pro Edit, com as duas rotas em série.
//
// ROTA. ModelArk (direto na BytePlus) é a primária: metade do preço da fal e
// 50–58 s contra ~130 s, medido em 2026-09-06 nos mesmos 8 casos. A fal é
// FALLBACK POR ERRO, nunca corrida em paralelo — hedge neste endpoint é
// cobrança dupla comprovada (as duas pernas cobram; ver PR #178/#190).
//
// TAMANHO DA SAÍDA. É aqui que o V4 conserta o desperdício do V3: lá, um crop
// de 251×225 era gerado em 2 MP e devolvido esticado — pagava a faixa cara e
// entregava borrado. Aqui a saída é dimensionada PELO CROP, sempre dentro da
// faixa barata dos DOIS provedores (o número que serve aos dois é o teto da
// fal, 1536² = 2.359.296 px). Duas consequências:
//   - preço: sempre a faixa barata, qualquer que seja a rota que atender;
//   - velocidade: crop pequeno pede pouco e volta bem mais rápido, de graça —
//     dentro da mesma faixa de preço, pedir menos pixels não economiza dinheiro,
//     economiza TEMPO (medido: 2,36 MP em ~100 s contra 4,2 MP em ~144 s).

import { editImageWithSeedream, SeedreamEditError } from '@/lib/ai/fal/seedreamEdit'
import { editImageWithSeedreamArk } from '@/lib/ai/ark/seedreamEdit'
import {
  SEEDREAM_LOW_TIER_MAX_PIXELS,
  SEEDREAM_MIN_PIXELS,
} from '@/lib/ai/seedream-size'
import type { EditV4Model, EditV4Provider } from './types'

/** Fator LINEAR de supersampling sobre o crop: o modelo desenha em 2× o lado e
 *  o recompose reduz de volta, o que devolve detalhe em vez de borrão. Acima
 *  disso só sobra latência — o crop não tem informação para aproveitar. */
const SUPERSAMPLE_LINEAR = 2

/** Envelope de proporção aceito pelo endpoint (1/16 a 16). */
const MIN_ASPECT = 1 / 16
const MAX_ASPECT = 16

/**
 * Tamanho de saída para um crop, em múltiplos de 16, na proporção do crop e
 * SEMPRE dentro de [1.048.576 px, 2.359.296 px] — o piso é o schema da fal
 * (abaixo dele ela recusa) e o teto é a faixa barata dos dois provedores.
 *
 * Puro e determinístico de propósito: é o número que decide preço e latência de
 * toda edição, então tem teste próprio (tests/edit-v4/output-size.test.ts).
 */
export function outputSizeForCrop(
  cropWidth: number,
  cropHeight: number,
): { width: number; height: number } {
  // Saneamento: NaN/Infinity/negativo entram como 1. `Math.max(1, NaN)` é NaN
  // — o guard tem que ser explícito, senão um crop degenerado propaga NaN até
  // o pedido ao provider e vira 422.
  const safe = (v: number) => (Number.isFinite(v) && v >= 1 ? Math.round(v) : 1)
  const w0 = safe(cropWidth)
  const h0 = safe(cropHeight)
  const aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, w0 / h0))

  const wanted = w0 * h0 * SUPERSAMPLE_LINEAR * SUPERSAMPLE_LINEAR
  const target = Math.max(SEEDREAM_MIN_PIXELS, Math.min(SEEDREAM_LOW_TIER_MAX_PIXELS, wanted))

  const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16)
  let w = round16(Math.sqrt(target * aspect))
  let h = round16(w / aspect)
  // O arredondamento pode estourar o teto (aí sai caro) ou furar o piso (aí a
  // fal recusa): anda de 16 em 16 até caber nos dois limites.
  for (let i = 0; i < 128 && w * h > SEEDREAM_LOW_TIER_MAX_PIXELS; i++) {
    w -= 16
    h = round16(w / aspect)
  }
  for (let i = 0; i < 128 && w * h < SEEDREAM_MIN_PIXELS; i++) {
    w += 16
    h = round16(w / aspect)
  }
  return { width: w, height: h }
}

export interface EditV4EngineInput {
  /** Imagem enviada ao modelo: o crop da seleção, ou a origem quando não há. */
  imageUrl: string
  imageWidth: number
  imageHeight: number
  references: { url: string }[]
  /** Prompt já montado (com a tag de região, quando houver). */
  prompt: string
}

export interface EditV4EngineOutput {
  /** URL pública (fal) ou data: URL (ark). O pipeline busca o buffer. */
  imageRef: string
  provider: EditV4Provider
  model: EditV4Model
  requestId: string | null
  durationMs: number
  outputWidth: number
  outputHeight: number
  costUsd: number
  /** true = a rota primária falhou e quem atendeu foi a secundária. */
  usedFallback: boolean
}

export class EditV4EngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditV4EngineError'
  }
}

/**
 * Roda a edição na rota primária e, se ela falhar, na secundária. As duas
 * recebem o MESMO `outputSize` — é por isso que o tamanho é clampado no teto
 * mais apertado dos dois provedores: um pedido só serve para as duas, sem
 * recalcular nada no meio da queda.
 */
export async function runSeedreamEdit(
  input: EditV4EngineInput,
  opts: { primary: EditV4Provider; outputSize: { width: number; height: number } },
): Promise<EditV4EngineOutput> {
  const call = async (provider: EditV4Provider) => {
    const payload = {
      imageUrl: input.imageUrl,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      references: input.references,
      prompt: input.prompt,
      outputSize: opts.outputSize,
    }
    return provider === 'ark'
      ? editImageWithSeedreamArk(payload)
      : editImageWithSeedream(payload)
  }

  const secondary: EditV4Provider = opts.primary === 'ark' ? 'fal' : 'ark'
  try {
    const out = await call(opts.primary)
    return { ...out, provider: opts.primary, usedFallback: false }
  } catch (primaryErr) {
    const kind = primaryErr instanceof SeedreamEditError ? primaryErr.kind : 'unknown'
    console.warn(
      `[edit-v4] rota ${opts.primary} falhou (${kind}), caindo em ${secondary}:`,
      (primaryErr as Error).message,
    )
    try {
      const out = await call(secondary)
      return { ...out, provider: secondary, usedFallback: true }
    } catch (secondaryErr) {
      throw new EditV4EngineError(
        `As duas rotas do motor falharam (${opts.primary}: ${(primaryErr as Error).message}; ` +
        `${secondary}: ${(secondaryErr as Error).message}).`,
      )
    }
  }
}
