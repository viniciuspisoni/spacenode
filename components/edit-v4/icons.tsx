// Ícones do Editar V4.
//
// O grosso vem do V3 — mesmo desenho, mesma grade 24, traço 1,5, `currentColor`
// — porque as duas telas convivem enquanto o V4 não substitui o V3, e duas
// famílias de ícone para a mesma ferramenta é o tipo de detalhe que faz o
// produto parecer dois produtos. Aqui só entra o que o V4 tem e o V3 não tinha.

export {
  IconWand,
  IconLasso,
  IconPolygon,
  IconBrush,
  IconEraser,
  IconHand,
  IconUndo,
  IconRedo,
  IconTrash,
  IconRemove,
  IconMaterial,
  IconInsert,
  IconRefine,
  IconUpload,
  IconHistory,
  IconDownload,
  IconCompare,
} from '@/components/edit-v3/icons'

interface IconProps {
  size?: number
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

/** Retângulo de seleção. */
export const IconRect = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" strokeDasharray="3 2.5" />
  </svg>
)

/** Substituir objeto: uma forma vira outra. */
export const IconReplace = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <path d="M3 8h11a4 4 0 0 1 0 8H8" />
    <path d="M6 5 3 8l3 3" />
    <path d="M18 13l3 3-3 3" />
  </svg>
)

/** Ampliar / reduzir a seleção. */
export const IconExpand = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <path d="M4 4h3M4 4v3M20 4h-3M20 4v3M4 20h3M4 20v-3M20 20h-3M20 20v-3" />
  </svg>
)

/** Inverter a seleção. */
export const IconInvert = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M20.5 3.5 3.5 20.5" />
    <path d="M8 3.5 3.5 8M20.5 16 16 20.5" />
  </svg>
)

/** Colar na borda (o refino edge-aware). */
export const IconSnap = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <path d="M4 20c3-1 5-4 5-8s2-7 5-8" />
    <path d="M14 4h6v6" />
    <path d="M20 4 9.5 14.5" strokeDasharray="2.5 2.5" />
  </svg>
)

/** Zoom. */
export const IconZoom = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.6-4.6M8 10.5h5M10.5 8v5" />
  </svg>
)
