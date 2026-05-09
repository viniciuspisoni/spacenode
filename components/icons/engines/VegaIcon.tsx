import type { SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'display'> {
  /** Explicit pixel size. If omitted, sizing comes from className (e.g. Tailwind w-/h-). */
  size?: number | string
  /** Use display variant (thin strokes, smaller center dot) for marketing/large contexts.
   *  Default (false) is optimized for button-size display (16-32px). */
  display?: boolean
}

/**
 * Vega · α Lyrae · Premium engine
 * Outlined elongated 4-point star with central nucleus.
 * Direction A · V1 (Linha)
 */
export function VegaIcon({
  size,
  display = false,
  className,
  ...props
}: IconProps) {
  const strokeWidth = display ? 1.5 : 4
  const dotRadius = display ? 2.5 : 6

  return (
    <svg
      {...(size ? { width: size, height: size } : {})}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Vega"
      {...props}
    >
      <title>Vega</title>
      <path
        d="M50 6 L56 44 L84 50 L56 56 L50 94 L44 56 L16 50 L44 44 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r={dotRadius} fill="currentColor" />
    </svg>
  )
}
