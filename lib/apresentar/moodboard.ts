// ── Apresentar · Moodboard generator ─────────────────────────────────────────
//
// Analisa uma imagem de referência (opcional) + presets do usuário e devolve
// um MoodboardResult estruturado (paleta de cores, materiais sugeridos,
// conceito editorial e tags). Usa Claude 3.5 Sonnet via fal-ai/any-llm/vision
// quando há imagem, ou /any-llm (text-only) quando não há.
//
// O LLM NÃO inventa códigos hex aleatoriamente — recebe instruções rígidas
// pra extrair cores reais da imagem ou da paleta solicitada.

import { fal } from '@fal-ai/client'
import {
  MOODBOARD_MATERIAL_CATEGORIES,
  type MoodboardResult,
  type MoodboardAmbient,
  type MoodboardStyle,
  type MoodboardPalette,
  type MoodboardLevel,
  type MoodboardMaterial,
  type MoodboardSwatch,
} from './config'

const FAL_VISION_ENDPOINT = 'fal-ai/any-llm/vision'
const FAL_TEXT_ENDPOINT   = 'fal-ai/any-llm'
const FAL_MODEL           = 'anthropic/claude-3.5-sonnet'
const LLM_TIMEOUT_MS      = 18_000

// ── Input ────────────────────────────────────────────────────────────────────

export interface MoodboardContentInput {
  /** Imagem-referência opcional (URL na Fal storage). Quando presente, vira coverUrl. */
  referenceUrl?: string
  /** Nome do projeto, ex: "Cobertura Itaim" */
  projectName?:  string
  ambient:       MoodboardAmbient
  style:         MoodboardStyle
  palette:       MoodboardPalette
  level:         MoodboardLevel
  studioName?:   string
}

// ── Prompt design ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'Você é um arquiteto sênior e diretor de arte especializado em criar moodboards ' +
  'de apresentação para projetos de arquitetura e design de interiores. Seu trabalho é ' +
  'analisar referências visuais e direções de projeto, e devolver um JSON estruturado ' +
  'com paleta de cores reais, materiais coerentes, conceito editorial e tags. ' +
  'Responda SEMPRE e APENAS com um objeto JSON válido — sem texto antes ou depois, ' +
  'sem markdown, sem ```json fences.'

const STYLE_HINT: Record<MoodboardStyle, string> = {
  contemporaneo:      'design contemporâneo — equilíbrio entre técnica e conforto, materiais atuais',
  minimalista:        'minimalismo — paleta restrita, geometria limpa, pouca ornamentação',
  organico:           'orgânico — formas curvas, materiais naturais, paleta terrosa',
  industrial:         'industrial — concreto, metal, madeira escura, estética crua',
  escandinavo:        'escandinavo — branco, madeira clara, tecidos naturais, leveza',
  classico:           'clássico — proporções tradicionais, materiais nobres, paleta atemporal',
  japandi:            'japandi — fusão japonesa e escandinava, simplicidade refinada, madeira clara, neutros',
  mediterraneo:       'mediterrâneo — caiação, terracota, madeira clara, paleta solar',
  sofisticado_escuro: 'sofisticado escuro — paleta densa, metais quentes, contrastes elegantes',
}

const PALETTE_HINT: Record<MoodboardPalette, string> = {
  clara:    'paleta clara — tons claros e arejados predominantes',
  quente:   'paleta quente — terra, dourado, madeiras quentes, tecidos cálidos',
  neutra:   'paleta neutra — cinzas, beges, brancos, off-whites',
  escura:   'paleta escura — pretos, grafites, marrons profundos',
  natural:  'paleta natural — extraída de materiais naturais (madeira, pedra, vegetação)',
  colorida: 'paleta colorida — pelo menos 1 cor de destaque saturada',
}

