import { Brandmark } from './Brandmark';
import { StructuralN } from './StructuralN';
import { WORDMARK_PATH } from './geometry';

type WordmarkSize = 'sm' | 'md' | 'lg'

const HEIGHTS = { sm: 26, md: 32, lg: 40 } as const

interface WordmarkProps {
  size?: WordmarkSize
  showSymbol?: boolean
  showText?: boolean
}

export default function Wordmark({ size = 'md', showSymbol = true, showText = true }: WordmarkProps) {
  const height = HEIGHTS[size]
  if (showSymbol && showText) return <Brandmark size={height} />
  if (showSymbol) return <StructuralN size={height} />
  if (!showText) return null
  return (
    <svg width={(263 * height) / 64} height={height} viewBox="84 0 263 64"
      fill="currentColor" role="img" aria-label="SpaceNode">
      <path d={WORDMARK_PATH} />
    </svg>
  )
}
