// Estado do saldo de nodes — usado pelo anel de consumo (Sprint 4) e
// pela tela de saldo insuficiente.

export type BalanceState = 'saudavel' | 'atencao' | 'critico' | 'zerado'

export const BALANCE_COLORS: Record<BalanceState, string> = {
  saudavel: '#1D9E75',
  atencao:  '#BA7517',
  critico:  '#A32D2D',
  zerado:   '#3a3a3a',
}

// Threshold:
//   ≥50% restante → saudável
//   15-50%        → atenção
//   <15% e >0     → crítico
//   0 ou negativo → zerado
export function getBalanceState(remaining: number, total: number): BalanceState {
  if (total <= 0 || remaining <= 0) return 'zerado'
  const pct = remaining / total
  if (pct < 0.15) return 'critico'
  if (pct < 0.50) return 'atencao'
  return 'saudavel'
}

export function getBalanceColor(remaining: number, total: number): string {
  return BALANCE_COLORS[getBalanceState(remaining, total)]
}

// Percentual restante 0-1, clamped.
export function getBalanceRatio(remaining: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, remaining / total))
}
