// Extração e verificação de DNA via OpenAI Vision (GPT-4o) através do FAL.
//
// Por que GPT-4o:
//   - Definição do projeto: provider escolhido pra DNA do Spaces.
//   - FAL é o gateway centralizado de modelos do produto — uma única chave,
//     um único cliente, e não vincula a Anthropic via API direta.
//
// Além do DNA visual (estilo/materiais/paleta/contexto) o módulo também
// extrai o "briefing arquitetônico" reusando `analyzeImage` do Renderizar.
// Os dois rodam em paralelo dentro de `extractDnaPayload`.

import { fal } from '@fal-ai/client'
import { analyzeImage } from '@/lib/fidelity-engine'
import type { BriefingArquitetonico } from '@/lib/prompts'
import type { ProjectDNA, DnaVerification, SpaceDnaPayload } from './types'

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

// ── Extração paralela: DNA visual + briefing arquitetônico ─────
//
// Custo: 2 calls de Vision (uma GPT-4o pro DNA visual, outra Claude Sonnet via
// FAL pelo `analyzeImage` do Renderizar). Ambas baratas — embutidas nos 8
// nodes da extração.
//
// Quando `sourceMetadata` é fornecido (Space criado a partir de uma render),
// o DNA visual é extraído com prompt enriquecido (ground truth de estilo,
// materiais e ambiente vindo do Renderizar) e o briefing técnico que já foi
// calculado é reusado — economizando 1 call de Vision.

export interface SourceMetadataHint {
  engine?:           string | null
  qualidade?:        string | null
  config_snapshot?:  {
    projectType?:    string | null
    segment?:        string | null
    environment?:    string | null
    lighting?:       string | null
    background?:     string | null
    materials?:      Record<string, string | undefined> | null
    briefing?:       BriefingArquitetonico | null
    [k: string]:     unknown
  } | null
  [k: string]:       unknown
}

export async function extractDnaPayload(
  imageUrl: string,
  sourceMetadata?: SourceMetadataHint | null,
): Promise<SpaceDnaPayload> {
  const cachedBriefing = sourceMetadata?.config_snapshot?.briefing ?? null

  const [visual, briefing] = await Promise.all([
    extractDnaWithSource(imageUrl, sourceMetadata),
    cachedBriefing
      ? Promise.resolve(cachedBriefing)
      : analyzeImage(imageUrl),
  ])
  return { visual, briefing }
}

