import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease, enter } from '../lib/anim';

const { w: W } = theme.frame;

/**
 * Entrada: opacity + translateY (spring), 2 propriedades juntas. Saída mais rápida que a entrada.
 * O componente lê a duração da própria <Sequence> para saber quando sair.
 */
const useReveal = (delay = 0, exitFrames = 8) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p = enter(frame, delay, fps, theme.spring.smooth);
  const out = ease(frame, [durationInFrames - exitFrames, durationInFrames - 1], [1, 0], theme.ease.in);
  return {
    opacity: Math.min(p, out),
    translate: `0px ${(1 - p) * 18 - (1 - out) * 10}px`,
  };
};

const base: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  width: W,
  fontFamily: theme.font,
  color: theme.colors.text,
  textAlign: 'center',
  boxSizing: 'border-box',
  padding: '0 84px',
  whiteSpace: 'pre-line',
};

/** Hook: ≤ 8 palavras, minúsculas com ponto final. */
export const Hook: React.FC<{
  text: string;
  top?: number;
  size?: number;
  delay?: number;
  glass?: boolean; // cartão de vidro atrás (para ler sobre UI clara)
  weight?: number;
  color?: string;
}> = ({ text, top = 300, size = theme.size.hook, delay = 0, glass = false, weight = 500, color = theme.colors.text }) => {
  const r = useReveal(delay);
  const inner = (
    <span
      style={{
        display: 'inline-block',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.025em',
        lineHeight: 1.12,
        color,
        ...(glass
          ? {
              padding: '18px 34px',
              borderRadius: 26,
              backgroundColor: theme.colors.glassFill,
              border: `1px solid ${theme.colors.glassBorder}`,
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
            }
          : null),
      }}
    >
      {text}
    </span>
  );
  return (
    <div style={{ ...base, top, opacity: r.opacity, translate: r.translate }}>
      {inner}
    </div>
  );
};

export const Sub: React.FC<{ text: string; top: number; size?: number; delay?: number; color?: string }> = ({
  text,
  top,
  size = theme.size.sub,
  delay = 4,
  color = theme.colors.text2,
}) => {
  const r = useReveal(delay);
  return (
    <div style={{ ...base, top, fontSize: size, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3, color, opacity: r.opacity, translate: r.translate }}>
      {text}
    </div>
  );
};

/** Eyebrow no padrão da landing: uppercase, 0.22em, fios finos dos dois lados. */
export const Eyebrow: React.FC<{ text: string; top: number; delay?: number; left?: number; align?: 'center' | 'left' }> = ({
  text,
  top,
  delay = 0,
  left,
  align = 'center',
}) => {
  const r = useReveal(delay);
  return (
    <div
      style={{
        ...base,
        top,
        left: left ?? 0,
        width: left === undefined ? W : undefined,
        padding: left === undefined ? '0 84px' : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        gap: 14,
        opacity: r.opacity,
        translate: r.translate,
      }}
    >
      {align === 'center' && <span style={{ width: 28, height: 1, backgroundColor: theme.colors.text3 }} />}
      <span style={{ fontSize: theme.size.eyebrow, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: theme.colors.text2 }}>
        {text}
      </span>
      {align === 'center' && <span style={{ width: 28, height: 1, backgroundColor: theme.colors.text3 }} />}
    </div>
  );
};

/** Crédito do projeto — fica NA PEÇA, sempre que houver projeto de cliente em cena. */
export const Credit: React.FC<{ author: string; top?: number; delay?: number }> = ({ author, top = 1540, delay = 0 }) => {
  const r = useReveal(delay);
  return (
    <div style={{ ...base, top, fontSize: theme.size.credit, fontWeight: 400, letterSpacing: '0.01em', color: theme.colors.text2, opacity: r.opacity, translate: r.translate }}>
      <span style={{ color: theme.colors.text3 }}>projeto</span>
      <span style={{ margin: '0 12px', color: theme.colors.text3 }}>·</span>
      <span style={{ color: theme.colors.text }}>{author}</span>
    </div>
  );
};

/** Pílula de vidro para uma informação curta (ex.: "espera comprimida"). */
export const Chip: React.FC<{ text: string; top: number; delay?: number; left?: number; size?: number }> = ({ text, top, delay = 0, left, size = theme.size.chip }) => {
  const r = useReveal(delay);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: left ?? 0,
        width: left === undefined ? W : undefined,
        display: 'flex',
        justifyContent: 'center',
        opacity: r.opacity,
        translate: r.translate,
      }}
    >
      <span
        style={{
          fontFamily: theme.font,
          fontSize: size,
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: theme.colors.text,
          padding: '10px 22px',
          borderRadius: 999,
          backgroundColor: theme.colors.glassFill,
          border: `1px solid ${theme.colors.glassBorder}`,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
};

/** Etiqueta pequena e fixa (ex.: "modelo" / "resultado" nas caixas do split). */
export const Label: React.FC<{ text: string; left: number; top: number; delay?: number; dark?: boolean }> = ({ text, left, top, delay = 0, dark = true }) => {
  const r = useReveal(delay);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        fontFamily: theme.font,
        fontSize: theme.size.label,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: theme.colors.text,
        padding: '8px 16px',
        borderRadius: 10,
        backgroundColor: dark ? 'rgba(10,10,10,0.72)' : 'rgba(255,255,255,0.85)',
        opacity: r.opacity,
        translate: r.translate,
      }}
    >
      {text}
    </div>
  );
};
