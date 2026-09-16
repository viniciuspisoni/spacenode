import React from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '../theme';

/** Fundo da marca: #0A0A0A chapado. Sem mesh, sem gradiente — regra do brand.md. */
export const Bg: React.FC<{ children?: React.ReactNode; color?: string }> = ({ children, color = theme.colors.bg }) => (
  <AbsoluteFill style={{ backgroundColor: color }}>{children}</AbsoluteFill>
);

/**
 * Scrim: escurece topo e/ou base para o texto ler sobre imagem.
 * `full` escurece o quadro inteiro (cartela final).
 */
export const Scrim: React.FC<{
  top?: number; // intensidade 0..1
  bottom?: number;
  full?: number;
  opacity?: number;
}> = ({ top = 0, bottom = 0, full = 0, opacity = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
    {full > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(10,10,10,${full})` }} />}
    {top > 0 && (
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(10,10,10,${top}) 0%, rgba(10,10,10,${top * 0.75}) 18%, rgba(10,10,10,0) 42%)`,
        }}
      />
    )}
    {bottom > 0 && (
      <AbsoluteFill
        style={{
          background: `linear-gradient(0deg, rgba(10,10,10,${bottom}) 0%, rgba(10,10,10,${bottom * 0.7}) 14%, rgba(10,10,10,0) 34%)`,
        }}
      />
    )}
  </AbsoluteFill>
);

/** Vinheta discreta — fotografia de arquitetura bem exposta, não look de filme. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.22 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);
