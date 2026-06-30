import { ConstellationN } from './ConstellationN';

type LogoProps = {
  /** Altura do símbolo "N" em px. O wordmark escala proporcionalmente. */
  symbolSize?: number;
  color?: string;
  className?: string;
};

/**
 * Logo horizontal institucional — símbolo "N" + wordmark "spacenode".
 * Fonte única da identidade: usado na landing (Navbar) e dentro do app (Sidebar).
 * Monocromático por padrão (sem acento verde no wordmark principal).
 * Em symbolSize=48 reproduz exatamente o lockup da landing page.
 */
export function Logo({ symbolSize = 48, color = 'currentColor', className }: LogoProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: symbolSize * 0.25, color }}
    >
      <ConstellationN size={symbolSize} color={color} aria-hidden />
      <span
        style={{
          fontSize: symbolSize * 0.479,
          fontWeight: 500,
          letterSpacing: '-0.025em',
          lineHeight: 1,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        spacenode
      </span>
    </span>
  );
}