const LEVEL_HINT: Record<MoodboardLevel, string> = {
  conceitual: 'direção conceitual livre — vocabulário inspirador, foco em sensações',
  comercial:  'apresentação comercial — vocabulário direto e profissional, foco no cliente',
  premium:    'editorial premium — vocabulário sofisticado, prosa elegante',
}

const AMBIENT_LABEL: Record<MoodboardAmbient, string> = {
  sala:        'sala de estar',
  cozinha:     'cozinha',
  quarto:      'quarto',
  banheiro:    'banheiro',
  escritorio:  'escritório',
  loja:        'espaço comercial / loja',
  fachada:     'fachada / exterior',
  gourmet:     'área gourmet',
}

function buildUserPrompt(input: MoodboardContentInput, hasImage: boolean): string {
  const studio = input.studioName ? ` (estúdio: "${input.studioName}")` : ''
  const proj   = input.projectName ? ` chamado "${input.projectName}"` : ''

  return [
    `Monte um moodboard para um projeto de ${AMBIENT_LABEL[input.ambient]}${proj}${studio}.`,
    '',
    `Direção: ${STYLE_HINT[input.style]}.`,
    `Cor: ${PALETTE_HINT[input.palette]}.`,
    `Profundidade: ${LEVEL_HINT[input.level]}.`,
    '',
    hasImage
      ? 'A imagem em anexo é a REFERÊNCIA visual principal. Extraia a paleta de cores REAIS da imagem (não invente). Sugira materiais que combinem com o que está visível na imagem E com a direção do projeto.'
      : 'Sem imagem de referência — proponha paleta e materiais consistentes com a direção do projeto.',
    '',
    `Devolva um JSON com EXATAMENTE estas chaves:`,
    `{`,
    `  "title":    string,      // título do moodboard, até 5 palavras (ex: "Calma escandinava em madeira clara")`,
    `  "concept":  string,      // conceito editorial em 2 a 3 frases (até 280 caracteres no total). Sem clichês.`,
    `  "palette":  [             // 5 a 6 swatches`,
    `    { "hex": "#RRGGBB", "name": string }  // nome curto da cor (até 3 palavras)`,
    `  ],`,
    `  "materials": [            // 5 a 8 materiais. Categorias permitidas: ${MOODBOARD_MATERIAL_CATEGORIES.join(', ')}.`,
    `    { "category": string, "name": string, "note": string }   // note opcional, até 60 chars`,
    `  ],`,
    `  "tags":     string[]      // 4 a 6 keywords curtas, sem # nem espaços`,
    `}`,
    '',
    `Regras IMPORTANTES:`,
    `- Hex codes devem ser 6 dígitos (#RRGGBB), sem alpha.`,
    `- Cores REPRESENTAM materiais reais — paredes, pisos, tecidos, plantas, metais. Sem fluorescente, sem cores impossíveis.`,
    `- Materiais devem ser ESPECÍFICOS (ex: "Mármore Calacatta", "Carvalho americano natural"), não genéricos ("Mármore branco").`,
    `- Tags em PORTUGUÊS, minúsculas, sem hashtag (ex: "atemporal", "luz natural", "madeira-clara").`,
    `- O conceito deve mencionar a sensação geral, sem citar o estúdio nem usar emojis.`,
  ].join('\n')
}

// ── Parsing defensivo ────────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  return raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function isValidHex(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.trim())
}

