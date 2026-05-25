import React from 'react';
import { ConstellationN } from './ConstellationN';

type BrandmarkProps = {
  variant?: 'horizontal' | 'vertical' | 'symbol' | 'reverse';
  size?: number;
  color?: string;
  accent?: boolean;
  className?: string;
};

export function Brandmark({
  variant = 'horizontal',
  size = 24,
  color,
  accent = false,
  className,
}: BrandmarkProps) {
  const resolvedColor = color ?? (variant === 'reverse' ? '#FAFAFA' : 'currentColor');

  if (variant === 'symbol') {
    return <ConstellationN size={size} color={resolvedColor} accent={accent} className={className} />;
  }

  const wordmarkStyle: React.CSSProperties = {
    fontFamily: 'var(--font-geist), Geist, ui-sans-serif, system-ui, sans-serif',
    fontWeight: 500,
    fontSize: variant === 'vertical' ? size * 0.55 : size * 0.72,
    letterSpacing: '-0.025em',
    lineHeight: 1,
    color: resolvedColor,
    userSelect: 'none',
  };

  const gap = size * 0.5;

  if (variant === 'vertical') {
    return (
      <div
        className={className}
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap }}
      >
        <ConstellationN size={size} color={resolvedColor} accent={accent} aria-hidden />
        <span style={wordmarkStyle}>spacenode</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap }}
    >
      <ConstellationN size={size} color={resolvedColor} accent={accent} aria-hidden />
      <span style={wordmarkStyle}>spacenode</span>
    </div>
  );
}
