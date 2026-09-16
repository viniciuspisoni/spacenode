import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease, enter } from '../lib/anim';

/** ConstellationN — espelha components/brand/ConstellationN.tsx, 100% monocromático. */
export const Symbol: React.FC<{ size?: number; color?: string }> = ({ size = 64, color = theme.colors.text }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
    <g stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1="16" y1="16" x2="16" y2="48" />
      <line x1="16" y1="16" x2="48" y2="48" />
      <line x1="48" y1="16" x2="48" y2="48" />
    </g>
    <g fill={color}>
      <circle cx="16" cy="16" r="3" />
      <circle cx="16" cy="48" r="3" />
      <circle cx="48" cy="48" r="3" />
      <circle cx="48" cy="16" r="3" />
    </g>
  </svg>
);

/** Lockup: símbolo + wordmark, como components/brand/Logo.tsx (gap 12px @48, peso 500, -0.025em). */
export const Logo: React.FC<{ size?: number; color?: string }> = ({ size = 96, color = theme.colors.text }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.25 }}>
    <Symbol size={size} color={color} />
    <span style={{ fontFamily: theme.font, fontSize: size * 0.48, fontWeight: 500, letterSpacing: '-0.025em', color, lineHeight: 1 }}>
      spacenode
    </span>
  </div>
);

/**
 * Cartela final: logo → chamada → URL, com stagger. Entra sobre a imagem já escurecida pelo Scrim.
 */
export const FinalCard: React.FC<{ cta: string; url: string; logoTop?: number; withLogo?: boolean }> = ({ cta, url, logoTop = 700, withLogo = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const p1 = enter(frame, 0, fps, theme.spring.settle);
  const p2 = enter(frame, 6, fps, theme.spring.settle);
  const p3 = enter(frame, 11, fps, theme.spring.settle);
  const out = ease(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], theme.ease.in);
  const block = (p: number): React.CSSProperties => ({
    opacity: Math.min(p, out),
    translate: `0px ${(1 - p) * 16}px`,
  });
  return (
    <AbsoluteFill style={{ fontFamily: theme.font, color: theme.colors.text, textAlign: 'center' }}>
      {withLogo && (
        <div style={{ position: 'absolute', top: logoTop, left: 0, width: '100%', display: 'flex', justifyContent: 'center', ...block(p1) }}>
          <Logo size={104} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: logoTop + 190,
          left: 0,
          width: '100%',
          padding: '0 84px',
          boxSizing: 'border-box',
          fontSize: theme.size.cta,
          fontWeight: 500,
          letterSpacing: '-0.025em',
          lineHeight: 1.12,
          ...block(p2),
        }}
      >
        {cta}
      </div>
      <div
        style={{
          position: 'absolute',
          top: logoTop + 300,
          left: 0,
          width: '100%',
          fontSize: theme.size.url,
          fontWeight: 400,
          letterSpacing: '0.01em',
          color: theme.colors.text2,
          ...block(p3),
        }}
      >
        {url}
      </div>
    </AbsoluteFill>
  );
};
