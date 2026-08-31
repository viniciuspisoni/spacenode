// ── Provedor Gemini do Nodi ───────────────────────────────────────────────────
//
// Reusa lib/gemini (Gemini direto, retry de transiente embutido) — o mesmo
// caminho do DNA/briefing. Saída JSON estrita; qualquer coisa fora do contrato
// vira erro e a rota cai no fallback determinístico da base de conhecimento.
//
// O prompt trava o comportamento: responder SÓ com o que está no contexto e
// nas entradas da base; sem número/valor que não esteja ali; sem prometer
// recurso; incerteza → dizer que não confirma e encaminhar_suporte=true.

import { geminiTextJson } from '@/lib/gemini'
import { clampText } from '../redact'
import type { NodiAiProvider, NodiProviderInput, NodiProviderResult } from './types'

const SYSTEM_PROMPT = `Você é o Nodi, o assistente da SPACENODE — plataforma brasileira de visualização arquitetônica por IA para arquitetos e designers de interiores.

VOZ: arquiteto experiente falando com outro profissional. Direto, claro, calmo, específico. Português brasileiro. Sem emoji, sem exclamações, sem linguagem de marketing, sem jargão de IA (não fale de "modelo", "prompt", "inferência").

REGRAS DURAS:
1. Responda APENAS com base no CONTEXTO e nas ENTRADAS DA BASE fornecidas. Não invente recursos, valores, prazos ou promessas.
2. Números (nodes, preços, durações) só se estiverem literalmente nas entradas da base.
3. Máximo de 4 frases. Nada de listas longas.
4. Se a base não cobre a pergunta com segurança, diga isso com franqueza e marque encaminhar_suporte=true.
5. Perguntas fora da SPACENODE (política, código, assuntos pessoais): recuse com gentileza e volte ao escopo da plataforma.

SAÍDA: JSON puro no formato {"resposta": string, "confianca": "alta"|"media"|"baixa", "encaminhar_suporte": boolean}`

function buildUserPrompt(input: NodiProviderInput): string {
  const { question, context, history, kbCandidates } = input

  const kb = kbCandidates.length
    ? kbCandidates.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`).join('\n\n')
    : '(nenhuma entrada casou com a pergunta)'

  const hist = history.length
    ? history.map(t => `${t.role === 'user' ? 'Usuário' : 'Nodi'}: ${clampText(t.text, 240)}`).join('\n')
    : '(início da conversa)'

  return [
    `CONTEXTO DA PÁGINA: módulo "${context.moduleLabel ?? 'nenhum'}" · rota ${context.route}` +
      (context.projectId ? ` · projeto aberto ${context.projectId}` : ''),
    `ENTRADAS DA BASE:\n${kb}`,
    `CONVERSA ATÉ AQUI:\n${hist}`,
    `PERGUNTA DO USUÁRIO: ${clampText(question, 600)}`,
  ].join('\n\n')
}

interface GeminiPayload {
  resposta?: unknown
  confianca?: unknown
  encaminhar_suporte?: unknown
}

export const geminiNodiProvider: NodiAiProvider = {
  id: 'gemini',
  async answer(input: NodiProviderInput): Promise<NodiProviderResult> {
    const raw = await geminiTextJson({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(input),
      temperature: 0.3,
      maxTokens: 450,
      timeoutMs: 12_000,
    })
    const parsed = JSON.parse(raw) as GeminiPayload
    const text = typeof parsed.resposta === 'string' ? parsed.resposta.trim() : ''
    if (!text) throw new Error('Resposta vazia do provedor')

    const confidence =
      parsed.confianca === 'alta' ? 'high'
      : parsed.confianca === 'baixa' ? 'low'
      : 'medium'

    return {
      text: clampText(text, 900),
      confidence,
      needsSupport: parsed.encaminhar_suporte === true || confidence === 'low',
    }
  },
}
