// lib/estudar/types.ts
//
// Tipos do módulo Estudar — estudos preliminares sobre ambientes REAIS
// (fotografia do ambiente + briefing estruturado → 3 alternativas de proposta).
//
// CLIENT-SAFE: só tipos, labels e helpers puros — este arquivo entra no grafo
// dos client components (EstudarClient importa tipos/labels daqui). NUNCA
// importar sharp, fs ou supabase aqui.
//
// `EstudoSourceType` já nasce com 'FLOOR_PLAN' no contrato (tipos + banco)
// para o futuro estudo sobre planta baixa, mas o MVP implementa SOMENTE
// 'PHOTO' — rotas e UI rejeitam/omitem o resto.

export type EstudoSourceType = 'PHOTO' | 'FLOOR_PLAN'

/** Tipos de estudo do briefing (contrato de produto). */
export type EstudoTipo = 'layout' | 'marcenaria' | 'reforma' | 'decoracao'

/** As três alternativas geradas por estudo, em ordem crescente de intervenção. */
export type EstudoVariante = 'essencial' | 'equilibrada' | 'completa'

export type EstudoStatus = 'processing' | 'completed' | 'partial' | 'failed'

export const ESTUDO_TIPOS: EstudoTipo[] = ['layout', 'marcenaria', 'reforma', 'decoracao']
export const ESTUDO_VARIANTES: EstudoVariante[] = ['essencial', 'equilibrada', 'completa']

export const ESTUDO_TIPO_LABELS: Record<EstudoTipo, string> = {
  layout: 'Layout',
  marcenaria: 'Marcenaria',
  reforma: 'Reforma',
  decoracao: 'Decoração',
}

export const ESTUDO_TIPO_DESCRICOES: Record<EstudoTipo, string> = {
  layout: 'Disposição do mobiliário e circulação do ambiente',
  marcenaria: 'Propostas de marcenaria sob medida e móveis planejados',
  reforma: 'Renovação de acabamentos e, se solicitado, alterações estruturais',
  decoracao: 'Camada de decoração: cores, tecidos, iluminação e objetos',
}

export const ESTUDO_VARIANTE_LABELS: Record<EstudoVariante, string> = {
  essencial: 'Essencial',
  equilibrada: 'Equilibrada',
  completa: 'Completa',
}

export const ESTUDO_VARIANTE_DESCRICOES: Record<EstudoVariante, string> = {
  essencial: 'Intervenção mínima — aproveita o que existe e resolve o essencial',
  equilibrada: 'Meio-termo entre custo e impacto — trocas seletivas',
  completa: 'Transformação completa dentro do escopo do estudo',
}

/** Medida real de referência opcional — âncora de escala para o modelo. */
export interface EstudoMedida {
  /** O que foi medido, ex.: "largura da parede do fundo". */
  descricao: string
  valor: number
  unidade: 'cm' | 'm'
}

/** Briefing estruturado do estudo (UI em português; o prompt traduz o contrato). */
export interface EstudoBriefing {
  /** Tipo do ambiente, ex.: "sala de estar", "cozinha". */
  ambienteTipo: string
  /** Uso real, ex.: "família com duas crianças, recebe visitas aos fins de semana". */
  ambienteUso: string
  estudoTipo: EstudoTipo
  /** Itens obrigatórios que TODAS as alternativas precisam contemplar. */
  itensObrigatorios: string
  estilo: string
  materiais: string
  /** Necessidades específicas (acessibilidade, pets, home office…). */
  necessidades: string
  /** Orçamento aproximado, texto livre, ex.: "R$ 20 mil". */
  orcamento: string
  /**
   * Mudanças estruturais desejadas — SÓ consideradas quando estudoTipo é
   * 'reforma'. Vazio = estrutura 100% travada (contrato de produto: só mexe
   * na estrutura quando solicitado explicitamente).
   */
  mudancasEstruturais: string
  /** Instruções adicionais livres. */
  instrucoes: string
}

/** Alternativa gerada (linha de estudo_alternativas exposta ao client). */
export interface EstudoAlternativa {
  id: string
  variante: EstudoVariante
  kind: 'inicial' | 'refino'
  imageUrl: string | null
  prompt: string | null
  status: 'completed' | 'failed'
  errorMessage: string | null
  createdAt: string
}

export interface EstudoResumo {
  id: string
  sourceType: EstudoSourceType
  status: EstudoStatus
  sourceImageUrl: string
  variantesEscolhida: EstudoVariante | null
  folderId: string | null
  createdAt: string
}

/** Aviso legal exibido discretamente em todas as telas de resultado. */
export const ESTUDO_DISCLAIMER =
  'Estudo preliminar para visualização. Não substitui projeto técnico ou executivo.'

/** Normaliza a medida para texto humano usado no prompt (ex.: "3.2 m" / "320 cm"). */
export function formatMedida(medida: EstudoMedida): string {
  return `${medida.valor} ${medida.unidade}`
}

export function isEstudoTipo(v: unknown): v is EstudoTipo {
  return typeof v === 'string' && (ESTUDO_TIPOS as string[]).includes(v)
}

export function isEstudoVariante(v: unknown): v is EstudoVariante {
  return typeof v === 'string' && (ESTUDO_VARIANTES as string[]).includes(v)
}
