import type { NodiAttachment } from './v2/types'

const GOALS: Record<string, string> = {
  editar_local: 'Planeje uma correção pontual, preservando o que já está bom.',
  melhorar: 'Avalie quais ajustes específicos resolvem os pontos de atenção. Não escolha ampliar automaticamente.',
  regenerar: 'Confira a imagem de entrada e prepare uma proposta de nova versão com custo explícito.',
  preparar_entrada: 'Oriente o preparo da imagem de entrada antes de considerar outra geração.',
  decidir: 'Ajude a comparar os pontos identificados e escolher o próximo passo.',
  aprovar: 'Ajude a conferir a fidelidade e preparar a apresentação. A análise ainda não representa minha aprovação.',
}

export function reviewFollowUp(decision: string, note: string, reference?: NodiAttachment) {
  if (!reference || reference.kind === 'upload' || !GOALS[decision]) return null
  return { attachment: reference, requireConfirmation: true as const,
    message: `${GOALS[decision]} Preserve os materiais da entrada; restaure apenas as trocas apontadas, sem redesenhar outras superfícies. Pontos da revisão: ${note.slice(0, 400)}. Não execute nem gaste nodes agora.` }
}
