import { N_PRINCIPAL } from './geometry';

type BrandLoaderProps = {
  /** Lado em px. Mínimo 32 (a animação usa a versão principal do símbolo). */
  size?: number;
  color?: string;
  label?: string;
  className?: string;
};

/** Carregamento com o N estrutural: os dois apoios e depois a ligação. */
export function BrandLoader({
  size = 40,
  color = 'currentColor',
  label = 'Carregando',
  className,
}: BrandLoaderProps) {
  const side = Math.max(size, 32);

  return (
    <svg
      width={side}
      height={side}
      viewBox="0 0 64 64"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={['sn-loader', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d={N_PRINCIPAL.apoioEsquerdo} />
      <path d={N_PRINCIPAL.apoioDireito} />
      <path d={N_PRINCIPAL.ligacao} />
    </svg>
  );
}
