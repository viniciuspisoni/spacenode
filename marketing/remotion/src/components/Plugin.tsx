import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease, enter } from '../lib/anim';
import { RulerWipe } from './Picture';

const P = theme.panel;
const K = P.w / P.srcW; // 1,509 — escala do painel gravado

/** Converte coordenadas do PNG do painel (440x780) para o quadro. */
export const panelPoint = (px: number, py: number) => ({ x: P.x + px * K, y: P.y + py * K });

/**
 * O painel do plugin, na geometria EXATA do time-lapse gravado (664x1180 em 208,370 sobre #1A1A1A),
 * para que still → vídeo → still não pule um pixel.
 */
export const PanelStage: React.FC<{ src: string; opacity?: number; slideFrom?: number; children?: React.ReactNode }> = ({
  src,
  opacity = 1,
  slideFrom = 0,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = slideFrom ? enter(frame, 0, fps, theme.spring.settle) : 1;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.card, opacity }}>
      <div style={{ position: 'absolute', left: P.x, top: P.y, width: P.w, height: P.h, translate: `${(1 - p) * slideFrom}px 0px`, opacity: slideFrom ? p : 1 }}>
        <Img src={staticFile(src)} style={{ width: P.w, height: P.h, display: 'block' }} />
      </div>
      {children}
    </AbsoluteFill>
  );
};

/** Anel de clique: cresce e some em 14 frames, sobre um ponto do painel. */
export const ClickRing: React.FC<{ px: number; py: number; at: number }> = ({ px, py, at }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 16) return null;
  const s = ease(t, [0, 16], [0.3, 1.6], theme.ease.out);
  const o = Math.min(ease(t, [0, 3], [0, 0.9], theme.ease.out), ease(t, [6, 16], [0.9, 0], theme.ease.in));
  const { x, y } = panelPoint(px, py);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 34,
          top: y - 34,
          width: 68,
          height: 68,
          borderRadius: '50%',
          border: `2px solid ${theme.colors.text}`,
          scale: String(s),
          opacity: o,
        }}
      />
      <div style={{ position: 'absolute', left: x - 6, top: y - 6, width: 12, height: 12, borderRadius: '50%', backgroundColor: theme.colors.text, opacity: o }} />
    </>
  );
};

/**
 * Comparador do painel: dois estados do MESMO painel (captura inteira / render inteiro) com a
 * régua atravessando só a área do preview. Fora do preview os dois PNGs são idênticos.
 */
export const PanelCompare: React.FC<{ progress: number; capture: string; render: string; previewY?: [number, number] }> = ({
  progress,
  capture,
  render,
  previewY = [176, 462],
}) => {
  const rect = { left: P.x, top: P.y, width: P.w, height: P.h };
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.card }}>
      <RulerWipe
        progress={progress}
        rect={rect}
        lineHeight={[previewY[0] * K, previewY[1] * K]}
        under={<Img src={staticFile(capture)} style={{ position: 'absolute', left: P.x, top: P.y, width: P.w, height: P.h }} />}
        over={<Img src={staticFile(render)} style={{ position: 'absolute', left: P.x, top: P.y, width: P.w, height: P.h }} />}
      />
    </AbsoluteFill>
  );
};
