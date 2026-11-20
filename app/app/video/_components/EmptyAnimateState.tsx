'use client'

interface Props {
  onPick: () => void
  onPickFromHistory: () => void
  isDragging?: boolean
}

export default function EmptyAnimateState({ onPick, onPickFromHistory, isDragging }: Props) {
  return (
    <div className="spn-empty spn-animate-empty" style={{
      borderColor: isDragging ? 'var(--color-border-focus)' : undefined,
      background: isDragging ? 'var(--color-chip)' : undefined,
    }}>
      <div className="spn-glass spn-glass--raised spn-animate-empty-icon" aria-hidden="true">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="14" height="14" rx="3" /><path d="m16 10 6-4v12l-6-4" />
        </svg>
      </div>
      <h2>Dê movimento ao seu projeto.</h2>
      <p>Envie um render de interior, fachada ou detalhe. Escolha o movimento e crie um vídeo para apresentar ao cliente.</p>
      <div className="spn-animate-empty-actions">
        <button type="button" className="spn-cta" onClick={onPick}>Enviar imagem</button>
        <button type="button" className="spn-ghost" onClick={onPickFromHistory}>Usar do histórico</button>
      </div>
      <span className="spn-animate-file-note">Ou arraste aqui · JPG, PNG e WEBP · até 20 MB</span>
    </div>
  )
}
