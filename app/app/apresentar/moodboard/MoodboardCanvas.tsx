'use client'

import React from 'react'
import type { MoodboardResult, MoodboardFormat } from '@/lib/apresentar/config'

// ── MoodboardCanvas ──────────────────────────────────────────────────────────
//
// SVG component que renderiza um moodboard em um dos três formatos:
//   - portrait      (1080 × 1350) — Instagram portrait
//   - square        (1080 × 1080) — Instagram feed
//   - a3_landscape  (3508 × 2480) — prancha imprimível
//
// O conteúdo (MoodboardResult: cover, title, concept, palette, materials, tags)
// é gerado pelo Claude Vision em /api/apresentar/moodboard.
// Exportável como PNG via lib/apresentar/svg-to-png.ts.

interface Props {
  format:      MoodboardFormat
  result:      MoodboardResult
  studioName?: string
  projectName?: string
}

// ── Design tokens ────────────────────────────────────────────────────────────
//
// V1: identidade visual única (editorial premium). Os 9 estilos de projeto
// (contemporaneo, japandi etc.) afetam só a copy gerada pelo LLM — o LAYOUT
// permanece consistente para todos. Visual variants ficam pra V2.

const T = {
  bg:           '#f5f1ea',
  bgAlt:        '#ede7dc',
  text:         '#1a1612',
  textSoft:     '#6b5d4f',
  textMuted:    '#a8957f',
  accent:       '#1a1612',
  swatchStroke: 'rgba(26,22,18,0.10)',
  divider:      'rgba(26,22,18,0.12)',
  fontDisplay:  'Georgia, "Times New Roman", serif',
  fontBody:     '-apple-system, "Helvetica Neue", Arial, sans-serif',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w
    if (cand.length > maxChars && cur) { lines.push(cur); cur = w } else { cur = cand }
  }
  if (cur) lines.push(cur)
  return lines
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function MoodboardCanvas({ format, result, studioName, projectName }: Props) {
  const dims = {
    portrait:     { w: 1080, h: 1350 },
    square:       { w: 1080, h: 1080 },
    a3_landscape: { w: 3508, h: 2480 },
  }[format]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={dims.w}
      height={dims.h}
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      style={{ display: 'block', background: T.bg }}
    >
      <rect width={dims.w} height={dims.h} fill={T.bg} />
      {format === 'portrait'     && <PortraitLayout     result={result} studioName={studioName} projectName={projectName} />}
      {format === 'square'       && <SquareLayout       result={result} studioName={studioName} projectName={projectName} />}
      {format === 'a3_landscape' && <A3LandscapeLayout  result={result} studioName={studioName} projectName={projectName} />}
    </svg>
  )
}

// ── Portrait 1080 × 1350 ─────────────────────────────────────────────────────

