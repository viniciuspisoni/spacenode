// lib/spaces/references.ts
//
// Separação EXPLÍCITA das três entradas de uma geração do Spaces
// (fluxo Referência → Ação → Gerar):
//
//   1. referência GEOMÉTRICA — a imagem cuja geometria/enquadramento/câmera é
//      lei. Escolhida pelo usuário na etapa 1: Vista Mestre, novo print ou
//      imagem do histórico. Sempre Image #1 na chamada ao motor.
//   2. referência de IDENTIDADE VISUAL — de onde vêm materiais, paleta,
//      linguagem, iluminação e contexto do projeto. Vem do DNA do Space (texto)
//      e, quando a referência geométrica é um print cru (sem identidade do
//      projeto), também da imagem da Vista Mestre como Image #2.
//   3. instrução do USUÁRIO — a ação escolhida (Nova Vista / Alterar Luz /
//      Ajustar Materiais / Criar Detalhe) + card/direção/texto livre.
//
// Regra central (princípio do produto): a referência geométrica tem prioridade
// MÁXIMA. A Vista Mestre nunca sobrescreve a geometria de um novo print — em
// conflito entre coerência visual e fidelidade geométrica, a geometria da
// referência atual vence.

import type { GenerationAction, ReferenceKind } from './types'

// ── Conjunto de referências resolvido (server-side) ───────────
//
// Montado pela rota a partir do body validado; consumido pelo prompt builder
// (lib/spaces/reference-prompt.ts) e pelo executor (lib/spaces/generation.ts).

export interface GeometryReference {
  kind:     ReferenceKind
  url:      string
  /** Vista do histórico usada como referência (kind='vista'). */
  vistaId?: string | null
  /** Nome dado pelo usuário ao print (kind='print'). */
  label?:   string | null
}

export interface IdentityReference {
  /** Imagem de identidade (Image #2) — só quando difere da geométrica. */
  imageUrl: string | null
  /** Origem da identidade, para logs/auditoria. */
  source:   'vista_mestre' | 'reference_vista' | 'same_as_geometry'
  /** Vista do Space usada como identidade (multi-DNA legado) — provenance
   *  gravada em vistas.reference_vista_id para o verify-dna comparar contra o
   *  DNA certo. */
  vistaId?: string | null
}

export interface ReferenceSet {
  geometry: GeometryReference
  identity: IdentityReference
}

// Papel de cada imagem enviada ao motor, na ordem de image_urls.
// A geométrica é SEMPRE a primeira (âncora dos motores de edição).
export function imageUrlsFor(refs: ReferenceSet): string[] {
  const urls = [refs.geometry.url]
  if (refs.identity.imageUrl && refs.identity.imageUrl !== refs.geometry.url) {
    urls.push(refs.identity.imageUrl)
  }
  return urls
}

export function hasIdentityImage(refs: ReferenceSet): boolean {
  return !!refs.identity.imageUrl && refs.identity.imageUrl !== refs.geometry.url
}

// ── Rótulos (UI/logs) ─────────────────────────────────────────

export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  vista_mestre: 'Vista Mestre',
  print:        'Novo print',
  vista:        'Imagem do histórico',
}

export const ACTION_LABEL: Record<GenerationAction, string> = {
  nova_vista: 'Nova Vista',
  luz:        'Alterar Luz',
  material:   'Ajustar Materiais',
  detalhe:    'Criar Detalhe',
}

// ── Resumo antes de gerar (etapa 3) ───────────────────────────
//
// O que será preservado × atualizado, por AÇÃO × REFERÊNCIA. Fonte única da
// cópia exibida na UI — muda conforme a ação, como o produto exige. Linguagem
// arquitetônica, sem jargão de IA.

export interface GenerationSummary {
  /** Frase curta descrevendo a referência geométrica usada. */
  referencia: string
  preservado: string[]
  atualizado: string[]
}

export function summaryForGeneration(
  action:  GenerationAction,
  refKind: ReferenceKind,
): GenerationSummary {
  const refFrase: Record<ReferenceKind, string> = {
    vista_mestre: 'Vista Mestre do projeto',
    print:        'seu novo print — a geometria dele é a base desta geração',
    vista:        'imagem escolhida do histórico do projeto',
  }

  const identidade = 'identidade do projeto (materiais, paleta, estilo)'

  if (action === 'nova_vista') {
    if (refKind === 'print') {
      return {
        referencia: refFrase.print,
        preservado: [
          'geometria e enquadramento do print',
          'câmera e perspectiva do print',
          'elementos visíveis no print',
          identidade,
        ],
        atualizado: [
          'realismo (o print vira imagem final)',
          'materiais e luz aplicados sobre o print',
        ],
      }
    }
    return {
      referencia: refFrase[refKind],
      preservado: [
        'arquitetura e proporções do projeto',
        'materiais, paleta e estilo',
        'aberturas e elementos existentes',
      ],
      atualizado: [
        'câmera e enquadramento (nova vista)',
        'o que fica visível no novo ângulo',
      ],
    }
  }

  if (action === 'luz') {
    return {
      referencia: refFrase[refKind],
      preservado: [
        'geometria, câmera e enquadramento',
        'materiais e acabamentos',
        'móveis e objetos como estão',
      ],
      atualizado: [
        'iluminação e atmosfera',
        'céu e sombras coerentes com a nova luz',
      ],
    }
  }

  if (action === 'material') {
    return {
      referencia: refFrase[refKind],
      preservado: [
        'geometria, câmera e enquadramento',
        'todos os demais materiais',
        'móveis, objetos e aberturas',
      ],
      atualizado: [
        'apenas o material que você indicou',
      ],
    }
  }

  // detalhe
  return {
    referencia: refFrase[refKind],
    preservado: [
      'a mesma cena e perspectiva',
      'materiais, paleta e estilo',
      'todos os elementos que ficarem no recorte',
    ],
    atualizado: [
      'enquadramento (aproximação da região escolhida)',
    ],
  }
}
