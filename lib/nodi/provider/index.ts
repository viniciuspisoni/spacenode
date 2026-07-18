// ── Resolução do provedor de IA do Nodi ──────────────────────────────────────
//
// NODI_AI_PROVIDER (env, server-only) decide quem responde pergunta livre:
//   (vazio) | 'off' → sem IA: só a base de conhecimento (determinístico)
//   'gemini'        → lib/nodi/provider/gemini (requer GEMINI_API_KEY)
//
// Pra registrar um provedor novo: implementar NodiAiProvider (./types.ts),
// importar aqui e adicionar um case. A rota /api/nodi/ask não muda.

import type { NodiAiProvider } from './types'
import { geminiNodiProvider } from './gemini'

export function resolveNodiProvider(): NodiAiProvider | null {
  const which = (process.env.NODI_AI_PROVIDER ?? 'off').trim().toLowerCase()
  switch (which) {
    case 'gemini':
      return process.env.GEMINI_API_KEY ? geminiNodiProvider : null
    case 'off':
    case '':
      return null
    default:
      console.warn(`[nodi] NODI_AI_PROVIDER desconhecido: "${which}" — seguindo sem IA`)
      return null
  }
}

export type { NodiAiProvider, NodiProviderInput, NodiProviderResult } from './types'
