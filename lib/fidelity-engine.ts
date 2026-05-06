// lib/fidelity-engine.ts
//
// Analisa a imagem de referência com Claude 3.5 Sonnet (via fal any-llm/vision)
// e retorna um briefing arquitetônico estruturado, usado depois pra montar o
// prompt de geração com fidelidade máxima ao projeto original.

import { fal } from '@fal-ai/client'
import type { BriefingArquitetonico } from '@/lib/prompts'

const FAL_VISION_ENDPOINT = 'fal-ai/any-llm/vision'
const FAL_VISION_MODEL    = 'anthropic/claude-3.5-sonnet'
const VISION_TIMEOUT_MS   = 12_000

const SYSTEM_PROMPT =
  'Você é um arquiteto sênior especializado em análise técnica de imagens de projeto ' +
  '(renders, fotos de maquete, fotos de obra, esquemas 3D). Sua tarefa é descrever a ' +
  'arquitetura visível de forma objetiva, sem opinar. Responda SEMPRE e APENAS com um ' +
  'objeto JSON válido — sem texto antes ou depois, sem markdown, sem ```json fences.'

const USER_PROMPT =
  'Analise a imagem e devolva um JSON com EXATAMENTE estas chaves:\n' +
  '{\n' +
  '  "tipo_projeto": string,           // ex: "fachada residencial contemporânea, sobrado isolado"\n' +
  '  "geometria_principal": string,    // forma geral, linhas dominantes, simetrias\n' +
  '  "volumes": string,                // como os volumes se relacionam (sobrepostos, recuados, em balanço)\n' +
  '  "pavimentos": number,             // quantidade exata de pavimentos visíveis (1, 2, 3...)\n' +
  '  "aberturas": string,              // quantidade, posição e proporção de janelas e portas\n' +
  '  "materiais_aparentes": string,    // materiais visíveis na imagem (concreto, madeira, vidro, ACM, pedra...)\n' +
  '  "camera": string,                 // ângulo, altura, distância aparente da câmera\n' +
  '  "entorno": string,                // contexto visível (rua, vizinhos, vegetação, lote)\n' +
  '  "elementos_preservar": string[],  // 4-8 itens críticos da arquitetura que NÃO podem mudar\n' +
  '  "elementos_melhorar": string[]    // 3-6 melhorias visuais permitidas (textura, luz, vegetação, sombra)\n' +
  '}\n\n' +
  'Regras:\n' +
  '- Conte pavimentos olhando linhas de laje, parapeitos e janelas — não chute.\n' +
  '- Se houver casa vizinha, prédio adjacente ou muro vizinho, inclua em "entorno" e em "elementos_preservar".\n' +
  '- "elementos_preservar" deve sempre conter pelo menos: número de pavimentos, posição das aberturas, ' +
  'volumetria principal, ângulo da câmera.\n' +
  '- "elementos_melhorar" só pode listar coisas visuais (realismo de material, qualidade de luz, sombras, ' +
  'reflexos, vegetação discreta) — NUNCA arquitetura.\n' +
  '- Não invente o que não está visível na imagem.'

function fallbackBriefing(): BriefingArquitetonico {
  return {
    tipo_projeto:        'projeto arquitetônico (análise indisponível)',
    geometria_principal: 'preservar geometria exata da imagem de referência',
    volumes:             'preservar volumetria exata da imagem de referência',
    pavimentos:          0,
    aberturas:           'preservar posição e proporção exata de todas as aberturas da imagem',
    materiais_aparentes: 'preservar materiais visíveis na imagem',
    camera:              'preservar ângulo de câmera, altura e enquadramento da imagem',
    entorno:             'preservar entorno visível na imagem, incluindo edificações vizinhas',
    elementos_preservar: [
      'número de pavimentos',
      'posição das aberturas',
      'volumetria principal',
      'ângulo da câmera',
      'edificações vizinhas se existirem',
    ],
    elementos_melhorar: [
      'realismo de materiais',
      'qualidade de iluminação',
      'sombras e reflexos',
      'vegetação discreta',
    ],
  }
}

function parseBriefing(raw: string): BriefingArquitetonico {
  // remove possível ```json fence se o modelo desobedecer
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned) as Partial<BriefingArquitetonico>
  const fb = fallbackBriefing()

  return {
    tipo_projeto:        typeof parsed.tipo_projeto        === 'string' ? parsed.tipo_projeto        : fb.tipo_projeto,
    geometria_principal: typeof parsed.geometria_principal === 'string' ? parsed.geometria_principal : fb.geometria_principal,
    volumes:             typeof parsed.volumes             === 'string' ? parsed.volumes             : fb.volumes,
    pavimentos:          typeof parsed.pavimentos          === 'number' ? parsed.pavimentos          : fb.pavimentos,
    aberturas:           typeof parsed.aberturas           === 'string' ? parsed.aberturas           : fb.aberturas,
    materiais_aparentes: typeof parsed.materiais_aparentes === 'string' ? parsed.materiais_aparentes : fb.materiais_aparentes,
    camera:              typeof parsed.camera              === 'string' ? parsed.camera              : fb.camera,
    entorno:             typeof parsed.entorno             === 'string' ? parsed.entorno             : fb.entorno,
    elementos_preservar: Array.isArray(parsed.elementos_preservar)
      ? parsed.elementos_preservar.filter((s): s is string => typeof s === 'string')
      : fb.elementos_preservar,
    elementos_melhorar:  Array.isArray(parsed.elementos_melhorar)
      ? parsed.elementos_melhorar.filter((s): s is string => typeof s === 'string')
      : fb.elementos_melhorar,
  }
}

export async function analyzeImage(imageUrl: string): Promise<BriefingArquitetonico> {
  try {
    const result = await Promise.race([
      fal.subscribe(FAL_VISION_ENDPOINT, {
        input: {
          model:         FAL_VISION_MODEL,
          system_prompt: SYSTEM_PROMPT,
          prompt:        USER_PROMPT,
          image_urls:    [imageUrl],
          temperature:   0.1,
          max_tokens:    900,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('VISION_TIMEOUT')), VISION_TIMEOUT_MS)
      ),
    ])

    const output = (result.data as { output?: string })?.output
    if (!output) {
      console.warn('[fidelity-engine] vision retornou output vazio')
      return fallbackBriefing()
    }

    return parseBriefing(output)
  } catch (err) {
    console.error('[fidelity-engine] análise falhou:', (err as Error).message)
    return fallbackBriefing()
  }
}
