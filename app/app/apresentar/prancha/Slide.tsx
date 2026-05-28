'use client'

import React from 'react'
import type { CarouselStyle, CarouselSlideRole } from '@/lib/apresentar/config'

// ── Slide ────────────────────────────────────────────────────────────────────
//
// Renderiza um único slide do carrossel como SVG 1080×1350 (proporção 4:5).
// O SVG é exportado depois para PNG via lib/apresentar/svg-to-png.ts.
//
// MVP: um único layout adaptável por design tokens (StyleTokens). Cada estilo
// (Editorial / Minimalista / Premium / Studio Dark) troca cores e fontes.

export const SLIDE_WIDTH  = 1080
export const SLIDE_HEIGHT = 1350

interface StyleTokens {
  bg:             string
  text:           string
  textSoft:       string
  accent:         string
  fontDisplay:    string
  fontBody:       string
  serifDisplay:   boolean
  uppercaseLabel: boolean
}

const TOKENS: Record<CarouselStyle, StyleTokens> = {
  editorial: {
    bg:             '#f5f1eb',
    text:           '#1a1a1a',
    textSoft:       '#5a5550',
    accent:         '#1a1a1a',
    fontDisplay:    'Georgia, "Times New Roman", serif',
    fontBody:       '-apple-system, "Helvetica Neue", Arial, sans-serif',
    serifDisplay:   true,
    uppercaseLabel: true,
  },
  minimalista: {
    bg:             '#ffffff',
    text:           '#0a0a0a',
    textSoft:       '#666666',
    accent:         '#0a0a0a',
    fontDisplay:    '-apple-system, "Helvetica Neue", Arial, sans-serif',
    fontBody:       '-apple-system, "Helvetica Neue", Arial, sans-serif',
    serifDisplay:   false,
    uppercaseLabel: true,
  },
  premium: {
    bg:             '#f8f5f0',
    text:           '#1a1612',
    textSoft:       '#6b5d4f',
    accent:         '#b08d57',
    fontDisplay:    'Georgia, "Times New Roman", serif',
    fontBody:       '-apple-system, "Helvetica Neue", Arial, sans-serif',
    serifDisplay:   true,
    uppercaseLabel: true,
  },
  studio_dark: {
    bg:             '#0d0d0d',
    text:           '#f5f5f5',
    textSoft:       '#8a8a8a',
    accent:         '#f5f5f5',
    fontDisplay:    '-apple-system, "Helvetica Neue", Arial, sans-serif',
    fontBody:       '-apple-system, "Helvetica Neue", Arial, sans-serif',
    serifDisplay:   false,
    uppercaseLabel: true,
  },
}

export interface SlideProps {
  role:         CarouselSlideRole
  style:        CarouselStyle
  imageUrl?:    string                  // imagem do slide (cover + image)
  title?:       string
  subtitle?:    string                  // só cover
  caption?:     string                  // só image
  body?:        string                  // só closing
  studioName?:  string
  slideNumber:  number                  // 1-indexed
  totalSlides:  number
}

// ── Helpers de SVG ───────────────────────────────────────────────────────────

/** Quebra texto em linhas pelo tamanho de cada char aproximado.
 *  Não é tipograficamente perfeito mas funciona p/ títulos curtos. */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current)
      current = w
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── Slide component ──────────────────────────────────────────────────────────

export default function Slide(props: SlideProps) {
  const { role, style } = props
  const t = TOKENS[style]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={SLIDE_WIDTH}
      height={SLIDE_HEIGHT}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      style={{ display: 'block', background: t.bg }}
    >
      {/* Fundo */}
      <rect x="0" y="0" width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill={t.bg} />

      {role === 'cover'   && <CoverSlide   {...props} tokens={t} />}
      {role === 'image'   && <ImageSlide   {...props} tokens={t} />}
      {role === 'closing' && <ClosingSlide {...props} tokens={t} />}
    </svg>
  )
}

// ── Cover ────────────────────────────────────────────────────────────────────

function CoverSlide({ imageUrl, title, subtitle, studioName, tokens: t }: SlideProps & { tokens: StyleTokens }) {
  const titleLines = wrapText(title ?? '', 18)        // ~18 chars/linha
  const titleSize  = titleLines.length > 1 ? 84 : 100
  const startY     = 280

  return (
    <>
      {/* Studio name label */}
      {studioName && (
        <text
          x="80" y="100"
          fill={t.textSoft}
          fontSize="20"
          fontFamily={t.fontBody}
          letterSpacing="4"
          fontWeight="500"
        >
          {t.uppercaseLabel ? studioName.toUpperCase() : studioName}
        </text>
      )}

      {/* Accent line */}
      <line x1="80" y1="130" x2="160" y2="130" stroke={t.accent} strokeWidth="2" />

      {/* Title */}
      {titleLines.map((line, i) => (
        <text key={i}
          x="80"
          y={startY + i * (titleSize * 1.05)}
          fill={t.text}
          fontSize={titleSize}
          fontFamily={t.fontDisplay}
          fontWeight={t.serifDisplay ? '400' : '600'}
          letterSpacing="-2"
        >
          {line}
        </text>
      ))}

      {/* Subtitle */}
      {subtitle && (
        <text
          x="80"
          y={startY + titleLines.length * (titleSize * 1.05) + 40}
          fill={t.textSoft}
          fontSize="26"
          fontFamily={t.fontBody}
          letterSpacing="0.3"
        >
          {subtitle}
        </text>
      )}

      {/* Image (full-bleed na metade inferior, com gradiente sutil) */}
      {imageUrl && (
        <>
          <defs>
            <clipPath id="cover-clip">
              <rect x="80" y="780" width={SLIDE_WIDTH - 160} height={SLIDE_HEIGHT - 780 - 80} rx="4" />
            </clipPath>
          </defs>
          <image
            href={imageUrl}
            x="80"
            y="780"
            width={SLIDE_WIDTH - 160}
            height={SLIDE_HEIGHT - 780 - 80}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#cover-clip)"
          />
        </>
      )}

      {/* Slide indicator */}
      <text
        x={SLIDE_WIDTH - 80}
        y={SLIDE_HEIGHT - 40}
        fill={t.textSoft}
        fontSize="16"
        fontFamily={t.fontBody}
        textAnchor="end"
        letterSpacing="2"
      >
        01
      </text>
    </>
  )
}

