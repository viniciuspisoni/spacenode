// tests/fidelity/fixtures.ts
//
// Gerador determinístico de cenas sintéticas pro geometry-score. Desenha um
// "projeto de interior" esquemático em grayscale — parede de fundo com duas
// janelas, parede DIREITA em perspectiva (arestas convergindo pro ponto de
// fuga), porta, marcenaria (armários com divisórias), bancada, mesa e sofá —
// e permite variar cada elemento isoladamente pra simular as violações que o
// modo render_only precisa detectar:
//
//   janela movida/redimensionada · porta removida · bancada movida ·
//   marcenaria redesenhada · mesa movida · sofá redimensionado ·
//   parede direita redesenhada · câmera (pan) · pontos de fuga alterados
//
// `texture`/`relight`/`brightness` simulam o que um re-render FIEL faz
// (materiais/luz mudam, estrutura não) — esses variantes têm que PASSAR.
//
// Sem imagem externa: o pedido original citava "imagens de referência
// fornecidas", mas nenhuma foi anexada à tarefa — as fixtures sintéticas
// cobrem o mesmo checklist de forma determinística. Pra validar com imagens
// reais, dropar pares em tests/fidelity/real/ (ver geometry-score.test.ts).

import sharp from 'sharp'

export interface SceneParams {
  width: number
  height: number
  /** Pan de câmera (px) — desloca a cena inteira. */
  offsetX: number
  /** Desloca o ponto de fuga: muda a inclinação das diagonais teto/piso. */
  vpShift: number
  /** Janela 1: posição X. */
  win1X: number
  /** Janela 2: dimensões. */
  win2W: number
  win2H: number
  hasDoor: boolean
  /** Bancada + marcenaria: posição X. */
  counterX: number
  /** Marcenaria: altura e nº de divisórias (redesenho). */
  cabinetH: number
  cabinetDividers: number
  tableX: number
  sofaX: number
  sofaY: number
  sofaW: number
  sofaH: number
  /** Desloca as arestas da parede direita (redesenho da parede). */
  rightWallSlope: number
  /** X da junção parede fundo ↔ parede direita. */
  junctionX: number
  /** Ruído de material determinístico (re-render fiel). */
  texture: boolean
  /** Gradiente vertical de luz (relight fiel). */
  relight: boolean
  /** Shift global de brilho. */
  brightness: number
}

export const DEFAULT_SCENE: SceneParams = {
  width: 512,
  height: 384,
  offsetX: 0,
  vpShift: 0,
  win1X: 60,
  win2W: 80,
  win2H: 70,
  hasDoor: true,
  counterX: 40,
  cabinetH: 40,
  cabinetDividers: 3,
  tableX: 240,
  sofaX: 340,
  sofaY: 200,
  sofaW: 80,
  sofaH: 45,
  rightWallSlope: 0,
  junctionX: 430,
  texture: false,
  relight: false,
  brightness: 0,
}

// ── Desenho em canvas grayscale (Uint8ClampedArray) ───────────────────────────

function fillRect(px: Uint8ClampedArray, W: number, H: number, x: number, y: number, w: number, h: number, v: number) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h))
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) px[yy * W + xx] = v
  }
}

function outlineRect(px: Uint8ClampedArray, W: number, H: number, x: number, y: number, w: number, h: number, v: number, t = 2) {
  fillRect(px, W, H, x, y, w, t, v)
  fillRect(px, W, H, x, y + h - t, w, t, v)
  fillRect(px, W, H, x, y, t, h, v)
  fillRect(px, W, H, x + w - t, y, t, h, v)
}

/** Linha Bresenham com espessura ~3px. */
function drawLine(px: Uint8ClampedArray, W: number, H: number, x0: number, y0: number, x1: number, y1: number, v: number) {
  let ax = Math.round(x0), ay = Math.round(y0)
  const bx = Math.round(x1), by = Math.round(y1)
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay)
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1
  let err = dx + dy
  for (;;) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const X = ax + ox, Y = ay + oy
        if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = v
      }
    }
    if (ax === bx && ay === by) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; ax += sx }
    if (e2 <= dx) { err += dx; ay += sy }
  }
}

/** LCG determinístico (sem Math.random — fixtures reprodutíveis). */
function makeLcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s >>> 16
  }
}

