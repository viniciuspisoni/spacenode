// lib/marketing/ads/format.ts
//
// Formatadores compartilhados do painel de tráfego (PT-BR). Puros — usáveis em
// server e client components.

import type { MetricValue } from './metrics'

export function formatBRLFromCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${(fraction * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('pt-BR')
}

export function formatRoas(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${fraction.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
}

// Fuso fixo: saída idêntica no server (UTC) e no browser (BRT) — sem mismatch
// de hidratação nos client components com SSR.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Formata um MetricValue monetário (centavos). */
export function formatMetricBRL(m: MetricValue): string {
  return m.value === null ? '—' : formatBRLFromCents(Math.round(m.value))
}

/** Formata um MetricValue percentual (fração). */
export function formatMetricPercent(m: MetricValue, digits = 1): string {
  return m.value === null ? '—' : formatPercent(m.value, digits)
}
