import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease } from '../lib/anim';

/**
 * Marcação fina: retângulo que se desenha (stroke-dashoffset) e some antes do fim da sequência.
 * Coordenadas em px da caixa onde está inserido.
 */
export const MarkRect: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  delay?: number;
  hold?: number; // frames visível depois de desenhado; default: até 10 frames antes do fim
}> = ({ x, y, w, h, label, delay = 0, hold }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drawn = ease(frame, [delay, delay + 14], [0, 1], theme.ease.out);
  const end = hold !== undefined ? delay + 14 + hold : durationInFrames - 10;
  const out = ease(frame, [end, end + 8], [1, 0], theme.ease.in);
  const labelIn = ease(frame, [delay + 8, delay + 18], [0, 1], theme.ease.out);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: out, pointerEvents: 'none' }}>
      <svg width={x + w + 4} height={y + h + 4} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={6}
          fill="none"
          stroke={theme.colors.mark}
          strokeWidth={2}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawn}
          style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}
        />
      </svg>
      {label && (
        <div
          style={{
            position: 'absolute',
            left: x + 12,
            top: y + 12,
            fontFamily: theme.font,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: theme.colors.text,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(10,10,10,0.78)',
            opacity: labelIn,
            translate: `0px ${(1 - labelIn) * 6}px`,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

/** Linha de alinhamento (horizontal ou vertical) que se estende a partir de um ponto. */
export const MarkLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; delay?: number; label?: string }> = ({ x1, y1, x2, y2, delay = 0, label }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drawn = ease(frame, [delay, delay + 14], [0, 1], theme.ease.out);
  const out = ease(frame, [durationInFrames - 10, durationInFrames - 2], [1, 0], theme.ease.in);
  const labelIn = ease(frame, [delay + 8, delay + 18], [0, 1], theme.ease.out);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: out, pointerEvents: 'none' }}>
      <svg width={Math.max(x1, x2) + 4} height={Math.max(y1, y2) + 4} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <line
          x1={x1}
          y1={y1}
          x2={x1 + (x2 - x1) * drawn}
          y2={y1 + (y2 - y1) * drawn}
          stroke={theme.colors.mark}
          strokeWidth={2}
          strokeDasharray="10 8"
          style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}
        />
      </svg>
      {label && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(x1, x2),
            top: Math.min(y1, y2) - 44,
            fontFamily: theme.font,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: theme.colors.text,
            padding: '6px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(10,10,10,0.78)',
            opacity: labelIn,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
