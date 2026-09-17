// lib/edit-v4/idempotency.ts
//
// Idempotência do Editar V4 para clientes fora do browser (hoje o plugin
// SketchUp). O problema que resolve: a rede cai DEPOIS do POST, o servidor
// termina e cobra, o cliente perde a resposta — e "tentar de novo" geraria e
// cobraria uma segunda vez o mesmo pedido.
//
// O cliente manda um `client_request_id` (UUID v4) e o REPETE em toda
// retentativa do mesmo pedido. A rota, antes de gerar, procura um job desse
// usuário com esse id e decide:
//   - concluído com resultado → devolve o resultado já pago (replay);
//   - em andamento e recente → 409, o cliente espera e reconcilia;
//   - falhou/recusado, ou "em andamento" velho demais (a função morreu sem
//     fechar o job) → gera de novo, como um pedido novo.
//
// Nada aqui toca banco: é a decisão pura, testável. A busca vive em
// lib/edit-v3/persist.ts e devolve null quando a coluna ainda não existe.

import type { PriorEditJob } from '@/lib/edit-v3/persist'

export const CLIENT_REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Um job "processing" mais velho que isto é considerado morto: o maxDuration
 *  da rota é 300 s, então depois de 15 min ele não vai mais fechar sozinho. */
export const IN_PROGRESS_STALE_MS = 15 * 60_000

export type ReplayDecision =
  | { kind: 'none' }
  | { kind: 'replay'; job: PriorEditJob }
  | { kind: 'in_progress'; job: PriorEditJob }

/** Só aceita UUID: qualquer outra coisa é ignorada (o cliente não ganha um
 *  canal de texto livre para dentro do banco). */
export function parseClientRequestId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return CLIENT_REQUEST_ID_RE.test(value) ? value.toLowerCase() : null
}

export function decideReplay(
  prior: PriorEditJob | null | undefined,
  nowMs: number = Date.now(),
): ReplayDecision {
  if (!prior) return { kind: 'none' }
  if (prior.status === 'completed' && prior.result_image_url) {
    return { kind: 'replay', job: prior }
  }
  if (prior.status === 'processing') {
    const created = Date.parse(prior.created_at)
    const age = Number.isFinite(created) ? nowMs - created : Number.POSITIVE_INFINITY
    if (age >= 0 && age < IN_PROGRESS_STALE_MS) return { kind: 'in_progress', job: prior }
  }
  return { kind: 'none' }
}
