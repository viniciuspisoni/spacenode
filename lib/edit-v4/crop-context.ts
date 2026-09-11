// lib/edit-v4/crop-context.ts
//
// O piso de contexto do crop.
//
// Módulo puro de propósito: `pipeline.ts` importa `sharp`, o gate semântico e o
// storage, então nada ali é testável sem subir meia aplicação. Esta é a regra
// que decide o que o modelo enxerga, e ela merece teste.

import type { CropPlan } from '@/lib/spaces/edit-crop'

/**
 * Lado mínimo do crop enviado ao modelo, em px.
 *
 * Uma marcação de pincel pequena — corrigir uma emenda, tirar um artefato —
 * gera um bbox de ~100 px. Com a folga de 25% do `planCrop`, o modelo recebia
 * um retalho de ~160 px e tinha que devolver 1024² (o piso do endpoint): seis
 * vezes mais pixels do que enxergava, sem nenhum contexto do material em volta.
 * Nessa situação ele não conserta o que existe, ele INVENTA — foi o caso
 * reportado em 10/09, uma costura de estofado que virou outra coisa.
 *
 * Com um piso de contexto o modelo vê a peça inteira, entende que material é
 * aquele, e a ampliação cai para ~2×. O custo é zero: o crop continua muito
 * abaixo do teto de megapixels, e é a mesma faixa de preço.
 */
export const MIN_CROP_SIDE = 512

/** Cresce a região do crop simetricamente até o lado mínimo, sem sair da
 *  imagem. Devolve o plano ajustado (escala e dimensões recalculadas).
 *
 *  O centro é preservado sempre que dá: só encosta na borda quando a região
 *  pedida não cabe de outro jeito, e nunca ultrapassa a imagem — a máscara
 *  precisa continuar caindo exatamente onde caía. */
export function withMinimumContext(
  plan: CropPlan,
  imageWidth: number,
  imageHeight: number,
  maxMegapixels: number,
): CropPlan {
  const target = Math.min(MIN_CROP_SIDE, imageWidth, imageHeight)
  const { left, top, width, height } = plan.region
  if (width >= target && height >= target) return plan

  const grow = (start: number, size: number, limit: number) => {
    const want = Math.max(size, target)
    const extra = want - size
    let s = Math.round(start - extra / 2)
    if (s < 0) s = 0
    if (s + want > limit) s = Math.max(0, limit - want)
    return { start: s, size: Math.min(want, limit - s) }
  }
  const h = grow(left, width, imageWidth)
  const v = grow(top, height, imageHeight)
  const region = { left: h.start, top: v.start, width: h.size, height: v.size }

  const mp = (region.width * region.height) / 1_000_000
  const scale = mp > maxMegapixels ? Math.sqrt(maxMegapixels / mp) : 1
  const outWidth = Math.max(1, Math.round(region.width * scale))
  const outHeight = Math.max(1, Math.round(region.height * scale))
  return { region, scale, outWidth, outHeight, outMegapixels: (outWidth * outHeight) / 1_000_000 }
}
