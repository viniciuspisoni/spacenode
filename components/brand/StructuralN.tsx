import { N_MICRO, N_MICRO_MAX_PX, N_PRINCIPAL } from './geometry';

type StructuralNProps = {
  /** Lado do símbolo em px (grade 64 × 64). */
  size?: number;
  color?: string;
  /** `auto` usa a versão micro de 16 a 31 px e a principal a partir de 32 px. */
  version?: 'auto' | 'principal' | 'micro';
  className?: string;
  title?: string;
  'aria-hidden'?: boolean;
};

/** N estrutural — símbolo oficial da SpaceNode. */
export function StructuralN({
  size = 32,
  color = 'currentColor',
  version = 'auto',
  className,
  title = 'SpaceNode',
  'aria-hidden': ariaHidden,
}: StructuralNProps) {
  const micro = version === 'micro' || (version === 'auto' && size <= N_MICRO_MAX_PX);

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
      {micro ? (
        <path d={N_MICRO} />
      ) : (
        <>
          <path d={N_PRINCIPAL.apoioEsquerdo} />
          <path d={N_PRINCIPAL.ligacao} />
          <path d={N_PRINCIPAL.apoioDireito} />
        </>
      )}
    </svg>
  );
}
