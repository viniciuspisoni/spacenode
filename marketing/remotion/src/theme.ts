// Tema único da campanha — traduz marketing/BRIEF.md e brand.md para o Remotion.
// Nenhum componente escreve cor, easing ou spring inline.
import { Easing } from 'remotion';

export const theme = {
  colors: {
    bg: '#0A0A0A',
    card: '#1A1A1A',
    text: '#FFFFFF',
    text2: '#9A9AA0',
    text3: '#6E6E76',
    accent: '#30D158', // funcional, não decorativo — nesta campanha fica sem uso
    line: 'rgba(255,255,255,0.92)',
    glassFill: 'rgba(12,12,12,0.62)',
    glassBorder: 'rgba(255,255,255,0.14)',
    mark: 'rgba(255,255,255,0.95)',
  },
  font: 'Geist, "Geist Sans", -apple-system, "Segoe UI", sans-serif',
  size: {
    hook: 62,
    sub: 34,
    eyebrow: 22,
    credit: 28,
    chip: 24,
    cta: 54,
    url: 30,
    label: 24,
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
    soft: Easing.bezier(0.45, 0, 0.2, 1),
  },
  spring: {
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    settle: { damping: 26, stiffness: 70, mass: 1.1 },
  },
  frame: { w: 1080, h: 1920 },
  // Zona segura dos Reels: nada de texto acima de 220 nem abaixo de 1600.
  safe: { top: 220, bottom: 1600 },
  // Geometria do painel do plugin usada no time-lapse gravado (664x1180 em 208,370 sobre #1A1A1A).
  panel: { x: 208, y: 370, w: 664, h: 1180, srcW: 440, srcH: 780 },
} as const;

export const ASPECT = {
  cozinha: 3200 / 1690,
  sala: 3072 / 2304,
  sketchup43: 1285 / 964,
  siteMobile: 1290 / 6600,
  appVert: 1800 / 2800,
} as const;
