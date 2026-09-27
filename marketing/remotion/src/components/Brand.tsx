import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { ease, enter } from '../lib/anim';

/** Símbolo oficial em curvas, compartilhado com os demais canais. */
export const Symbol: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <Img src={staticFile('brand/spacenode-symbol.svg')} style={{ width: size, height: size }} />
);

/** Assinatura horizontal oficial, com wordmark em curvas. */
export const Logo: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <Img src={staticFile('brand/spacenode-logo-horizontal.svg')}
    style={{ width: size * 351 / 64, height: size }} />
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
