'use client'

// EditToolRail — as ferramentas de seleção da aba Editar, coladas no canvas.
//
// Ficam sobre o palco e não no painel de propriedades porque é ali que a mão da
// pessoa está: escolher a ferramenta e usar a ferramenta acontecem no mesmo
// lugar. É a mesma decisão que o Editar V4 tinha tomado, e ela some quando
// qualquer outra aba do trilho principal está aberta.
//
// Os ícones são os mesmos do V4 (reexportados de components/edit-v3/icons):
// a ferramenta não pode ter dois desenhos para a mesma coisa.

import {
  IconBrush, IconEraser, IconLasso, IconPolygon, IconWand,
} from '@/components/edit-v3/icons'
import type { EditSubTool } from './CanvasViewport'

/** Retângulo de seleção — o único que o V4 desenhou por conta própria. */
const IconRect = ({ size = 17 }: { size?: number }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden
  >
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" strokeDasharray="3 2.5" />
  </svg>
)

interface ToolDef {
  id: EditSubTool
  label: string
  hint: string
  Icon: typeof IconWand
}

const TOOLS: ToolDef[] = [
  { id: 'wand', label: 'Varinha', hint: 'Clique numa superfície e ela vem inteira', Icon: IconWand },
  { id: 'brush', label: 'Pincel', hint: 'Pinta a seleção à mão', Icon: IconBrush },
  { id: 'eraser', label: 'Borracha', hint: 'Tira da seleção', Icon: IconEraser },
  { id: 'lasso', label: 'Laço', hint: 'Contorna à mão livre · Alt subtrai', Icon: IconLasso },
  { id: 'polygon', label: 'Polígono', hint: 'Clique a clique, para cantos retos · Alt subtrai', Icon: IconPolygon },
  { id: 'rect', label: 'Retângulo', hint: 'Arraste uma caixa · Alt subtrai', Icon: IconRect },
]

interface Props {
  tool: EditSubTool
  onTool: (t: EditSubTool) => void
  /** Falsa com geometria aplicada ou imagem sem CORS — a varinha some. */
  wandAvailable: boolean
  disabled?: boolean
}

export function EditToolRail({ tool, onTool, wandAvailable, disabled }: Props) {
  return (
    <nav
      aria-label="Ferramentas de seleção"
      className="spn-glass spn-glass--chrome"
      style={{
        position: 'absolute', left: 12, top: 12, zIndex: 3,
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 4, borderRadius: 12,
      }}
    >
      {TOOLS.map((t) => {
        if (t.id === 'wand' && !wandAvailable) return null
        const active = tool === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            disabled={disabled}
            title={`${t.label} — ${t.hint}`}
            aria-pressed={active}
            className={active ? 'spn-glass spn-glass--raised' : undefined}
            style={{
              width: 32, height: 32, display: 'grid', placeItems: 'center',
              border: active ? undefined : '0.5px solid transparent',
              background: active ? undefined : 'transparent',
              borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              opacity: disabled ? 0.4 : 1,
              transition: 'color 180ms var(--ease)',
            }}
          >
            <t.Icon size={17} />
          </button>
        )
      })}
    </nav>
  )
}
