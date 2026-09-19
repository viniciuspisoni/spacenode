// Recommendations — converte intenção do usuário em escolhas técnicas.
//
// O eixo da tela é o OBJETIVO ("para que serve esta imagem"). Aqui ele vira
// aba + modo + escala. A mudança de 2026-09-18: a escala deixou de ser um
// número fixo por objetivo e passou a ser DERIVADA da imagem que o usuário
// subiu.
//
// Por quê: "Impressão / prancha" valia 4× para todo mundo. Num render de
// 4000 px isso pedia 16000 px — o dobro do necessário para papel, o dobro do
// custo, e às vezes acima do teto de MAX_OUTPUT_MP (erro só depois do upload).
// Num render de 1200 px, os mesmos 4× entregavam 4800 px, que é pouco para
// prancha. O mesmo rótulo produzia dois resultados errados em direções
// opostas.
//
// Agora cada objetivo declara a BORDA LONGA que ele precisa atingir e a
// escala é a menor que chega lá — limitada pelo teto do motor
// (MAX_UPSCALE_FACTOR) e pelo teto de megapixels de saída (MAX_OUTPUT_MP).

import { MAX_OUTPUT_MP } from './costs'
import {
  MAX_UPSCALE_FACTOR,
  scaleToFactor,
  type ModeId,
  type ObjectiveId,
  type Scale,
  type UpscaleTab,
} from './types'

/** Escalas que ampliam e que algum motor entrega de verdade. Ordenadas. */
export const OFFERED_SCALES: readonly Scale[] = ['2x', '4x'] as const

// ── Presets por objetivo ─────────────────────────────────────────────────────

export interface ObjectivePreset {
  tab:    UpscaleTab
  modeId: ModeId
  /** Escala usada quando ainda não há imagem (a tela abre com um objetivo
   *  escolhido e precisa mostrar um custo). Com imagem, quem manda é
   *  resolveScale(). */
  scale:  Scale
  /** Borda longa alvo, em pixels — o que este trabalho exige. */
  targetLongEdge: number
  /** Resumo curto mostrado no tooltip / hover da UI. */
  hint:   string
}

export const OBJECTIVE_PRESETS: Record<ObjectiveId, ObjectivePreset> = {
  client: {
    tab: 'resolution', modeId: 'fidelity', scale: '2x', targetLongEdge: 3200,
    hint: 'Nítida em tela cheia e dentro do PDF de apresentação.',
  },
  portfolio: {
    tab: 'resolution', modeId: 'fidelity', scale: '2x', targetLongEdge: 2560,
    hint: 'Aguenta o zoom do feed sem o Instagram recomprimir demais.',
  },
  print: {
    tab: 'resolution', modeId: 'fidelity', scale: '4x', targetLongEdge: 6000,
    hint: 'Densidade para papel — prancha A1 a 150 dpi.',
  },
  recover: {
    tab: 'resolution', modeId: 'recover', scale: '4x', targetLongEdge: 2400,
    hint: 'Trata o artefato de compressão antes de ampliar.',
  },
  final: {
    tab: 'resolution', modeId: 'fidelity', scale: '4x', targetLongEdge: 8000,
    hint: 'O máximo que o motor entrega sem inventar detalhe.',
  },
}

// ── Escala derivada das dimensões reais ──────────────────────────────────────

export interface Dimensions { width: number; height: number }

/** Maior escala cujo OUTPUT ainda cabe em MAX_OUTPUT_MP. Sem dimensões, não
 *  há o que limitar — devolve o teto do motor.
 *
 *  `null` quando NENHUMA escala cabe: a imagem de entrada já é grande demais
 *  para ser ampliada. Devolver a menor escala assim mesmo (o que esta função
 *  fazia) mandava a UI dizer "escolha 2×" para alguém cujo 2× também estoura —
 *  um conselho que não resolve. */
export function maxScaleForDimensions(dims: Dimensions | null | undefined): Scale | null {
  if (!dims?.width || !dims?.height) return '4x'
  let best: Scale | null = null
  for (const s of OFFERED_SCALES) {
    const f = scaleToFactor(s)
    if (f > MAX_UPSCALE_FACTOR) continue
    if ((dims.width * dims.height * f * f) / 1_000_000 <= MAX_OUTPUT_MP) best = s
  }
  return best
}