// Versão enriquecida do extractDna — quando há source metadata, usa o
// ground truth como prefixo do prompt de visão. Cai no extractDna padrão
// quando não há metadata.
async function extractDnaWithSource(
  imageUrl: string,
  sourceMetadata: SourceMetadataHint | null | undefined,
): Promise<ProjectDNA> {
  if (!sourceMetadata?.config_snapshot) {
    return extractDna(imageUrl)
  }

  const cs = sourceMetadata.config_snapshot
  const engine = sourceMetadata.engine ?? 'vega'

  const knownFacts: string[] = []
  if (cs.projectType) knownFacts.push(`Tipo: ${cs.projectType}`)
  if (cs.segment)     knownFacts.push(`Segmento: ${cs.segment}`)
  if (cs.environment) knownFacts.push(`Ambiente: ${cs.environment}`)
  if (cs.lighting)    knownFacts.push(`Iluminação inicial: ${cs.lighting}`)
  if (cs.background)  knownFacts.push(`Background: ${cs.background}`)

  const matLines: string[] = []
  if (cs.materials) {
    for (const [field, value] of Object.entries(cs.materials)) {
      if (value && value.trim()) matLines.push(`${field}: ${value}`)
    }
  }

  const enrichedSystem = (
    'Você é um arquiteto sênior. Esta imagem foi gerada pelo SpaceNode com ' +
    `motor "${engine}" e configurações conhecidas (ground truth abaixo). ` +
    'Use essas configurações como referência confirmada e expanda com o que ' +
    'a imagem revela. Responda APENAS com JSON.'
  )

  const factsBlock = knownFacts.length ? `\n${knownFacts.join('\n')}` : ''
  const matsBlock  = matLines.length   ? `\n\nMateriais especificados:\n${matLines.join('\n')}` : ''

  const enrichedUser = (
    `[GROUND TRUTH — CONFIGURAÇÕES USADAS PARA GERAR ESTA IMAGEM]${factsBlock}${matsBlock}\n\n` +
    'Devolva JSON com EXATAMENTE estas chaves:\n' +
    '{\n' +
    '  "estilo": { "nome": string, "confianca": number },\n' +
    '  "materiais": [ { "nome": string, "hex": string } ],\n' +
    '  "paleta":   string[],\n' +
    '  "contexto": string[]\n' +
    '}\n\n' +
    'Regras:\n' +
    '- Use o ground truth acima como referência confirmada de estilo e materiais.\n' +
    '- Confirme cada material citado no ground truth e adicione hex code real ' +
    'dominante na imagem.\n' +
    '- Adicione materiais visíveis na imagem que não estão no ground truth.\n' +
    '- Paleta: 5-6 cores hex dominantes (use tons reais detectados).\n' +
    '- Contexto: 2-4 tags curtas descrevendo o ambiente.'
  )

  const result = await Promise.race([
    fal.subscribe(FAL_VISION_ENDPOINT, {
      input: {
        model:         DNA_MODEL,
        system_prompt: enrichedSystem,
        prompt:        enrichedUser,
        image_urls:    [imageUrl],
        temperature:   0.1,
        max_tokens:    900,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNA_EXTRACT_TIMEOUT')), DNA_TIMEOUT_MS),
    ),
  ])

  const output = (result.data as { output?: string })?.output
  if (!output) {
    // Fallback gracioso — se falhar a versão enriquecida, cai no padrão.
    return extractDna(imageUrl)
  }

  try {
    return parseDna(output)
  } catch {
    return extractDna(imageUrl)
  }
}

// ── Helpers de leitura ────────────────────────────────────────
//
// Spaces criados antes do follow-up "fidelity fusion" guardam apenas
// ProjectDNA. Pra evitar quebrar UI ou rotas, sempre ler via estes helpers.

export function getVisualDna(dna: unknown): ProjectDNA | null {
  if (!dna || typeof dna !== 'object') return null
  const obj = dna as Record<string, unknown>
  if ('visual' in obj && obj.visual && typeof obj.visual === 'object') {
    return obj.visual as ProjectDNA
  }
  if ('estilo' in obj && 'paleta' in obj) {
    return dna as ProjectDNA
  }
  return null
}

export function getBriefingFromDna(dna: unknown): BriefingArquitetonico | null {
  if (!dna || typeof dna !== 'object') return null
  const obj = dna as Record<string, unknown>
  if ('briefing' in obj && obj.briefing && typeof obj.briefing === 'object') {
    return obj.briefing as BriefingArquitetonico
  }
  return null
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

export type VerifyMode = 'standard' | 'angulo_relaxed' | 'edit_relaxed'

export async function verifyDna(
  variationUrl: string,
  dna:          ProjectDNA,
  mode:         VerifyMode = 'standard',
  maskCoverage: number = 0,
): Promise<DnaVerification> {
  // Pro eixo Ângulo, o ground truth de Contexto da Vista Mestre não bate
  // com a vista gerada (composição/enquadramento mudam por design — é
  // outro ângulo do mesmo projeto). Avaliamos Contexto só por categoria
  // ampla (interno/externo, tipologia). Estilo, Materiais e Paleta seguem
  // com avaliação estrita.
  //
  // Pra vistas editadas (Retocar), a área não-mascarada é idêntica à
  // original — só uma região foi modificada. Threshold por atributo é
  // ajustado pela cobertura da máscara (área menor → mais tolerante).
  const contextoRule = mode === 'angulo_relaxed'
    ? (
      'IMPORTANTE — esta vista veio do eixo Ângulo (mesmo projeto, ponto de vista diferente). ' +
      'Para "contexto", compare APENAS categorias amplas (Externo/Interno, ' +
      'Residencial/Comercial/Conceito, tipologia geral como casa/apto/escritório). ' +
      'IGNORE composição específica, enquadramento, ângulo da câmera e elementos ' +
      'de cena (pessoas, veículos, vegetação detalhada). Score alto se a ' +
      'categoria ampla é a mesma.\n\n'
    )
    : mode === 'edit_relaxed'
      ? (
        `IMPORTANTE — esta vista é uma edição localizada (${(maskCoverage * 100).toFixed(0)}% ` +
        'da imagem foi mascarada e editada). Compare contexto considerando que apenas ' +
        'uma região foi alterada — espere coerência geral, mas pequenas divergências ' +
        'localizadas na área editada são esperadas e aceitáveis.\n\n'
      )
      : ''

  const userPrompt =
    contextoRule +
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
