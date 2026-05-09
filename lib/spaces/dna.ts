// Extração e verificação de DNA via OpenAI Vision (GPT-4o) através do FAL.
//
// Por que GPT-4o:
//   - Definição do projeto: provider escolhido pra DNA do Spaces.
//   - FAL é o gateway centralizado de modelos do produto — uma única chave,
//     um único cliente, e não vincula a Anthropic via API direta.

import { fal } from '@fal-ai/client'
import type { ProjectDNA, DnaVerification } from './types'

const FAL_VISION_ENDPOINT = 'fal-ai/any-llm/vision'
const DNA_MODEL           = 'openai/gpt-4o'
const DNA_TIMEOUT_MS      = 30_000

// ── Extração ──────────────────────────────────────────────────

const EXTRACT_SYSTEM = (
  'Você é um arquiteto sênior especializado em análise visual de projetos. ' +
  'Sua tarefa é extrair o DNA do projeto a partir da imagem de referência. ' +
  'Responda SEMPRE e APENAS com um objeto JSON válido — sem texto antes ou ' +
  'depois, sem markdown, sem ```json fences.'
)

const EXTRACT_USER = (
  'Analise a imagem e devolva um JSON com EXATAMENTE estas chaves:\n' +
  '{\n' +
  '  "estilo": {\n' +
  '    "nome": string,            // ex: "Contemporâneo escandinavo", "Minimalista tropical"\n' +
  '    "confianca": number        // 0-1, confiança na classificação\n' +
  '  },\n' +
  '  "materiais": [               // 3-5 materiais dominantes detectáveis\n' +
  '    { "nome": string, "hex": string }   // ex: { "nome": "Carvalho claro", "hex": "#C8A678" }\n' +
  '  ],\n' +
  '  "paleta":   string[],        // 5-6 cores hex dominantes da imagem\n' +
  '  "contexto": string[]         // 2-4 tags descritivas: ["Interno","Apartamento","Cozinha integrada"]\n' +
  '}\n\n' +
  'Regras:\n' +
  '- Use TONS REAIS detectados na imagem (hex válido — #RRGGBB).\n' +
  '- Materiais são SUBSTANTIVOS (Carvalho, Travertino, Concreto), não adjetivos ("madeira clara").\n' +
  '- Estilos devem ser nomes reconhecíveis de movimentos arquitetônicos.\n' +
  '- Contexto descreve o ambiente em poucos termos curtos.\n' +
  '- Não invente o que não está visível.'
)

export async function extractDna(imageUrl: string): Promise<ProjectDNA> {
  const result = await Promise.race([
    fal.subscribe(FAL_VISION_ENDPOINT, {
      input: {
        model:         DNA_MODEL,
        system_prompt: EXTRACT_SYSTEM,
        prompt:        EXTRACT_USER,
        image_urls:    [imageUrl],
        temperature:   0.1,
        max_tokens:    900,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNA_EXTRACT_TIMEOUT')), DNA_TIMEOUT_MS)
    ),
  ])

  const output = (result.data as { output?: string })?.output
  if (!output) throw new Error('Vision API returned empty output')

  return parseDna(output)
}

function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

const HEX_RE = /^#[0-9a-f]{6}$/i

function parseDna(raw: string): ProjectDNA {
  const cleaned = stripFence(raw)
  const parsed  = JSON.parse(cleaned) as Partial<ProjectDNA>

  const dna: ProjectDNA = {
    estilo: {
      nome:      typeof parsed.estilo?.nome === 'string' && parsed.estilo.nome.trim()
                 ? parsed.estilo.nome.trim()
                 : 'Estilo não identificado',
      confianca: typeof parsed.estilo?.confianca === 'number'
                 ? Math.max(0, Math.min(1, parsed.estilo.confianca))
                 : 0.5,
    },
    materiais: Array.isArray(parsed.materiais)
      ? parsed.materiais
          .filter(m => m && typeof m.nome === 'string' && typeof m.hex === 'string' && HEX_RE.test(m.hex))
          .slice(0, 5)
      : [],
    paleta: Array.isArray(parsed.paleta)
      ? parsed.paleta.filter(c => typeof c === 'string' && HEX_RE.test(c)).slice(0, 6)
      : [],
    contexto: Array.isArray(parsed.contexto)
      ? parsed.contexto
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map(t => t.trim())
          .slice(0, 4)
      : [],
  }

  if (dna.materiais.length === 0) {
    throw new Error('DNA inválido: lista de materiais vazia')
  }
  if (dna.paleta.length < 3) {
    throw new Error('DNA inválido: paleta com menos de 3 cores')
  }

  return dna
}

// ── Verificação pós-geração ───────────────────────────────────
//
// Roda automaticamente após cada variação. Threshold 0.85 por atributo;
// se falhar, UI mostra warning amber e oferece regeneração sem custo.

const VERIFY_SYSTEM = (
  'Você compara uma imagem gerada com o DNA travado de um projeto. ' +
  'Avalie objetivamente cada atributo e dê um score 0-1. ' +
  'Responda SEMPRE e APENAS com JSON.'
)

export async function verifyDna(
  variationUrl: string,
  dna:          ProjectDNA,
): Promise<DnaVerification> {
  const userPrompt =
    'Compare a imagem com este DNA travado e dê um score 0-1 por atributo:\n\n' +
    `- Estilo: ${dna.estilo.nome}\n` +
    `- Materiais: ${dna.materiais.map(m => m.nome).join(', ')}\n` +
    `- Paleta: ${dna.paleta.join(', ')}\n` +
    `- Contexto: ${dna.contexto.join(', ')}\n\n` +
    'Devolva JSON:\n' +
    '{\n' +
    '  "scores": {\n' +
    '    "estilo":    number,   // 0-1 (1.0 = perfeitamente preservado)\n' +
    '    "materiais": number,\n' +
    '    "paleta":    number,\n' +
    '    "contexto":  number\n' +
    '  },\n' +
    '  "notes": string         // 1 frase com observação se algo desviou; vazio se tudo ok\n' +
    '}'

  const result = await Promise.race([
    fal.subscribe(FAL_VISION_ENDPOINT, {
      input: {
        model:         DNA_MODEL,
        system_prompt: VERIFY_SYSTEM,
        prompt:        userPrompt,
        image_urls:    [variationUrl],
        temperature:   0.1,
        max_tokens:    500,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNA_VERIFY_TIMEOUT')), DNA_TIMEOUT_MS)
    ),
  ])

  const output = (result.data as { output?: string })?.output
  if (!output) throw new Error('Vision API returned empty output')

  return parseVerification(output)
}

function parseVerification(raw: string): DnaVerification {
  const cleaned = stripFence(raw)
  const parsed  = JSON.parse(cleaned) as Partial<DnaVerification>

  const safe = (n: unknown): number =>
    typeof n === 'number' ? Math.max(0, Math.min(1, n)) : 0

  const scores = {
    estilo:    safe(parsed.scores?.estilo),
    materiais: safe(parsed.scores?.materiais),
    paleta:    safe(parsed.scores?.paleta),
    contexto:  safe(parsed.scores?.contexto),
  }

  const overall = (scores.estilo + scores.materiais + scores.paleta + scores.contexto) / 4
  const passed  = scores.estilo    >= 0.85
                && scores.materiais >= 0.85
                && scores.paleta    >= 0.85
                && scores.contexto  >= 0.85

  return {
    scores,
    overall,
    passed,
    notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : undefined,
  }
}
