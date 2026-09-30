import { N_PRINCIPAL } from './geometry';

type StructuralNProps = {
  /** Lado do símbolo em px (grade 64 × 64). */
  size?: number;
  color?: string;
  className?: string;
  title?: string;
  'aria-hidden'?: boolean;
};

/** N estrutural — símbolo oficial da SpaceNode. */
export function StructuralN({
  size = 32,
  color = 'currentColor',
  className,
  title = 'SpaceNode',
  'aria-hidden': ariaHidden,
}: StructuralNProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : title}
      aria-hidden={ariaHidden || undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d={N_PRINCIPAL.apoioEsquerdo} />
      <path d={N_PRINCIPAL.ligacao} />
      <path d={N_PRINCIPAL.apoioDireito} />
    </svg>
  );
}