// ── Image slide ──────────────────────────────────────────────────────────────

function ImageSlide({ imageUrl, title, caption, studioName, slideNumber, totalSlides, tokens: t }: SlideProps & { tokens: StyleTokens }) {
  const captionLines = caption ? wrapText(caption, 38) : []
  const numStr       = String(slideNumber).padStart(2, '0')
  const totalStr     = String(totalSlides).padStart(2, '0')

  return (
    <>
      {/* Image (top 75%) */}
      {imageUrl && (
        <>
          <defs>
            <clipPath id={`img-clip-${slideNumber}`}>
              <rect x="60" y="60" width={SLIDE_WIDTH - 120} height={SLIDE_HEIGHT * 0.72 - 60} rx="4" />
            </clipPath>
          </defs>
          <image
            href={imageUrl}
            x="60"
            y="60"
            width={SLIDE_WIDTH - 120}
            height={SLIDE_HEIGHT * 0.72 - 60}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#img-clip-${slideNumber})`}
          />
        </>
      )}

      {/* Title */}
      {title && (
        <text
          x="60"
          y={SLIDE_HEIGHT * 0.72 + 70}
          fill={t.text}
          fontSize="38"
          fontFamily={t.fontDisplay}
          fontWeight={t.serifDisplay ? '400' : '600'}
          letterSpacing="-0.5"
        >
          {title}
        </text>
      )}

      {/* Caption */}
      {captionLines.map((line, i) => (
        <text key={i}
          x="60"
          y={SLIDE_HEIGHT * 0.72 + 130 + i * 36}
          fill={t.textSoft}
          fontSize="24"
          fontFamily={t.fontBody}
        >
          {line}
        </text>
      ))}

      {/* Footer: studio + slide counter */}
      {studioName && (
        <text
          x="60"
          y={SLIDE_HEIGHT - 60}
          fill={t.textSoft}
          fontSize="16"
          fontFamily={t.fontBody}
          letterSpacing="3"
          fontWeight="500"
        >
          {t.uppercaseLabel ? studioName.toUpperCase() : studioName}
        </text>
      )}

      <text
        x={SLIDE_WIDTH - 60}
        y={SLIDE_HEIGHT - 60}
        fill={t.textSoft}
        fontSize="16"
        fontFamily={t.fontBody}
        textAnchor="end"
        letterSpacing="2"
      >
        {numStr} / {totalStr}
      </text>
    </>
  )
}

// ── Closing ──────────────────────────────────────────────────────────────────

function ClosingSlide({ title, body, studioName, tokens: t }: SlideProps & { tokens: StyleTokens }) {
  const titleLines = wrapText(title ?? '', 16)
  const bodyLines  = body ? wrapText(body, 32) : []
  const titleSize  = 76
  const startY     = SLIDE_HEIGHT / 2 - (titleLines.length * titleSize * 1.05) / 2 - 40

  return (
    <>
      {/* Accent line top */}
      <line x1={SLIDE_WIDTH / 2 - 30} y1="220" x2={SLIDE_WIDTH / 2 + 30} y2="220" stroke={t.accent} strokeWidth="2" />

      {/* Title centered */}
      {titleLines.map((line, i) => (
        <text key={i}
          x={SLIDE_WIDTH / 2}
          y={startY + i * (titleSize * 1.05)}
          fill={t.text}
          fontSize={titleSize}
          fontFamily={t.fontDisplay}
          fontWeight={t.serifDisplay ? '400' : '600'}
          textAnchor="middle"
          letterSpacing="-1.5"
        >
          {line}
        </text>
      ))}

      {/* Body centered */}
      {bodyLines.map((line, i) => (
        <text key={i}
          x={SLIDE_WIDTH / 2}
          y={startY + titleLines.length * (titleSize * 1.05) + 80 + i * 38}
          fill={t.textSoft}
          fontSize="26"
          fontFamily={t.fontBody}
          textAnchor="middle"
          letterSpacing="0.2"
        >
          {line}
        </text>
      ))}

      {/* Studio mark */}
      {studioName && (
        <>
          <line x1={SLIDE_WIDTH / 2 - 100} y1={SLIDE_HEIGHT - 200} x2={SLIDE_WIDTH / 2 + 100} y2={SLIDE_HEIGHT - 200} stroke={t.accent} strokeWidth="0.5" opacity="0.4" />
          <text
            x={SLIDE_WIDTH / 2}
            y={SLIDE_HEIGHT - 150}
            fill={t.text}
            fontSize="22"
            fontFamily={t.fontDisplay}
            fontWeight={t.serifDisplay ? '400' : '600'}
            textAnchor="middle"
            letterSpacing={t.uppercaseLabel ? '4' : '0'}
          >
            {t.uppercaseLabel ? studioName.toUpperCase() : studioName}
          </text>
        </>
      )}
    </>
  )
}