function PortraitLayout({ result, studioName, projectName }: Omit<Props, 'format'>) {
  const W = 1080
  const PAD = 60
  const COVER_TOP    = 60
  const COVER_HEIGHT = 620                      // ~46% da altura

  const titleLines = wrap(result.title, 22)
  const titleSize  = titleLines.length > 1 ? 44 : 52
  const TEXT_START_Y = COVER_TOP + COVER_HEIGHT + 56

  const conceptLines = wrap(result.concept, 56).slice(0, 4)
  const CONCEPT_Y    = TEXT_START_Y + titleLines.length * (titleSize * 1.1) + 26

  // Palette strip
  const PALETTE_Y    = CONCEPT_Y + conceptLines.length * 26 + 36
  const swatchCount  = result.palette.length
  const swatchGap    = 10
  const swatchW      = (W - PAD * 2 - swatchGap * (swatchCount - 1)) / swatchCount
  const swatchH      = 70

  // Materials list (2 columns)
  const MAT_Y        = PALETTE_Y + swatchH + 26
  const matCols      = 2
  const matColW      = (W - PAD * 2 - 24) / matCols
  const matRowH      = 38
  const matRows      = Math.ceil(result.materials.length / matCols)

  return (
    <>
      {/* Header */}
      {studioName && (
        <text x={PAD} y={42} fill={T.textSoft} fontSize="18" fontFamily={T.fontBody} letterSpacing="3" fontWeight="500">
          {studioName.toUpperCase()}
        </text>
      )}
      <text x={W - PAD} y={42} textAnchor="end" fill={T.textMuted} fontSize="14" fontFamily={T.fontBody} letterSpacing="2">
        MOODBOARD
      </text>

      {/* Cover image OR placeholder */}
      {result.coverUrl ? (
        <>
          <defs>
            <clipPath id="cover-p">
              <rect x={PAD} y={COVER_TOP} width={W - PAD * 2} height={COVER_HEIGHT} rx="6" />
            </clipPath>
          </defs>
          <image
            href={result.coverUrl}
            x={PAD} y={COVER_TOP}
            width={W - PAD * 2} height={COVER_HEIGHT}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#cover-p)"
          />
        </>
      ) : (
        <>
          <rect x={PAD} y={COVER_TOP} width={W - PAD * 2} height={COVER_HEIGHT} fill={T.bgAlt} rx="6" />
          <text x={W / 2} y={COVER_TOP + COVER_HEIGHT / 2 + 6} textAnchor="middle"
            fill={T.textMuted} fontSize="20" fontFamily={T.fontBody} letterSpacing="3">
            SEM REFERÊNCIA
          </text>
        </>
      )}

      {/* Title */}
      {titleLines.map((line, i) => (
        <text key={i}
          x={PAD}
          y={TEXT_START_Y + i * (titleSize * 1.1)}
          fill={T.text} fontSize={titleSize} fontFamily={T.fontDisplay}
          letterSpacing="-1" fontWeight="400">
          {line}
        </text>
      ))}

      {/* Concept */}
      {conceptLines.map((line, i) => (
        <text key={i}
          x={PAD} y={CONCEPT_Y + i * 26}
          fill={T.textSoft} fontSize="18" fontFamily={T.fontBody} letterSpacing="0.2">
          {line}
        </text>
      ))}

      {/* Palette */}
      <PaletteRow x={PAD} y={PALETTE_Y} swatchW={swatchW} swatchH={swatchH} gap={swatchGap} palette={result.palette} labelSize={11} />

      {/* Materials grid */}
      <MaterialsGrid x={PAD} y={MAT_Y} colW={matColW} rowH={matRowH} cols={matCols} rows={matRows} materials={result.materials} />

      {/* Footer */}
      <FooterStrip x={PAD} w={W - PAD * 2} y={1350 - 70} tags={result.tags} projectName={projectName} />
    </>
  )
}

// ── Square 1080 × 1080 ───────────────────────────────────────────────────────

function SquareLayout({ result, studioName, projectName }: Omit<Props, 'format'>) {
  const W = 1080
  const PAD = 50
  const COVER_TOP    = 50
  const COVER_HEIGHT = 460                      // ~43% da altura

  const titleLines = wrap(result.title, 28)
  const titleSize  = titleLines.length > 1 ? 32 : 38
  const TEXT_START_Y = COVER_TOP + COVER_HEIGHT + 42

  const conceptLines = wrap(result.concept, 70).slice(0, 3)
  const CONCEPT_Y    = TEXT_START_Y + titleLines.length * (titleSize * 1.1) + 16

  const PALETTE_Y    = CONCEPT_Y + conceptLines.length * 22 + 28
  const swatchCount  = result.palette.length
  const swatchGap    = 8
  const swatchW      = (W - PAD * 2 - swatchGap * (swatchCount - 1)) / swatchCount
  const swatchH      = 56

  const MAT_Y        = PALETTE_Y + swatchH + 22
  const matCols      = 2
  const matColW      = (W - PAD * 2 - 20) / matCols
  const matRowH      = 32

  return (
    <>
      {studioName && (
        <text x={PAD} y={32} fill={T.textSoft} fontSize="14" fontFamily={T.fontBody} letterSpacing="2.5" fontWeight="500">
          {studioName.toUpperCase()}
        </text>
      )}
      <text x={W - PAD} y={32} textAnchor="end" fill={T.textMuted} fontSize="11" fontFamily={T.fontBody} letterSpacing="2">
        MOODBOARD
      </text>

      {result.coverUrl ? (
        <>
          <defs>
            <clipPath id="cover-s">
              <rect x={PAD} y={COVER_TOP} width={W - PAD * 2} height={COVER_HEIGHT} rx="5" />
            </clipPath>
          </defs>
          <image
            href={result.coverUrl}
            x={PAD} y={COVER_TOP}
            width={W - PAD * 2} height={COVER_HEIGHT}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#cover-s)"
          />
        </>
      ) : (
        <rect x={PAD} y={COVER_TOP} width={W - PAD * 2} height={COVER_HEIGHT} fill={T.bgAlt} rx="5" />
      )}

      {titleLines.map((line, i) => (
        <text key={i} x={PAD} y={TEXT_START_Y + i * (titleSize * 1.1)}
          fill={T.text} fontSize={titleSize} fontFamily={T.fontDisplay} letterSpacing="-0.5" fontWeight="400">
          {line}
        </text>
      ))}

      {conceptLines.map((line, i) => (
        <text key={i} x={PAD} y={CONCEPT_Y + i * 22}
          fill={T.textSoft} fontSize="15" fontFamily={T.fontBody}>
          {line}
        </text>
      ))}

      <PaletteRow x={PAD} y={PALETTE_Y} swatchW={swatchW} swatchH={swatchH} gap={swatchGap} palette={result.palette} labelSize={10} />

      <MaterialsGrid x={PAD} y={MAT_Y} colW={matColW} rowH={matRowH} cols={matCols} rows={Math.ceil(result.materials.length / matCols)} materials={result.materials} compact />

      <FooterStrip x={PAD} w={W - PAD * 2} y={1080 - 50} tags={result.tags} projectName={projectName} />
    </>
  )
}

