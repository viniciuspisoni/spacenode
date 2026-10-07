import type { CSSProperties, ReactEventHandler } from 'react'

interface Props {
  before: string
  after: string
  sliderPos: number
  pan: { x: number; y: number }
  scale: number
  imageStyle: CSSProperties
  onBeforeLoad?: ReactEventHandler<HTMLImageElement>
}

/** Original on the left, generated image on the right, including while zoomed/panned. */
export default function RenderComparisonImages({ before, after, sliderPos, pan, scale, imageStyle, onBeforeLoad }: Props) {
  const transform: CSSProperties = { position: 'absolute', inset: 0,
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }
  return <>
    <div style={transform}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt="Antes" style={imageStyle} draggable={false} onLoad={onBeforeLoad} />
    </div>
    <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${sliderPos}%)`, pointerEvents: 'none' }}>
      <div style={transform}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="Depois" style={imageStyle} draggable={false} />
      </div>
    </div>
  </>
}
