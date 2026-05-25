import { ConstellationN } from './ConstellationN';

type WordmarkSize = 'sm' | 'md' | 'lg'

const SIZES = {
  sm: { logo: 20, fontSize: 11, gap: 8 },
  md: { logo: 28, fontSize: 13, gap: 10 },
  lg: { logo: 36, fontSize: 16, gap: 13 },
} as const

interface WordmarkProps {
  size?: WordmarkSize
  showSymbol?: boolean
  showText?: boolean
}

export default function Wordmark({ size = 'md', showSymbol = true, showText = true }: WordmarkProps) {
  const s = SIZES[size]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, color: 'currentColor' }}>
      {showSymbol && <ConstellationN size={s.logo} aria-hidden />}
      {showText && (
        <span style={{
          fontSize: s.fontSize,
          fontWeight: 500,
          color: 'currentColor',
          letterSpacing: '-0.025em',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          spacenode
        </span>
      )}
    </span>
  )
}