/** true quando esta escala estouraria o teto de megapixels para esta imagem. */
export function scaleExceedsCap(scale: Scale, dims: Dimensions | null | undefined): boolean {
  if (!dims?.width || !dims?.height) return false
  const f = Math.min(scaleToFactor(scale), MAX_UPSCALE_FACTOR)
  return (dims.width * dims.height * f * f) / 1_000_000 > MAX_OUTPUT_MP
}

/** Dimensões de saída para uma escala — o número que a UI mostra ANTES de
 *  gastar node. Usa o fator efetivo, então nunca promete o que não entrega. */
export function projectedDimensions(dims: Dimensions, scale: Scale): Dimensions {
  const f = Math.min(scaleToFactor(scale), MAX_UPSCALE_FACTOR)
  return { width: Math.round(dims.width * f), height: Math.round(dims.height * f) }
}

/** A escala que este objetivo pede PARA ESTA IMAGEM: a menor que alcança a
 *  borda longa alvo, sem passar do teto de megapixels. */
export function resolveScale(objectiveId: ObjectiveId, dims: Dimensions | null | undefined): Scale {
  const preset = OBJECTIVE_PRESETS[objectiveId]
  if (!dims?.width || !dims?.height) return preset.scale

  const longEdge = Math.max(dims.width, dims.height)
  const ceiling  = maxScaleForDimensions(dims)
  // Nenhuma escala cabe: devolve a menor mesmo assim. Quem barra o envio é a
  // UI (e a rota), com a mensagem certa — "a imagem já é grande demais".
  if (!ceiling) return OFFERED_SCALES[0]

  for (const s of OFFERED_SCALES) {
    if (longEdge * scaleToFactor(s) >= preset.targetLongEdge) {
      // Já chega no alvo: não gasta mais do que precisa.
      return scaleToFactor(s) <= scaleToFactor(ceiling) ? s : ceiling
    }
  }
  // Nenhuma escala alcança o alvo — vai no máximo que cabe.
  return ceiling
}

// ── Recomendação automática por arquivo ──────────────────────────────────────

export interface ImageSignal {
  fileName: string
  fileSize: number
  width?:   number | null
  height?:  number | null
}

export interface FileRecommendation {
  objectiveId: ObjectiveId | null
  modeId:      ModeId
  /** Frase curta mostrada ao usuário. Vazia = nada a dizer (não inventa
   *  observação só para preencher a linha). */
  reason:      string
}

// Densidade de bytes por pixel: o sinal honesto de "esta imagem foi
// comprimida com força". Um JPEG de render bem exportado fica acima de
// ~0,5 B/px; abaixo de ~0,15 B/px o arquivo já perdeu detalhe de verdade e o
// tratamento de artefato (modo Recuperar) rende mais que ampliar direto.
const LOW_DENSITY_BYTES_PER_PIXEL = 0.15
/** Abaixo disto a imagem é pequena demais para o uso profissional típico. */
const SMALL_LONG_EDGE = 1100

export function analyzeImage(sig: ImageSignal): FileRecommendation {
  const w = sig.width ?? 0
  const h = sig.height ?? 0
  const hasDims = w > 0 && h > 0

  // Sem dimensões ainda, não arrisca palpite: o objetivo escolhido já vale.
  if (!hasDims) return { objectiveId: null, modeId: 'fidelity', reason: '' }

  const longEdge = Math.max(w, h)
  const density  = sig.fileSize / (w * h)

  if (density < LOW_DENSITY_BYTES_PER_PIXEL) {
    return {
      objectiveId: 'recover',
      modeId: 'recover',
      reason: 'Esta imagem foi salva com compressão pesada — tratamos o artefato antes de ampliar.',
    }
  }

  if (longEdge < SMALL_LONG_EDGE) {
    return {
      objectiveId: 'recover',
      modeId: 'recover',
      reason: `Imagem pequena (${w}×${h}px) — o modo Recuperar aproveita melhor o pouco detalhe que existe.`,
    }
  }

  return { objectiveId: null, modeId: 'fidelity', reason: '' }
}
