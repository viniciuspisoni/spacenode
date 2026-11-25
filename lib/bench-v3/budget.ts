// lib/bench-v3/budget.ts
//
// Trava de gasto da bancada. Cada chamada paga RESERVA o seu teto antes de
// sair; se o já gasto + as reservas abertas + o novo teto passarem do limite,
// a chamada não sai. Depois da resposta, a reserva vira o custo real (ou o
// teto, quando o fornecedor não informa o custo: desconhecido não vira zero).

export class BudgetExceededError extends Error {
  constructor(readonly capUsd: number, readonly committedUsd: number, readonly requestedUsd: number) {
    super(
      `teto de US$ ${capUsd.toFixed(2)} atingido: gasto+reservado US$ ${committedUsd.toFixed(2)}, ` +
      `próxima chamada pede até US$ ${requestedUsd.toFixed(3)}`,
    )
    this.name = 'BudgetExceededError'
  }
}

export interface Reservation { readonly id: number; readonly usd: number }

export class BudgetGuard {
  private spent = 0
  private open = new Map<number, number>()
  private seq = 0

  constructor(readonly capUsd: number, alreadySpentUsd = 0) {
    if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error('teto de orçamento inválido')
    this.spent = alreadySpentUsd
  }

  get spentUsd(): number { return this.spent }
  get reservedUsd(): number { return [...this.open.values()].reduce((a, b) => a + b, 0) }

  reserve(usd: number): Reservation {
    if (!(usd >= 0)) throw new Error('reserva inválida')
    const committed = this.spent + this.reservedUsd
    if (committed + usd > this.capUsd + 1e-9) throw new BudgetExceededError(this.capUsd, committed, usd)
    const id = ++this.seq
    this.open.set(id, usd)
    return { id, usd }
  }

  /** Fecha a reserva com o custo real; `null` = desconhecido, cobra o teto. */
  settle(r: Reservation, actualUsd: number | null): number {
    if (!this.open.has(r.id)) throw new Error('reserva já fechada')
    this.open.delete(r.id)
    const usd = actualUsd === null || !Number.isFinite(actualUsd) ? r.usd : actualUsd
    this.spent += usd
    return usd
  }
}
