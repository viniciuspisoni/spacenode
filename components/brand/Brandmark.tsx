import {
  LOCKUP_WIDTH,
  N_GRID,
  N_PRINCIPAL,
  WORDMARK_PATH,
} from './geometry';
import { StructuralN } from './StructuralN';

const TONES = {
  primary: '#151618', // Grafite — fundos claros
  reverse: '#FFFFFF', // Branco — fundos escuros
} as const;

type BrandmarkProps = {
  /** Altura da assinatura em px (grade 64). */
  size?: number;
  /** `horizontal` é a assinatura oficial; `symbol` isola o N estrutural. */
  variant?: 'horizontal' | 'symbol';
  /** `auto` herda a cor do texto (currentColor). */
  tone?: 'auto' | 'primary' | 'reverse';
  /** Esconde o nome mantendo a geometria da assinatura (ex.: sidebar recolhida). */
  wordmarkHidden?: boolean;
  className?: string;
  title?: string;
};

/**
 * Assinatura oficial: N estrutural + wordmark em curvas, com as proporções do manual.
 * A mesma matriz vetorial compõe a assinatura compacta e a principal.
 */
export function Brandmark({
  size = 32,
  variant = 'horizontal',
  tone = 'auto',
  wordmarkHidden = false,
  className,
  title = 'SpaceNode',
}: BrandmarkProps) {
  const color = tone === 'auto' ? 'currentColor' : TONES[tone];

  if (variant === 'symbol') {
    return <StructuralN size={size} color={color} className={className} title={title} />;
  }

  const width = (size * LOCKUP_WIDTH) / N_GRID;
  return (
    <svg
      width={width}
      height={size}
      viewBox={`0 0 ${LOCKUP_WIDTH} ${N_GRID}`}
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <path d={N_PRINCIPAL.apoioEsquerdo} />
      <path d={N_PRINCIPAL.ligacao} />
      <path d={N_PRINCIPAL.apoioDireito} />
      <path
        d={WORDMARK_PATH}
        style={{ opacity: wordmarkHidden ? 0 : 1, transition: 'opacity 180ms ease' }}
      />
    </svg>
  );
}
