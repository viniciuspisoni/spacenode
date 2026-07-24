// ── Nodi V4 — executor compartilhado (server-only) ───────────────────────────
//
// A execução de uma intent de render vive aqui, usada por DOIS caminhos:
// /api/nodi/v3/execute (confirmação manual) e o autopiloto do chat (auto-
// aprovada dentro dos limites). Sempre a MESMA mecânica: chamada server-side
// ao /api/generate com os cookies do usuário — débito/estorno/histórico do
// pipeline existente, nunca um caminho paralelo de cobrança.

import type { ExecIntent } from '../v3/intents'

export interface ExecutionResult {
  ok: boolean
  outputUrl?: string
  renderId?: string | null
  error?: string
  status?: number
}

export async function executeRenderIntent(
  origin: string,
  cookie: string,
  intent: ExecIntent,
): Promise<ExecutionResult> {
  const upstream = await fetch(`${origin}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      inputUrl: intent.params.inputUrl,
      anchorUrl: intent.params.anchorUrl,
      projectType: intent.params.projectType,
      engine: intent.params.engine,
      resolution: intent.params.resolution,
      refinementText: intent.params.refinementText,
    }),
  }).catch(() => null)

  if (!upstream) return { ok: false, error: 'Não consegui falar com o gerador agora. Nada foi debitado.', status: 502 }

  const payload = await upstream.json().catch(() => null) as
    | { outputUrl?: string; renderRecord?: { id?: string }; error?: string; message?: string }
    | null

  if (!upstream.ok || !payload?.outputUrl) {
    return {
      ok: false,
      error: payload?.message ?? payload?.error ?? 'A geração falhou. Se houve débito, os nodes foram estornados.',
      status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
    }
  }
  return { ok: true, outputUrl: payload.outputUrl, renderId: payload.renderRecord?.id ?? null }
}
