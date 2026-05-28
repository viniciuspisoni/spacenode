// Recommendations — converte intenção do usuário em escolhas técnicas.
//
// Duas fontes de recomendação:
//
//   1. OBJECTIVE_PRESETS: usuário clica num botão de objetivo
//      (ex: "Impressão / prancha") → preenche aba + modo + escala.
//
//   2. analyzeFile: arquivo importado → analisa nome e tamanho para
//      sugerir o melhor modo padrão (sem ser autoritário; o usuário pode
//      trocar à vontade).
//
// Ambas vivem aqui (e não em `costs.ts` ou na UI) para que a regra fique
// testável e isolada de jsx.

import type {
  ModeId,
  ObjectiveId,
  Scale,
  UpscaleTab,
} from './types'

// ── Presets por objetivo ─────────────────────────────────────────────────────

export interface ObjectivePreset {
  tab:    UpscaleTab
  modeId: ModeId
  scale:  Scale
  /** Resumo curto mostrado no tooltip / hover da UI. */
  hint:   string
}

export const OBJECTIVE_PRESETS: Record<ObjectiveId, ObjectivePreset> = {
  client: {
    tab: 'resolution', modeId: 'fidelity', scale: '2x',
    hint: 'Alta Fidelidade em 2× — equilíbrio entre qualidade e velocidade.',
  },
  portfolio: {
    tab: 'resolution', modeId: 'fidelity', scale: '2x',
    hint: 'Alta Fidelidade em 2× — ótimo para Instagram, ~4K.',
  },
  print: {
    tab: 'resolution', modeId: 'fidelity', scale: '4x',
    hint: 'Alta Fidelidade em 4× — pronto para impressão e prancha.',
  },
  recover: {
    tab: 'resolution', modeId: 'recover', scale: '2x',
    hint: 'Modo Recuperar em 2× — reconstrói detalhes em imagens compactadas.',
  },
  final: {
    tab: 'resolution', modeId: 'fidelity', scale: '4x',
    hint: 'Alta Fidelidade em 4× — máximo acabamento para entrega final.',
  },
}

// ── Recomendação automática por arquivo (modo padrão ao subir imagem) ────────

export interface FileSignal {
  fileName: string
  fileSize: number
}

export interface FileRecommendation {
  tab:    UpscaleTab
  modeId: ModeId
  scale:  Scale
  reason: string
}

export function analyzeFile(file: FileSignal): FileRecommendation {
  const name = file.fileName.toLowerCase()

  const recoverHints = ['low', 'baixa', 'comprim', 'old', 'antig', 'screenshot', 'whatsapp']
  if (recoverHints.some(k => name.includes(k))) {
    return {
      tab: 'resolution', modeId: 'recover', scale: '2x',
      reason: 'Nome do arquivo sugere imagem comprimida — modo Recuperar funciona melhor.',
    }
  }

  if (file.fileSize < 200 * 1024) {
    return {
      tab: 'resolution', modeId: 'recover', scale: '2x',
      reason: 'Arquivo pequeno (< 200 KB) — modo Recuperar tira melhor proveito.',
    }
  }

  return {
    tab: 'resolution', modeId: 'fidelity', scale: '4x',
    reason: 'Imagem com qualidade suficiente — Alta Fidelidade preserva detalhes originais.',
  }
}
