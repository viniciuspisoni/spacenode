import { Brandmark } from './Brandmark';

type LogoProps = {
  /** Altura do símbolo na assinatura oficial. */
  symbolSize?: number;
  color?: string;
  className?: string;
};

/** Compatibilidade para consumidores anteriores da assinatura horizontal. */
export function Logo({ symbolSize = 36, color = 'currentColor', className }: LogoProps) {
  return (
    <span className={className} style={{ color, display: 'inline-flex' }}>
      <Brandmark size={symbolSize} />
    </span>
  );
}
