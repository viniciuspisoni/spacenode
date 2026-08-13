// lib/ai/aspect-ratio.ts
//
// Pino de aspect ratio da geração: deriva do ORIGINAL o valor de `aspect_ratio`
// a enviar aos motores, em vez de deixar o modelo escolher o formato e só punir
// o drift depois (aspectDelta no geometry score).
//
// Regra: só pinamos quando o aspecto do original está a ≤2% de um valor
// SUPORTADO pelos dois caminhos (FAL nano-banana-2/pro e Vertex
// imageConfig.aspectRatio). Fora da tolerância, NÃO enviamos nada — pinar um
// formato diferente do input forçaria crop/letterbox, que é drift pior do que
// o comportamento default ("auto" segue o input). A tolerância espelha a zona
// livre do aspectPenalty em lib/ai/fidelity/geometry-score.ts (2%).
//
// CLIENT-SAFE: só números/strings.

interface SupportedRatio {
  label: string
  value: number
}

// Interseção dos enums aceitos por fal-ai/nano-banana-2/edit,
// fal-ai/nano-banana-pro/edit e Vertex imageConfig.aspectRatio (Gemini 3).
// Os extremos do NB2 (4:1, 8:1…) ficam de fora — o Vertex não aceita.
const SUPPORTED_ASPECT_RATIOS: SupportedRatio[] = [
  { label: '21:9', value: 21 / 9 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2',  value: 3 / 2 },
  { label: '4:3',  value: 4 / 3 },
  { label: '5:4',  value: 5 / 4 },
  { label: '1:1',  value: 1 },
  { label: '4:5',  value: 4 / 5 },
  { label: '3:4',  value: 3 / 4 },
  { label: '2:3',  value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
]

const DEFAULT_TOLERANCE = 0.02

/** Aspect ratio suportado mais próximo das dimensões dadas, ou null quando
 *  nenhum valor cai dentro da tolerância (aí o caller omite o parâmetro e o
 *  motor segue o formato do input). */
export function nearestSupportedAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
  tolerance: number = DEFAULT_TOLERANCE,
): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null
  const ratio = width / height
  let best: SupportedRatio | null = null
  let bestDelta = Infinity
  for (const candidate of SUPPORTED_ASPECT_RATIOS) {
    const delta = Math.abs(ratio - candidate.value) / candidate.value
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }
  return best && bestDelta <= tolerance ? best.label : null
}
