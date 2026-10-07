import type { GenerationSummary } from './types'
import type { NextBestAction } from './v4/next-action'

export type JourneyStage = 'prepare' | 'generate' | 'wait' | 'review' | 'deliver' | 'recover' | 'unavailable'
export interface NodiJourney {
  stage: JourneyStage
  title: string
  description: string
  /** Account history, never claimed to describe only the open project. */
  scope: 'account'
  generation: { kind: GenerationSummary['kind']; id: string } | null
  next: NextBestAction
}

/** Only observed facts advance the journey; generation != approval or delivery. */
export function computeJourney(input: {
  recent: GenerationSummary[]; available: boolean; balance: number | null; multimodal: boolean
}): NodiJourney {
  const last = input.recent[0]
  const make = (stage: JourneyStage, title: string, description: string, next: NextBestAction): NodiJourney => ({
    stage, title, description, scope: 'account', generation: last ? { kind: last.kind, id: last.id } : null, next,
  })
  const free = (action: string, why: string, href: string): NextBestAction => ({
    identified: '', action, why, estimatedNodes: 0, needsApproval: false, kind: 'navigate', href,
  })
  if (!input.available) return make('unavailable', 'Vamos conferir seu histórico',
    'Parte do histórico está indisponível. Não consigo confirmar sua etapa agora.',
    free('Abrir o Histórico', 'Confira as gerações antes de começar outra.', '/app/history'))
  if (last && ['processing', 'pending', 'queued'].includes(last.status)) return make('wait',
    'Sua geração está em andamento', 'Vamos acompanhar o resultado antes de criar outra versão.',
    free('Acompanhar no Histórico', 'Evita duplicar uma geração ainda em andamento.', '/app/history'))
  if (last && ['failed', 'refunded'].includes(last.status)) return make('recover', 'Vamos resolver a geração',
    'A última geração falhou ou foi estornada. Primeiro vamos conferir a causa.',
    { identified: '', action: 'Diagnosticar a geração', why: 'Corrigir a causa antes de tentar novamente.',
      estimatedNodes: 0, needsApproval: false, kind: 'problem' })
  if (last?.status === 'completed' && last.kind !== 'video') return make('review', 'Vamos revisar seu resultado',
    'A imagem foi concluída. Ainda precisamos conferir fidelidade, materiais e iluminação antes de ampliar ou entregar.',
    input.multimodal ? { identified: '', action: 'Revisar esta imagem com o Nodi',
      why: 'Uma imagem concluída ainda precisa da sua avaliação.', estimatedNodes: 0, needsApproval: false,
      kind: 'chat', chatPrompt: 'Analise esta imagem e compare com a entrada. Confira geometria, perspectiva, materiais e iluminação. Sugira o próximo passo sem iniciar outra geração.' }
      : free('Revisar no Histórico', 'Compare o resultado com o projeto antes de entregar.', '/app/history'))
  if (last?.status === 'completed') return make('deliver', 'Prepare a apresentação',
    'O vídeo foi concluído. Assista, confira o resultado e escolha o que apresentar ao cliente.',
    free('Abrir o resultado no Histórico', 'Conclusão da geração não confirma aprovação ou entrega.', '/app/history'))
  if (last) return make('unavailable', 'Vamos conferir o estado da geração',
    'O estado registrado não permite confirmar a próxima etapa.',
    free('Conferir no Histórico', 'Confirme o resultado antes de seguir.', '/app/history'))
  return make('prepare', 'Do seu modelo à primeira imagem',
    'Conte o que você quer apresentar e prepare um print nítido do modelo, com o enquadramento que deseja preservar.',
    { identified: '', action: 'Planejar minha primeira imagem', why: 'Definir objetivo e entrada antes de gastar Nodes.',
      estimatedNodes: 0, needsApproval: false, kind: 'chat',
      chatPrompt: 'Quero criar minha primeira imagem. Me ajude do preparo do print à revisão final. Pergunte primeiro meu objetivo e se o projeto é interior ou exterior; depois proponha um caminho com custo e confirmação antes de gerar.' })
}
