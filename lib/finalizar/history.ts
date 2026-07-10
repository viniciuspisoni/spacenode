// lib/finalizar/history.ts — undo/redo real por snapshot de documento.
//
// O documento inteiro é JSON pequeno (ajustes + traços vetoriais), então cada
// passo do histórico guarda um snapshot completo — undo/redo é trocar de
// snapshot, sem lógica inversa por operação. Arrastos contínuos de slider são
// coalescidos pela chave (`coalesceKey`): enquanto a mesma chave chega dentro
// da janela, o topo é substituído em vez de empilhar dezenas de passos.

import type { FinalizeDoc } from './types'

export interface HistoryStep {
  /** Rótulo exibido no painel de histórico (ex.: "Exposição", "Pincel — Céu"). */
  label: string
  doc: FinalizeDoc
  at: number
}

const MAX_STEPS = 80
const COALESCE_WINDOW_MS = 1200

export class DocHistory {
  private steps: HistoryStep[] = []
  private index = -1
  private lastKey: string | null = null
  private lastPushAt = 0

  /** Inicializa com o estado de abertura (passo 0, não desfazível). */
  reset(doc: FinalizeDoc, label = 'Abertura'): void {
    this.steps = [{ label, doc: clone(doc), at: Date.now() }]
    this.index = 0
    this.lastKey = null
    this.lastPushAt = 0
  }

  /** Registra um novo estado. `coalesceKey` mescla arrastos contínuos do mesmo
   *  controle num único passo. */
  push(label: string, doc: FinalizeDoc, coalesceKey?: string): void {
    const now = Date.now()
    const coalesce = Boolean(
      coalesceKey
      && coalesceKey === this.lastKey
      && now - this.lastPushAt < COALESCE_WINDOW_MS
      && this.index === this.steps.length - 1
      && this.index > 0,
    )

    if (coalesce) {
      this.steps[this.index] = { label, doc: clone(doc), at: now }
    } else {
      this.steps = this.steps.slice(0, this.index + 1)
      this.steps.push({ label, doc: clone(doc), at: now })
      if (this.steps.length > MAX_STEPS) this.steps.shift()
      this.index = this.steps.length - 1
    }
    this.lastKey = coalesceKey ?? null
    this.lastPushAt = now
  }

  undo(): FinalizeDoc | null {
    if (!this.canUndo()) return null
    this.index--
    this.lastKey = null
    return clone(this.steps[this.index].doc)
  }

  redo(): FinalizeDoc | null {
    if (!this.canRedo()) return null
    this.index++
    this.lastKey = null
    return clone(this.steps[this.index].doc)
  }

  /** Volta (ou avança) direto para um passo do painel de histórico. */
  jumpTo(stepIndex: number): FinalizeDoc | null {
    if (stepIndex < 0 || stepIndex >= this.steps.length || stepIndex === this.index) return null
    this.index = stepIndex
    this.lastKey = null
    return clone(this.steps[this.index].doc)
  }

  canUndo(): boolean { return this.index > 0 }
  canRedo(): boolean { return this.index < this.steps.length - 1 }

  /** Lista para o painel: mais recente por último. */
  list(): { label: string; at: number; current: boolean }[] {
    return this.steps.map((s, i) => ({ label: s.label, at: s.at, current: i === this.index }))
  }

  currentIndex(): number { return this.index }
}

function clone(doc: FinalizeDoc): FinalizeDoc {
  // structuredClone existe em todos os alvos deste app (browsers modernos).
  return typeof structuredClone === 'function'
    ? structuredClone(doc)
    : (JSON.parse(JSON.stringify(doc)) as FinalizeDoc)
}
