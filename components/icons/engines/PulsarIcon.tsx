import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'display'> {
  size?: number | string
  display?: boolean
}

/**
 * Pulsar · PSR · Rápido engine
 * Tilted rotation axis (14° from vertical) through central nucleus.
 * Direction A · V1 (Linha)
 */
export function PulsarIcon({
  size,
  display = false,
  className,
  ...props
}: IconProps) {
  const strokeWidth = display ? 1.5 : 4
  const dotRadius = display ? 3.5 : 9

  return (
    <svg
      {...(size ? { width: size, height: size } : {})}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Pulsar"
      {...props}
    >
      <title>Pulsar</title>
      <line
        x1="61"
        y1="6"
        x2="39"
        y2="94"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r={dotRadius} fill="currentColor" />
    </svg>
  )
}
