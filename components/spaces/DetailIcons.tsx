'use client'

// Ícones line-art dos cards do eixo Detalhe. Um recorte não tem "cor
// representativa" como a luz tem, então o card mostra um ícone neutro no lugar
// do swatch colorido. Mantém o idioma do projeto (SVG inline, stroke fino).

import type { DetailIconKey } from '@/lib/spaces/axes'

const PATHS: Record<DetailIconKey, React.ReactNode> = {
  layers: (
    <>
      <path d="M12 3 3 7.5l9 4.5 9-4.5-9-4.5Z" />
      <path d="M3 12.5l9 4.5 9-4.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.2 1 2.1v.4h6v-.4c0-.9.3-1.5 1-2.1A6 6 0 0 0 12 3Z" />
    </>
  ),
  sofa: (
    <>
      <path d="M6 11V8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2V11" />
      <rect x="3.5" y="11" width="17" height="6" rx="1.5" />
      <path d="M6 17v2M18 17v2" />
    </>
  ),
  frame: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <rect x="8" y="8" width="8" height="8" rx="0.5" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M12 4v16M4 12h16" />
    </>
  ),
  counter: (
    <>
      <path d="M4 9.5 6 5h12l2 4.5" />
      <path d="M3 9.5h18" />
      <path d="M5 9.5v9M19 9.5v9M5 18.5h14" />
    </>
  ),
  bed: (
    <>
      <path d="M2 17v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4" />
      <path d="M2 17v2.5M22 17v2.5" />
      <path d="M6 11V9a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 18 9v2" />
    </>
  ),
  door: (
    <>
      <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21" />
      <path d="M3.5 21h17" />
      <circle cx="15" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10.5 21v-3h3v3" />
    </>
  ),
  plant: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.3 2.2-5.5 5.5-5.5C17.5 10.8 15.3 13 12 13Z" />
      <path d="M12 14.5c0-3-2-5-5-5 0 3 2 5 5 5Z" />
    </>
  ),
  vase: (
    <>
      <path d="M8.5 3h7" />
      <path d="M9.5 3c0 2.6-2 3.6-2 7a4.5 4.5 0 0 0 9 0c0-3.4-2-4.4-2-7" />
    </>
  ),
}

export function DetailIcon({ name, size = 15 }: { name: DetailIconKey; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