function parseResult(raw: string, input: MoodboardContentInput, fallback: MoodboardResult): MoodboardResult {
  let parsed: Partial<MoodboardResult>
  try {
    parsed = JSON.parse(cleanJson(raw)) as Partial<MoodboardResult>
  } catch {
    return fallback
  }

  // Palette: filtra hex válidos, garante 4-6 itens
  const paletteRaw = Array.isArray(parsed.palette) ? parsed.palette : []
  const palette: MoodboardSwatch[] = paletteRaw
    .filter((p): p is MoodboardSwatch =>
      !!p && typeof p === 'object' && isValidHex((p as MoodboardSwatch).hex)
    )
    .slice(0, 6)
    .map(p => ({
      hex:  p.hex.trim().toUpperCase(),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Tom',
    }))
  while (palette.length < 4) palette.push(fallback.palette[palette.length] ?? { hex: '#CCCCCC', name: 'Neutro' })

  // Materials: filtra categoria válida, máximo 8
  const materialsRaw = Array.isArray(parsed.materials) ? parsed.materials : []
  const materials: MoodboardMaterial[] = materialsRaw
    .filter((m): m is MoodboardMaterial =>
      !!m && typeof m === 'object' &&
      typeof (m as MoodboardMaterial).name === 'string' &&
      (MOODBOARD_MATERIAL_CATEGORIES as readonly string[]).includes((m as MoodboardMaterial).category as string)
    )
    .slice(0, 8)
    .map(m => ({
      category: m.category,
      name:     m.name.trim(),
      note:     typeof m.note === 'string' && m.note.trim() ? m.note.trim() : undefined,
    }))
  if (materials.length === 0) materials.push(...fallback.materials)

  const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : []
  const tags = tagsRaw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .slice(0, 6)
    .map(t => t.trim().toLowerCase().replace(/^#/, ''))

  return {
    coverUrl:  input.referenceUrl ?? null,
    title:     typeof parsed.title   === 'string' && parsed.title.trim()   ? parsed.title.trim()   : fallback.title,
    concept:   typeof parsed.concept === 'string' && parsed.concept.trim() ? parsed.concept.trim() : fallback.concept,
    palette,
    materials,
    tags:      tags.length ? tags : fallback.tags,
  }
}

function fallbackResult(input: MoodboardContentInput): MoodboardResult {
  return {
    coverUrl:  input.referenceUrl ?? null,
    title:     [input.projectName, AMBIENT_LABEL[input.ambient]].filter(Boolean).join(' · ') || 'Moodboard',
    concept:   'Conceito visual em desenvolvimento — direção definida pelos presets escolhidos.',
    palette:   [
      { hex: '#E8E2D8', name: 'Bege claro' },
      { hex: '#C9BFAF', name: 'Areia'      },
      { hex: '#7A6E5F', name: 'Terra'      },
      { hex: '#3A332B', name: 'Cacau'      },
      { hex: '#F4F1EB', name: 'Linho'      },
    ],
    materials: [
      { category: 'Madeira',      name: 'Carvalho americano natural' },
      { category: 'Pedra',        name: 'Mármore Calacatta Oro'      },
      { category: 'Tecido',       name: 'Linho cru'                  },
      { category: 'Iluminação',   name: 'Pendente em latão escovado' },
    ],
    tags:      [input.ambient, input.style, input.palette],
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function generateMoodboardContent(input: MoodboardContentInput): Promise<MoodboardResult> {
  const fb = fallbackResult(input)
  const hasImage = !!input.referenceUrl

  try {
    const result = await Promise.race([
      fal.subscribe(hasImage ? FAL_VISION_ENDPOINT : FAL_TEXT_ENDPOINT, {
        input: hasImage ? {
          model:         FAL_MODEL,
          system_prompt: SYSTEM_PROMPT,
          prompt:        buildUserPrompt(input, true),
          image_urls:    [input.referenceUrl!],
          temperature:   0.4,
          max_tokens:    1100,
        } : {
          model:         FAL_MODEL,
          system_prompt: SYSTEM_PROMPT,
          prompt:        buildUserPrompt(input, false),
          temperature:   0.5,
          max_tokens:    1100,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
      ),
    ])

    const output = (result.data as { output?: string })?.output
    if (!output) {
      console.warn('[apresentar/moodboard] LLM retornou output vazio — usando fallback')
      return fb
    }
    return parseResult(output, input, fb)
  } catch (err) {
    console.error('[apresentar/moodboard] geração falhou:', (err as Error).message)
    return fb
  }
}