export function renderSceneRaw(overrides: Partial<SceneParams> = {}): { px: Uint8ClampedArray; width: number; height: number } {
  const p: SceneParams = { ...DEFAULT_SCENE, ...overrides }
  const { width: W, height: H, offsetX: off } = p
  const px = new Uint8ClampedArray(W * H).fill(205)

  const LINE = 25
  const jx = p.junctionX + off

  // Teto e piso (diagonais convergindo — pontos de fuga)
  drawLine(px, W, H, off, 60 + p.vpShift, jx, 110, LINE)
  drawLine(px, W, H, off, 330 - p.vpShift, jx, 270, LINE)
  // Junção parede fundo ↔ parede direita
  drawLine(px, W, H, jx, 110, jx, 270, LINE)
  // Parede DIREITA (arestas recuando pra borda)
  drawLine(px, W, H, jx, 110, W - 1, 90 - p.rightWallSlope, LINE)
  drawLine(px, W, H, jx, 270, W - 1, 300 + p.rightWallSlope, LINE)

  // Janelas (parede de fundo)
  fillRect(px, W, H, p.win1X + off, 120, 80, 70, 235)
  outlineRect(px, W, H, p.win1X + off, 120, 80, 70, LINE)
  fillRect(px, W, H, 180 + off, 120, p.win2W, p.win2H, 235)
  outlineRect(px, W, H, 180 + off, 120, p.win2W, p.win2H, LINE)

  // Porta (na parede direita)
  if (p.hasDoor) {
    fillRect(px, W, H, p.junctionX + 10 + off, 140, 40, 110, 190)
    outlineRect(px, W, H, p.junctionX + 10 + off, 140, 40, 110, LINE)
  }

  // Marcenaria (armários com divisórias) sobre a bancada
  fillRect(px, W, H, p.counterX + off, 170, 140, p.cabinetH, 170)
  outlineRect(px, W, H, p.counterX + off, 170, 140, p.cabinetH, LINE)
  for (let d = 1; d <= p.cabinetDividers; d++) {
    const dxPos = p.counterX + off + (140 * d) / (p.cabinetDividers + 1)
    drawLine(px, W, H, dxPos, 172, dxPos, 170 + p.cabinetH - 2, LINE)
  }

  // Bancada
  fillRect(px, W, H, p.counterX + off, 250, 140, 30, 150)
  outlineRect(px, W, H, p.counterX + off, 250, 140, 30, LINE)

  // Mesa
  fillRect(px, W, H, p.tableX + off, 265, 100, 38, 120)
  outlineRect(px, W, H, p.tableX + off, 265, 100, 38, LINE)

  // Sofá
  fillRect(px, W, H, p.sofaX + off, p.sofaY, p.sofaW, p.sofaH, 100)
  outlineRect(px, W, H, p.sofaX + off, p.sofaY, p.sofaW, p.sofaH, LINE)

  // "Re-render fiel": ruído de material + relight + brilho — estrutura intacta
  if (p.texture || p.relight || p.brightness !== 0) {
    const rand = makeLcg(123456789)
    for (let y = 0; y < H; y++) {
      const gain = p.relight ? 0.85 + (0.28 * y) / H : 1
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        let v = px[i] * gain + p.brightness
        if (p.texture) v += (rand() % 33) - 16
        px[i] = v
      }
    }
  }

  return { px, width: W, height: H }
}

export async function renderScenePng(overrides: Partial<SceneParams> = {}): Promise<Buffer> {
  const { px, width, height } = renderSceneRaw(overrides)
  return sharp(Buffer.from(px.buffer as ArrayBuffer, px.byteOffset, px.byteLength), {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer()
}

// ── Variantes nomeadas (checklist do modo render_only) ────────────────────────

/** Re-render FIEL: materiais/ruído + relight + brilho — deve PASSAR no gate. */
export const FAITHFUL_VARIANT: Partial<SceneParams> = { texture: true, relight: true, brightness: 6 }

export const VIOLATIONS: Record<string, Partial<SceneParams>> = {
  janela_movida:        { ...FAITHFUL_VARIANT, win1X: 110 },
  janela_redimensionada:{ ...FAITHFUL_VARIANT, win2W: 118, win2H: 102 },
  porta_removida:       { ...FAITHFUL_VARIANT, hasDoor: false },
  bancada_movida:       { ...FAITHFUL_VARIANT, counterX: 105 },
  marcenaria_redesenhada:{ ...FAITHFUL_VARIANT, cabinetH: 72, cabinetDividers: 0 },
  mesa_movida:          { ...FAITHFUL_VARIANT, tableX: 305 },
  sofa_redimensionado:  { ...FAITHFUL_VARIANT, sofaX: 310, sofaW: 140, sofaH: 72 },
  parede_direita_redesenhada: { ...FAITHFUL_VARIANT, rightWallSlope: 34, junctionX: 462 },
  camera_deslocada:     { ...FAITHFUL_VARIANT, offsetX: 26 },
  pontos_de_fuga_alterados: { ...FAITHFUL_VARIANT, vpShift: 26, rightWallSlope: 18 },
}
