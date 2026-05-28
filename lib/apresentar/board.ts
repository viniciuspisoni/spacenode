// ── Apresentar · Carousel copy generator ─────────────────────────────────────
//
// Gera título, captions e fechamento para o carrossel Instagram via Claude 3.5
// Sonnet (acessado por fal-ai/any-llm — mesma rota usada em lib/fidelity-engine).
//
// O Claude NÃO vê as imagens nesta versão — recebe só metadados (vista_label,
// engine, style, ambient do registro `renders`) + contexto do projeto.
// Isso é mais rápido, barato e produz copy melhor calibrada ao briefing do
// estúdio. Vision multi-imagem pode entrar em v2 se valer a pena.

import { fal } from '@fal-ai/client'
import type { CarouselStyle, CarouselGeneratedCopy } from './config'

const FAL_LLM_ENDPOINT = 'fal-ai/any-llm'
const FAL_LLM_MODEL    = 'anthropic/claude-3.5-sonnet'
const LLM_TIMEOUT_MS   = 15_000

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface SlideImageMeta {
  imageUrl: string
  /** rótulo curto (ex: "Sala de estar", "Fachada", "Planta humanizada") */
  label?:   string
  /** estilo/ambient do registro, se houver */
  context?: string
}

export interface CarouselCopyInput {
  /** Nome do projeto, ex: "Apartamento Vila Madalena" */
  projectName:    string
  /** Tipo: "apartamento" | "casa" | "comercial" | etc. — texto livre */
  projectType?:   string
  /** Localização opcional, ex: "São Paulo, SP" */
  location?:      string
  /** Nome do estúdio (vindo de architect_identity), se houver */
  studioName?:    string
  /** Estilo do carrossel — afeta tom da copy */
  style:          CarouselStyle
  /** Imagens-slide na ordem desejada */
  slides:         SlideImageMeta[]
}

// ── Prompt design ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'Você é um copywriter especializado em apresentação de projetos de arquitetura ' +
  'e design de interiores para redes sociais. Escreve em português brasileiro, tom ' +
  'profissional e elegante, sem clichês, sem emojis, sem hashtags. Sua tarefa é ' +
  'escrever os textos de um carrossel Instagram que apresenta um projeto. ' +
  'Responda SEMPRE e APENAS com um objeto JSON válido — sem texto antes ou depois, ' +
  'sem markdown, sem ```json fences.'

const STYLE_TONE: Record<CarouselStyle, string> = {
  editorial:   'tom editorial sofisticado, vocabulário de revista de arquitetura, frases curtas e impactantes',
  minimalista: 'tom minimalista e direto, frases muito curtas, vocabulário essencial',
  premium:     'tom premium e aspiracional, vocabulário rico, sensação de exclusividade',
  studio_dark: 'tom contemporâneo e confiante, vocabulário cuidadoso, contraste forte',
}

function buildUserPrompt(input: CarouselCopyInput): string {
  const slideList = input.slides
    .map((s, i) => `  ${i + 1}. ${s.label || 'imagem do projeto'}${s.context ? ` (${s.context})` : ''}`)
    .join('\n')

  const studio = input.studioName ? ` para o estúdio "${input.studioName}"` : ''
  const loc    = input.location   ? `, localizado em ${input.location}`     : ''
  const type   = input.projectType ? ` do tipo ${input.projectType}`        : ''

  return [
    `Escreva os textos de um carrossel Instagram apresentando o projeto "${input.projectName}"${type}${loc}${studio}.`,
    '',
    `As imagens em ordem são:`,
    slideList,
    '',
    `Estilo da copy: ${STYLE_TONE[input.style]}.`,
    '',
    `Devolva um JSON com EXATAMENTE estas chaves:`,
    `{`,
    `  "coverTitle":    string,   // título da capa, NO MÁXIMO 4 palavras, sem ponto final`,
    `  "coverSubtitle": string,   // uma linha curta de contexto (até 60 caracteres)`,
    `  "captions":      string[], // um caption curto por imagem (até 60 caracteres cada), na ordem das imagens listadas. DEVE ter exatamente ${input.slides.length} itens`,
    `  "closingTitle":  string,   // chamada do último slide (até 4 palavras)`,
    `  "closingBody":   string    // texto do último slide, até 2 linhas curtas`,
    `}`,
    '',
    `Regras importantes:`,
    `- NÃO use emojis, hashtags, aspas tipográficas ou pontuação excessiva.`,
    `- NÃO use clichês como "elevamos o conceito", "transformamos espaços", "vida em movimento".`,
    `- NÃO mencione o nome do estúdio nos captions (já aparece no rodapé do template).`,
    `- Captions devem descrever a vista específica de forma profissional e curta.`,
    `- O título da capa deve ser memorável e leve, não literal.`,
  ].join('\n')
}

// ── Parser defensivo ─────────────────────────────────────────────────────────

function parseGeneratedCopy(raw: string, expectedSlideCount: number, fallback: CarouselGeneratedCopy): CarouselGeneratedCopy {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: Partial<CarouselGeneratedCopy>
  try {
    parsed = JSON.parse(cleaned) as Partial<CarouselGeneratedCopy>
  } catch {
    return fallback
  }

  const captionsArr = Array.isArray(parsed.captions)
    ? parsed.captions.filter((s): s is string => typeof s === 'string')
    : []

  // Ajuste defensivo do tamanho do array de captions
  const captions: string[] = []
  for (let i = 0; i < expectedSlideCount; i++) {
    captions.push(captionsArr[i] ?? fallback.captions[i] ?? '')
  }

  return {
    coverTitle:    typeof parsed.coverTitle    === 'string' && parsed.coverTitle.trim()    ? parsed.coverTitle.trim()    : fallback.coverTitle,
    coverSubtitle: typeof parsed.coverSubtitle === 'string' && parsed.coverSubtitle.trim() ? parsed.coverSubtitle.trim() : fallback.coverSubtitle,
    captions,
    closingTitle:  typeof parsed.closingTitle  === 'string' && parsed.closingTitle.trim()  ? parsed.closingTitle.trim()  : fallback.closingTitle,
    closingBody:   typeof parsed.closingBody   === 'string' && parsed.closingBody.trim()   ? parsed.closingBody.trim()   : fallback.closingBody,
  }
}

function fallbackCopy(input: CarouselCopyInput): CarouselGeneratedCopy {
  return {
    coverTitle:    input.projectName,
    coverSubtitle: [input.projectType, input.location].filter(Boolean).join(' · '),
    captions:      input.slides.map((s, i) => s.label || `Vista ${i + 1}`),
    closingTitle:  'Conheça mais',
    closingBody:   input.studioName ? `Projetos por ${input.studioName}.` : 'Acompanhe nossos projetos.',
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function generateCarouselCopy(input: CarouselCopyInput): Promise<CarouselGeneratedCopy> {
  const fb = fallbackCopy(input)

  try {
    const result = await Promise.race([
      fal.subscribe(FAL_LLM_ENDPOINT, {
        input: {
          model:         FAL_LLM_MODEL,
          system_prompt: SYSTEM_PROMPT,
          prompt:        buildUserPrompt(input),
          temperature:   0.5,
          max_tokens:    700,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), LLM_TIMEOUT_MS)
      ),
    ])

    const output = (result.data as { output?: string })?.output
    if (!output) {
      console.warn('[apresentar/board] LLM retornou output vazio — usando fallback')
      return fb
    }

    return parseGeneratedCopy(output, input.slides.length, fb)
  } catch (err) {
    console.error('[apresentar/board] copy generation falhou:', (err as Error).message)
    return fb
  }
}
