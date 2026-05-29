// lib/fidelity-engine.ts
//
// Analisa a imagem de referência com Gemini Vision (gemini-2.5-flash, direto) e
// retorna um briefing arquitetônico estruturado, usado depois pra montar o
// prompt de geração com fidelidade máxima ao projeto original.
//
// Antes via gateway FAL `any-llm/vision` (claude-3.5-sonnet, depois gpt-4o) —
// migrado pro Gemini direto porque o gateway ficou instável e o claude morreu
// lá (400). Ver lib/gemini.ts. analyzeImage continua à prova de falha:
// qualquer erro cai no fallbackBriefing (não derruba o caller).

import { geminiVisionJson } from '@/lib/gemini'
import type { BriefingArquitetonico } from '@/lib/prompts'

const VISION_TIMEOUT_MS = 20_000

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
  '  "elementos_preservar": string[],  // 6-10 itens da imagem que NÃO podem mudar — sempre incluir materiais, texturas, móveis e decoração\n' +
  '  "elementos_melhorar": string[]    // 0-3 ajustes mínimos de fotorrealismo, OU array vazio se a imagem já estiver realista\n' +
  '}\n\n' +
  'Regras:\n' +
  '- Conte pavimentos olhando linhas de laje, parapeitos e janelas — não chute.\n' +
  '- Se houver casa vizinha, prédio adjacente ou muro vizinho, inclua em "entorno" e em "elementos_preservar".\n' +
  '- "elementos_preservar" deve sempre incluir: número de pavimentos, posição das aberturas, volumetria, ' +
  'ângulo da câmera, MATERIAIS visíveis (piso, parede, teto, fachada), TEXTURAS visíveis (tapete, tecido, ' +
  'madeira), móveis e elementos decorativos visíveis.\n' +
  '- "elementos_melhorar" deve ser CONSERVADOR. Em quase todos os casos, use array vazio []. Só liste algo ' +
  'se a imagem for claramente um esquema 3D sem realismo — e mesmo aí, NUNCA mencione "trocar materiais", ' +
  '"melhorar texturas" ou "atualizar materiais". Use só coisas como "adicionar sombras suaves", "ajustar ' +
  'reflexos do vidro existente". A regra de ouro: se em dúvida, deixe vazio.\n' +
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
      'todos os materiais e texturas visíveis',
      'todos os móveis e elementos decorativos',
    ],
    // Vazio por padrão — fallback conservador. Sem licença implícita pra modelo
    // reinterpretar materiais.
    elementos_melhorar: [],
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
    const output = await geminiVisionJson({
      system:    SYSTEM_PROMPT,
      user:      USER_PROMPT,
      imageUrl,
      timeoutMs: VISION_TIMEOUT_MS,
    })
    return parseBriefing(output)
  } catch (err) {
    console.error('[fidelity-engine] análise falhou:', (err as Error).message)
    return fallbackBriefing()
  }
}
