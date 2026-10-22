'use client'

import { useId, useState } from 'react'

const CRITERIA = [
  { id: 'project', title: 'Projeto', detail: 'Câmera, aberturas, móveis e objetos correspondem à referência.' },
  { id: 'materials', title: 'Materiais e cores', detail: 'Confira acabamentos, desenhos, paginação e equipamentos.' },
  { id: 'light', title: 'Luz', detail: 'Confira sombras, reflexos e áreas claras sem perder detalhes.' },
  { id: 'details', title: 'Detalhes', detail: 'Amplie para conferir encontros, bordas e textura dos elementos.' },
] as const

interface Props {
  editHref: string
  finishHref: string
  warning: boolean
  onCompare: () => void
}

/** Manual guidance only: never changes audit status or submits useful feedback.
 * The parent keys this component by the output so checks cannot approve another image. */
export default function RenderQualityReview({ editHref, finishHref, warning, onCompare }: Props) {
  const id = useId()
  const [checked, setChecked] = useState<string[]>([])
  const complete = checked.length === CRITERIA.length
  return (
    <details className="spn-glass" style={{ borderRadius: 'var(--r-inner)', padding: '14px 16px', marginTop: 14 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 560, color: 'var(--color-text-primary)' }}>
        Revisar para apresentar
      </summary>
      <p className="spn-hint" style={{ marginTop: 12 }}>
        Compare com o original e confira os pontos importantes para o seu projeto.
      </p>
      {warning && <p role="status" className="spn-hint">
        A verificação automática apontou possíveis diferenças. Confira esses pontos antes de apresentar.
      </p>}
      <fieldset style={{ border: 0, padding: 0, margin: '14px 0', display: 'grid', gap: 12 }}>
        <legend className="sr-only">Conferência visual desta imagem</legend>
        {CRITERIA.map(item => <label key={item.id} htmlFor={`${id}-${item.id}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input id={`${id}-${item.id}`} type="checkbox" checked={checked.includes(item.id)} style={{ marginTop: 3, accentColor: 'var(--color-text-primary)' }}
            onChange={event => {
              const selected = event.currentTarget.checked
              setChecked(current => selected ? [...new Set([...current, item.id])] : current.filter(value => value !== item.id))
            }} />
          <span style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 560, color: 'var(--color-text-primary)' }}>{item.title}</span>
            <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{item.detail}</span>
          </span>
        </label>)}
      </fieldset>
      <p className="spn-hint" role="status" aria-live="polite">
        {complete ? 'Você marcou os quatro pontos como conferidos.' : `${checked.length} de ${CRITERIA.length} pontos conferidos nesta imagem.`}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" className="spn-ghost" onClick={onCompare}>Comparar com original</button>
        <a className="spn-ghost" href={editHref}>Editar detalhes</a>
        <a className="spn-ghost" href={finishHref}>Ajustar luz e cor</a>
      </div>
    </details>
  )
}
