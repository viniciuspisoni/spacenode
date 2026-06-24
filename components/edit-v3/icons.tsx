// components/edit-v3/icons.tsx
//
// Ícones do Editar V3 — SVG inline outlined (stroke currentColor), sem nenhuma
// dependência de biblioteca (convenção do repositório). Tamanho via prop; a cor
// herda do `color` do contexto. stroke-width 1.6, traço limpo estilo Lucide.

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 18, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  }
}

// ── Ferramentas de seleção ───────────────────────────────────────────────────
export const IconWand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8l1.4 1.4M17.8 6.2l1.4-1.4M3 21l9-9M12.2 6.2l-1.4-1.4" />
  </svg>
)

export const IconLasso = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 22a5 5 0 0 1-2-4" />
    <path d="M3.3 14A6.8 6 0 1 1 20 11c0 2.2-1.5 3.5-3 3.5h-6a2 2 0 1 0 0 4" />
    <circle cx="5" cy="20" r="1.5" />
  </svg>
)

export const IconPolygon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l8 5.5-3 9.5H7L4 8.5z" />
  </svg>
)

export const IconBrush = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.06 11.9 16.5 4.5a2.12 2.12 0 0 1 3 3l-7.4 7.44" />
    <path d="M9 12a3 3 0 0 0-3 3c0 1.3-.5 2.3-2 3 1.4 1.2 3 1.5 4.5 1.5A3.5 3.5 0 0 0 12 15a3 3 0 0 0-3-3z" />
  </svg>
)

export const IconEraser = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.12l9-9a1.5 1.5 0 0 1 2.12 0l4.6 4.6a1.5 1.5 0 0 1 0 2.12L13 21z" />
    <path d="M6.5 12.5 11.5 17.5M21 21H8" />
  </svg>
)

export const IconHand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 11V6a1.5 1.5 0 0 0-3 0M15 6.5V5a1.5 1.5 0 0 0-3 0v1.5M12 6.5V5a1.5 1.5 0 0 0-3 0v7" />
    <path d="M9 12v-1.5a1.5 1.5 0 0 0-3 0V14c0 3.3 2.4 6 6 6a6 6 0 0 0 6-6v-2" />
  </svg>
)

export const IconUndo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 7 4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
  </svg>
)

export const IconRedo = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m15 7 5 5-5 5" />
    <path d="M20 12H9a5 5 0 0 0 0 10h1" />
  </svg>
)

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
)

// ── Ações de produto ─────────────────────────────────────────────────────────
export const IconRemove = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
)

export const IconMaterial = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 3 8l9 5 9-5z" />
    <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
  </svg>
)

export const IconInsert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20c0-4 0-7 3-9 2.2-1.5 5-1.4 5-1.4s.1 2.8-1.4 5C16.6 16 13.5 16 12 16" />
    <path d="M12 20c0-3.3 0-5.6-2.2-7.3C8 11.4 5 11.5 5 11.5s-.1 2.6 1.3 4.4C8 17.7 10.4 18 12 18M12 22v-9" />
  </svg>
)

export const IconRefine = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3v4M3 5h4M6 17v4M4 19h4" />
    <path d="m13 4 2.3 5.7L21 12l-5.7 2.3L13 20l-2.3-5.7L5 12l5.7-2.3z" />
  </svg>
)

// ── Diversos ─────────────────────────────────────────────────────────────────
export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)

export const IconHistory = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4M12 8v4l3 2" />
  </svg>
)

export const IconDownload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v10M8 10l4 4 4-4" />
    <path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" />
  </svg>
)

export const IconCompare = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="M12 4v16" strokeDasharray="2 2" />
  </svg>
)