// ── A3 Landscape 3508 × 2480 ─────────────────────────────────────────────────

function A3LandscapeLayout({ result, studioName, projectName }: Omit<Props, 'format'>) {
  const W = 3508
  const H = 2480
  const PAD = 140
  const COVER_W = 1880
  const COVER_H = H - PAD * 2

  // Right column
  const RIGHT_X = PAD + COVER_W + 110
  const RIGHT_W = W - RIGHT_X - PAD

  // Top of right column starts after header
  const RIGHT_START_Y = PAD + 90
  const titleLines = wrap(result.title, 22)
  const titleSize  = 110
  const conceptLines = wrap(result.concept, 50).slice(0, 5)
  const CONCEPT_Y    = RIGHT_START_Y + titleLines.length * (titleSize * 1.05) + 80

  const PALETTE_Y    = CONCEPT_Y + conceptLines.length * 60 + 100
  const swatchCount  = result.palette.length
  const swatchGap    = 24
  const swatchW      = (RIGHT_W - swatchGap * (swatchCount - 1)) / swatchCount
  const swatchH      = 180

  const MAT_Y        = PALETTE_Y + swatchH + 96
  const matCols      = 2
  const matColW      = (RIGHT_W - 50) / matCols
  const matRowH      = 100

  return (
    <>
      {/* Header (top of page) */}
      {studioName && (
        <text x={PAD} y={PAD + 10} fill={T.textSoft} fontSize="46" fontFamily={T.fontBody} letterSpacing="8" fontWeight="500">
          {studioName.toUpperCase()}
        </text>
      )}
      <text x={W - PAD} y={PAD + 10} textAnchor="end" fill={T.textMuted} fontSize="36" fontFamily={T.fontBody} letterSpacing="6">
        MOODBOARD
      </text>

      {/* Vertical divider */}
      <line x1={PAD + COVER_W + 55} y1={PAD + 30} x2={PAD + COVER_W + 55} y2={H - PAD - 30}
        stroke={T.divider} strokeWidth="1" />

      {/* Cover image */}
      {result.coverUrl ? (
        <>
          <defs>
            <clipPath id="cover-a3">
              <rect x={PAD} y={PAD} width={COVER_W} height={COVER_H} rx="10" />
            </clipPath>
          </defs>
          <image
            href={result.coverUrl}
            x={PAD} y={PAD}
            width={COVER_W} height={COVER_H}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#cover-a3)"
          />
        </>
      ) : (
        <>
          <rect x={PAD} y={PAD} width={COVER_W} height={COVER_H} fill={T.bgAlt} rx="10" />
          <text x={PAD + COVER_W / 2} y={PAD + COVER_H / 2} textAnchor="middle"
            fill={T.textMuted} fontSize="48" fontFamily={T.fontBody} letterSpacing="6">
            SEM REFERÊNCIA
          </text>
        </>
      )}

      {/* Title in right column */}
      {titleLines.map((line, i) => (
        <text key={i} x={RIGHT_X} y={RIGHT_START_Y + i * (titleSize * 1.05)}
          fill={T.text} fontSize={titleSize} fontFamily={T.fontDisplay} letterSpacing="-3" fontWeight="400">
          {line}
        </text>
      ))}

      {conceptLines.map((line, i) => (
        <text key={i} x={RIGHT_X} y={CONCEPT_Y + i * 60}
          fill={T.textSoft} fontSize="44" fontFamily={T.fontBody}>
          {line}
        </text>
      ))}

      <PaletteRow x={RIGHT_X} y={PALETTE_Y} swatchW={swatchW} swatchH={swatchH} gap={swatchGap} palette={result.palette} labelSize={26} />

      <MaterialsGrid x={RIGHT_X} y={MAT_Y} colW={matColW} rowH={matRowH} cols={matCols} rows={Math.ceil(result.materials.length / matCols)} materials={result.materials} large />

      {/* Footer */}
      <FooterStrip x={PAD} w={W - PAD * 2} y={H - PAD + 30} tags={result.tags} projectName={projectName} large />
    </>
  )
}

