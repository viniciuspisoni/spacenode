import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'display'> {
  size?: number | string
  display?: boolean
}

/**
 * Quasar · QSO · Especial engine
 * Tilted accretion disk (-22°) outline with central active galactic nucleus.
 * Direction A · V1 (Linha)
 */
export function QuasarIcon({
  size,
  display = false,
  className,
  ...props
}: IconProps) {
  const strokeWidth = display ? 1.5 : 4
  const dotRadius = display ? 4 : 10

  return (
    <svg
      {...(size ? { width: size, height: size } : {})}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Quasar"
      {...props}
    >
      <title>Quasar</title>
      <ellipse
        cx="50"
        cy="50"
        rx="42"
        ry="11"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        transform="rotate(-22 50 50)"
      />
      <circle cx="50" cy="50" r={dotRadius} fill="currentColor" />
    </svg>
  )
}
