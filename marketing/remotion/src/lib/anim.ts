import { interpolate, spring, Easing } from 'remotion';
import { theme } from '../theme';

type EasingFn = (t: number) => number;

/** interpolate com clamp dos dois lados e easing obrigatório (nunca linear). */
export const ease = (
  frame: number,
  range: [number, number],
  out: [number, number],
  easing: EasingFn = theme.ease.inOut,
) =>
  interpolate(frame, range, out, {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Progresso 0→1 de uma spring iniciada em `start`. */
export const enter = (
  frame: number,
  start: number,
  fps: number,
  config: { damping: number; stiffness: number; mass: number } = theme.spring.smooth,
) => spring({ frame: frame - start, fps, config });

/** Opacidade de entrada + saída dentro de um intervalo [from, to] (em frames locais). */
export const inOut = (frame: number, from: number, to: number, fin = 10, fout = 8) => {
  const a = ease(frame, [from, from + fin], [0, 1], theme.ease.out);
  const b = ease(frame, [to - fout, to], [1, 0], theme.ease.in);
  return Math.min(a, b);
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const linear = Easing.linear;
