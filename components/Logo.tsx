/**
 * SpaceNode Logo · Constellation N
 *
 * Construído estritamente conforme o Manual da Marca v1.0 (§2.3):
 *   • Grade 64×64 com margens internas de 16 unidades
 *   • Quatro nós nos vértices do quadrado central 32×32
 *   • Três traços formando a letra N (vertical esquerdo, diagonal, vertical direito)
 *   • Traço 1.5 unidades · raio do nó 3 unidades · linecap/linejoin arredondados
 *
 * Variantes (§2.4):
 *   "default"  → símbolo monocromático (cor herdada via currentColor)
 *   "accent"   → versão com nó luminoso verde (uso de favicon, app icon)
 *
 * Uso:
 *   <Logo size={20} />                     // herda cor do contexto
 *   <Logo size={32} variant="accent" />    // nó verde inferior-direito
 */
type LogoVariant = "default" | "accent";

interface LogoProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  title?: string;
}

export default function Logo({
  size = 22,
  variant = "default",
  className,
  title = "SpaceNode",
}: LogoProps) {
  const accentColor = "#30B46C"; // SpaceNode Green (manual §4.1)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>

      {/* Três traços do N — herdam currentColor */}
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1="16" y1="16" x2="16" y2="48" />
        <line x1="16" y1="16" x2="48" y2="48" />
        <line x1="48" y1="16" x2="48" y2="48" />
      </g>

      {/* Quatro nós · raio 3 */}
      <g fill="currentColor">
        <circle cx="16" cy="16" r="3" />
        <circle cx="48" cy="16" r="3" />
        <circle cx="16" cy="48" r="3" />
        <circle
          cx="48"
          cy="48"
          r="3"
          fill={variant === "accent" ? accentColor : "currentColor"}
        />
      </g>
    </svg>
  );
}
