'use client'

import { Sheet } from './glass'
import styles from './RenderRecovery.module.css'

export default function RecoveryEditReview({ open, onClose, onConfirm, instruction, hasSelection, referenceUrl, nodes, busy, actionLabel, settings, selectionMayExpand = false, previewOnly = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void
  instruction: string; hasSelection: boolean; referenceUrl: string | null; nodes: number | null; busy: boolean
  actionLabel: string; settings?: string; selectionMayExpand?: boolean; previewOnly?: boolean
}) {
  return <Sheet id="recovery-edit-review" open={open} title="Revisar ajuste" onClose={onClose} doneLabel="Voltar ao pedido">
    <div className={styles.review}>
      <strong>O que você está pedindo</strong>
      <p>Ação: {actionLabel}{settings ? ` · ${settings}` : ''}</p>
      <p>{instruction.trim() || 'Ajustar a área selecionada com a referência informada.'}</p>
      <p>{hasSelection ? 'Área marcada na imagem. Confira se ela cobre apenas o que você quer ajustar.' : 'Pedido aplicado à imagem sem área marcada. Confira as mudanças ao receber o resultado.'}</p>
      {hasSelection && selectionMayExpand && <p>A opção “Tratar a peça inteira” está ligada: a seleção pode crescer até a superfície antes da edição.</p>}
      {referenceUrl && <div>Referência do pedido
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={referenceUrl} alt="Amostra que será usada neste ajuste" />
      </div>}
      <strong>{nodes === null ? 'Consultando custo…' : `Custo desta edição: ${nodes} Nodes`}</strong>
      <p>{previewOnly ? 'As edições com IA estão pausadas. Esta conferência não envia a edição nem consome Nodes.' : 'O pedido só será enviado ao confirmar abaixo.'}</p>
      <button type="button" className="spn-cta" disabled={busy || nodes === null} onClick={onConfirm}>{busy ? 'Editando…' : nodes === null ? 'Aguarde o custo' : previewOnly ? 'Conferir pedido sem editar' : `Confirmar ajuste · ${nodes} Nodes`}</button>
    </div>
  </Sheet>
}