// ── Sub-componentes reutilizáveis ────────────────────────────────────────────

function PaletteRow({ x, y, swatchW, swatchH, gap, palette, labelSize }: {
  x: number; y: number; swatchW: number; swatchH: number; gap: number;
  palette: MoodboardResult['palette']; labelSize: number;
}) {
  return (
    <g>
      {palette.map((s, i) => {
        const sx = x + i * (swatchW + gap)
        return (
          <g key={i}>
            <rect x={sx} y={y} width={swatchW} height={swatchH} fill={s.hex}
              stroke={T.swatchStroke} strokeWidth="0.5" rx="4" />
            <text x={sx + swatchW / 2} y={y + swatchH + labelSize + 8} textAnchor="middle"
              fill={T.textMuted} fontSize={labelSize} fontFamily={T.fontBody} letterSpacing="1">
              {s.hex}
            </text>
            {labelSize >= 14 && (
              <text x={sx + swatchW / 2} y={y + swatchH + labelSize * 2 + 12} textAnchor="middle"
                fill={T.textSoft} fontSize={labelSize - 2} fontFamily={T.fontBody}>
                {s.name}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function MaterialsGrid({ x, y, colW, rowH, cols, rows, materials, compact = false, large = false }: {
  x: number; y: number; colW: number; rowH: number; cols: number; rows: number;
  materials: MoodboardResult['materials']; compact?: boolean; large?: boolean;
}) {
  const categorySize = large ? 26 : compact ? 9  : 10
  const nameSize     = large ? 38 : compact ? 14 : 16
  const noteSize     = large ? 24 : compact ? 11 : 12

  return (
    <g>
      {materials.map((m, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const mx = x + col * (colW + (large ? 50 : 24))
        const my = y + row * rowH

        return (
          <g key={i}>
            <text x={mx} y={my + categorySize} fill={T.textMuted}
              fontSize={categorySize} fontFamily={T.fontBody}
              letterSpacing={large ? '4' : '1.5'} fontWeight="600">
              {m.category.toUpperCase()}
            </text>
            <text x={mx} y={my + categorySize + nameSize + (large ? 18 : 8)}
              fill={T.text} fontSize={nameSize} fontFamily={T.fontDisplay} fontWeight="400">
              {m.name}
            </text>
            {m.note && (
              <text x={mx} y={my + categorySize + nameSize + noteSize + (large ? 38 : 22)}
                fill={T.textSoft} fontSize={noteSize} fontFamily={T.fontBody}>
                {m.note}
              </text>
            )}
          </g>
        )
      })}
      {/* Para preencher linhas mesmo vazias (evita layout colapsado) */}
      {rows === 0 && <rect x={x} y={y} width="1" height="1" fill="transparent" />}
    </g>
  )
}

function FooterStrip({ x, w, y, tags, projectName, large = false }: {
  x: number; w: number; y: number; tags: string[]; projectName?: string; large?: boolean;
}) {
  const tagSize  = large ? 30 : 12
  const projSize = large ? 30 : 12
  const tagsStr  = tags.slice(0, 5).join('  ·  ')
  return (
    <g>
      <line x1={x} y1={y - (large ? 30 : 14)} x2={x + w} y2={y - (large ? 30 : 14)}
        stroke={T.divider} strokeWidth={large ? 1.5 : 0.5} />
      <text x={x} y={y} fill={T.textSoft} fontSize={tagSize} fontFamily={T.fontBody} letterSpacing="1">
        {tagsStr}
      </text>
      {projectName && (
        <text x={x + w} y={y} textAnchor="end"
          fill={T.textSoft} fontSize={projSize} fontFamily={T.fontDisplay} fontWeight="500">
          {projectName}
        </text>
      )}
    </g>
  )
}
