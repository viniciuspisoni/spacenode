'use client'

/**
 * Painel contextual — a alternativa in-line à folha (`Sheet`) para o
 * Renderizar. Onde a folha cobre a imagem de referência com um scrim, este
 * painel vive dentro da própria sidebar, na área entre as quatro linhas de
 * ajuste e o dock: a imagem fica livre o tempo todo.
 *
 * Sem portal, sem trava de scroll, sem scrim — não é modal. Só troca de
 * conteúdo dentro do próprio fluxo da coluna, com o próprio scroll interno
 * (`spn-context-body`) para o rodapé nunca se mover.
 */

export interface ContextPanelProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Rótulo do botão de fechar. */
  doneLabel?: string
  /** Id para o `aria-controls` da linha que abre este painel apontar. */
  id?: string
}

export function ContextPanel({ open, title, onClose, children, doneLabel = 'Fechar', id }: ContextPanelProps) {
  return (
    <div className={`spn-context ${open ? 'spn-context--open' : ''}`.trim()}>
      {open && (
        <div id={id} role="region" aria-label={title} className="spn-context-inner">
          <div className="spn-context-head">
            <span className="spn-context-title">{title}</span>
            <button type="button" className="spn-context-close" onClick={onClose}>{doneLabel}</button>
          </div>
          <div className="spn-context-body">{children}</div>
        </div>
      )}
    </div>
  )
}

export default ContextPanel
