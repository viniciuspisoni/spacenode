// lib/upscale/classify-source.ts
//
// Análise visual automática da origem — decide se a imagem é DESENHO TÉCNICO
// PURO (planta, corte, fachada em linha: traço escuro sobre fundo claro, sem
// meios-tons) ou "imagem" (render, foto, prancha com render, qualquer coisa
// com sombreamento).
//
// Por que só essa distinção, e não "render / foto / prancha / texto": foi o
// que a medição mostrou pagar (lib/upscale/MEDICOES.md §9). O Topaz tem um
// modelo de precisão para traço e texto, o Text Refine. Em duas plantas
// degradadas, medido com métrica de traço (tinta = cinza < 128, ±1 px): os
// dois modelos preservam 100% das linhas, mas o Text Refine põe menos halo em
// volta delas (precisão da tinta 0,977/0,961 → 0,988) e erra 35–40% menos
// contra a verdade (MAE 1,07 → 0,65 e 1,58 → 1,03). Ganho modesto, consistente
// e de custo zero (mesmo endpoint, mesmo preço, mesmo tempo). Já o MESMO
// modelo numa prancha — render + texto — chapa o tijolo e apaga o sombreado
// do guarda-corpo (recall do render 0,926 → 0,790). "Tem texto" é, portanto,
// o sinal ERRADO; o sinal certo é "não tem meios-tons". Render e foto ficam
// no High Fidelity V2, que venceu em todas as outras classes medidas.
//
// Três portões, TODOS obrigatórios — o erro barato é deixar uma planta no
// motor de sempre (perde só o ganho); o erro caro seria mandar um render pro
// Text Refine (perde textura). Por isso os limiares ficam do lado seguro,
// calibrados com positivos e negativos sintéticos (análise a 512 px):
//
//   caso                           branco%  meios-tons%  saturação
//   planta (positivo)               92,6       4,1        0,000
//   planta em fundo cinza claro     88,7       4,0        0,000
//   render SOBRE fundo branco       86,2      10,6        0,047   ← o negativo difícil
//   prancha (render + texto)        63,7      24,1        0,118
//   render / foto                  ~0        ~75         0,33–0,42
//
// O render sobre branco passa no portão de fundo claro e é barrado pelos
// outros dois. Custo: 40–90 ms de CPU, zero rede, zero dinheiro.
//
// SERVER-ONLY: usa sharp. Importar direto da rota, nunca via lib/upscale/index.

import sharp from 'sharp'
import type { SourceKind } from './types'

export interface SourceStats {
  /** % de pixels quase brancos (todos os canais > 235). */
  lightPct:   number
  /** % de pixels em meio-tom (luminância entre 40 e 215, fora do quase-branco). */
  midtonePct: number
  /** Saturação média HSV-like (0..1). */
  saturation: number
}

export interface SourceClassification {
  kind:  SourceKind
  stats: SourceStats
}

// Limiares — ver tabela acima. Margens: meios-tons 4,5 (positivo) × 10,6
// (negativo difícil); saturação 0,000 × 0,047.
const LINE_ART_MIN_LIGHT_PCT   = 80
const LINE_ART_MAX_MIDTONE_PCT = 7
const LINE_ART_MAX_SATURATION  = 0.03

const ANALYSIS_SIDE = 512

export async function classifySource(buffer: Buffer): Promise<SourceClassification> {
  const { data, info } = await sharp(buffer)
    .resize(ANALYSIS_SIDE, ANALYSIS_SIDE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const n  = info.width * info.height
  const ch = info.channels
  let light = 0, midtone = 0, satSum = 0

  for (let i = 0; i < n; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2]
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const y  = 0.299 * r + 0.587 * g + 0.114 * b
    if (mn > 235)              light++
    else if (y > 40 && y < 215) midtone++
    satSum += mx === 0 ? 0 : (mx - mn) / mx
  }

  const stats: SourceStats = {
    lightPct:   round1((100 * light) / n),
    midtonePct: round1((100 * midtone) / n),
    saturation: Math.round((satSum / n) * 1000) / 1000,
  }

  const lineArt =
    stats.lightPct   >= LINE_ART_MIN_LIGHT_PCT &&
    stats.midtonePct <= LINE_ART_MAX_MIDTONE_PCT &&
    stats.saturation <= LINE_ART_MAX_SATURATION

  return { kind: lineArt ? 'line-art' : 'image', stats }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
