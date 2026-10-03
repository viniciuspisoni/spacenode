// tests/fidelity/plan-fixtures.ts
//
// Gerador determinístico de PLANTA BAIXA sintética para o portão de tinta.
// Plantas reais são projeto de cliente e não entram no repo (mesma regra do
// bench), então as violações que o gate precisa pegar — parede movida,
// ambiente removido, planta redesenhada — são simuladas aqui, junto com o
// caso que tem que PASSAR: a mesma planta humanizada, inclusive com piso
// escuro (o caso em que um limiar de cinza absoluto erraria).

import sharp from 'sharp'

export const W = 1600
export const H = 1200
const WALL = 20        // cinza do traço
const PAPER = 255

export interface PlanParams {
  /** X da divisória vertical (fração da largura). */
  partitionX: number
  /** Y da divisória horizontal da ala direita (fração da altura). */
  partitionY: number
  /** Divisória horizontal existe? */
  hasPartitionY: boolean
  /** Vão de porta na divisória vertical (fração da altura). */
  doorY: number
  /** Humanização: preenche os cômodos e joga mobiliário. */
  humanize: boolean
  /** Tom do piso na humanização (255 = claro, 60 = madeira escura). */
  floorTone: number
}

export const BASE: PlanParams = {
  partitionX: 0.55,
  partitionY: 0.5,
  hasPartitionY: true,
  doorY: 0.35,
  humanize: false,
  floorTone: 230,
}

function rect(buf: Uint8Array, x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) buf[y * W + x] = v
  }
}

export async function drawPlan(p: PlanParams): Promise<Buffer> {
  const buf = new Uint8Array(W * H).fill(PAPER)

  const m = 80                                   // margem
  const px = Math.round(W * p.partitionX)
  const py = Math.round(H * p.partitionY)
  const dy = Math.round(H * p.doorY)

  // Humanização ENTRA PRIMEIRO: piso e mobiliário ficam SOB o traço, como num
  // render de planta humanizada de verdade.
  if (p.humanize) {
    rect(buf, m, m, W - m, H - m, p.floorTone)
    // Mobiliário: manchas de tom médio espalhadas pelos cômodos.
    rect(buf, m + 120, m + 120, m + 520, m + 400, Math.max(30, p.floorTone - 70))
    rect(buf, m + 160, H - m - 380, m + 460, H - m - 140, Math.max(30, p.floorTone - 50))
    rect(buf, px + 90, m + 140, W - m - 120, m + 420, Math.max(30, p.floorTone - 60))
    rect(buf, px + 120, H - m - 340, W - m - 160, H - m - 120, Math.max(30, p.floorTone - 40))
  }

  // Paredes externas (3 px) — o traço vem DEPOIS, por cima.
  rect(buf, m, m, W - m, m + 2, WALL)
  rect(buf, m, H - m - 2, W - m, H - m, WALL)
  rect(buf, m, m, m + 2, H - m, WALL)
  rect(buf, W - m - 2, m, W - m, H - m, WALL)

  // Aberturas na fachada (vãos brancos na parede de cima).
  rect(buf, m + 240, m, m + 460, m + 2, PAPER)
  rect(buf, px + 160, m, px + 360, m + 2, PAPER)

  // Divisória vertical (2 px) com vão de porta.
  rect(buf, px, m, px + 1, H - m, WALL)
  rect(buf, px, dy, px + 1, dy + 180, PAPER)

  // Divisória horizontal da ala direita.
  if (p.hasPartitionY) {
    rect(buf, px, py, W - m, py + 1, WALL)
    rect(buf, px + 220, py, px + 400, py + 1, PAPER)
  }

  return sharp(Buffer.from(buf), { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer()
}

// ── Casos ────────────────────────────────────────────────────────────────────
