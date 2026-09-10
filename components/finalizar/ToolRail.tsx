'use client'

// ToolRail — barra lateral esquerda de ferramentas do Finalizar.
// Verde apenas no estado ativo (regra do design system).

export type EditorTool = 'edit' | 'adjust' | 'color' | 'masks' | 'geometry' | 'elements' | 'history'

interface ToolDef {
  id: EditorTool
  label: string
  shortcut: string
  icon: React.ReactNode
}

const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// A ordem é o roteiro do trabalho: primeiro muda-se o CONTEÚDO da cena (IA),
// depois trata-se a IMAGEM (ajustes, cor, máscaras, geometria, camadas). Por
// isso Editar abre o trilho — é por onde a pessoa entra.
const TOOLS: ToolDef[] = [
  {
    id: 'edit', label: 'Editar', shortcut: '1',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="m5 16 3.5-1.2L19.3 4a1.8 1.8 0 0 0-2.5-2.5L6 12.3 5 16Z" transform="translate(0 2)" /><path d="M4 21h16" /><path d="m14.5 5.5 2.5 2.5" transform="translate(0 2)" /></svg>,
  },
  {
    id: 'adjust', label: 'Ajustes', shortcut: '2',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2.2" /><circle cx="8" cy="16" r="2.2" /></svg>,
  },
  {
    id: 'color', label: 'Cor', shortcut: '3',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2.5 2.5 0 0 0-2 4c.5.7 0 2-2 2z" /><circle cx="8" cy="10" r="0.6" /><circle cx="12" cy="7.5" r="0.6" /><circle cx="16" cy="10" r="0.6" /></svg>,
  },
  {
    id: 'masks', label: 'Máscaras', shortcut: '4',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="12" r="8" strokeDasharray="3.5 3.5" /><circle cx="12" cy="12" r="3" /></svg>,
  },
  {
    id: 'geometry', label: 'Geometria', shortcut: '5',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22v-4a2 2 0 0 0-2-2H2" /></svg>,
  },
  {
    id: 'elements', label: 'Elementos', shortcut: '6',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M12 2l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></svg>,
  },
  {
    id: 'history', label: 'Histórico', shortcut: '7',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" {...sw}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" /></svg>,
  },
]

interface Props {
  tool: EditorTool
  onTool: (t: EditorTool) => void
}

export function ToolRail({ tool, onTool }: Props) {
  return (
    <nav
      aria-label="Ferramentas"
      className="spn-glass spn-glass--chrome"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 7px', borderWidth: '0 0.5px 0 0',
        flexShrink: 0, position: 'relative', zIndex: 2,
      }}
    >
      {TOOLS.map((t) => {
        const active = tool === t.id
        // Ativo = controle elevado, o mesmo material do polegar do segmentado.
        // O verde continua sendo só a marca de estado, na linha lateral.
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            title={`${t.label} — tecla ${t.shortcut}`}
            aria-pressed={active}
            className={active ? 'spn-glass spn-glass--raised' : undefined}
            style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              width: 52, padding: '8px 0 6px', borderRadius: 'var(--r-inner)',
              border: active ? undefined : '0.5px solid transparent',
              background: active ? undefined : 'transparent',
              color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
              transition: 'color 180ms var(--ease)',
            }}
          >
            {/* estado ativo: linha lateral verde de 2px — único verde do trilho */}
            <span style={{
              position: 'absolute', left: 0, top: 8, bottom: 6, width: 2, borderRadius: 2,
              background: active ? 'var(--color-accent-green)' : 'transparent',
            }} />
            {t.icon}
            <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, letterSpacing: '0.02em' }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
