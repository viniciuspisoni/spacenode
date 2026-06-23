// lib/spaces/preserve-validate.ts
//
// Validação automática simples da geração do Spaces (Preserve V2). Dois níveis:
//
//   1) validateGeneration — checagens BARATAS e síncronas (sem IO extra):
//      imagem não-vazia, generated ≠ source, aspect ratio próximo do original.
//      Rodam sempre que a flag está on; só registram problemas (não bloqueiam
//      nesta primeira versão).
//
//   2) checkArchitecturalPreservation — checagem opcional via visão (Gemini
//      multi-imagem), comparando source × generated: "é o mesmo projeto
//      arquitetônico?". Best-effort, fire-and-forget; marca preservation_warning
//      quando detecta alteração indevida forte. Nunca lança.

import { geminiMultiVisionJson } from '@/lib/gemini'
import type { SpacesPreservationLevel } from './preservation'

// ── 1. Checagens estruturais síncronas ────────────────────────

export interface GenerationValidationInput {
  sourceUrl:        string
  generatedUrl:     string | null | undefined
  sourceAspect:     number | null
  generatedAspect:  number | null
}

export interface GenerationValidation {
  ok:               boolean
  issues:           string[]
  aspectPreserved:  boolean | null   // null = não deu pra comparar
}

// Tolerância relativa do aspect ratio. Os endpoints /edit às vezes arredondam a
// dimensão pra um múltiplo; 5% absorve isso sem deixar passar um recorte real.
const ASPECT_TOLERANCE = 0.05

export function validateGeneration(input: GenerationValidationInput): GenerationValidation {
  const issues: string[] = []

  if (!input.generatedUrl || input.generatedUrl.trim() === '') {
    issues.push('generated_image_vazia')
  }
  if (input.generatedUrl && input.generatedUrl === input.sourceUrl) {
    issues.push('generated_igual_source')
  }

  let aspectPreserved: boolean | null = null
  if (input.sourceAspect && input.generatedAspect) {
    const rel = Math.abs(input.sourceAspect - input.generatedAspect) / input.sourceAspect
    aspectPreserved = rel <= ASPECT_TOLERANCE
    if (!aspectPreserved) issues.push('aspect_ratio_divergente')
  }

  return { ok: issues.length === 0, issues, aspectPreserved }
}

// ── 2. Checagem de preservação arquitetônica via visão ────────

export interface PreservationCheck {
  preserved:  boolean
  warning:    boolean            // true → registrar spaces_preservation_warning
  score:      number             // 0..1, confiança de que é o mesmo projeto
  notes?:     string
  attributes?: {
    volumetria?:  number
    aberturas?:   number
    telhado?:     number
    implantacao?: number
    proporcoes?:  number
    camera?:      number
    materiais?:   number
  }
}

const CHECK_SYSTEM =
  'Você é um auditor de visualização arquitetônica. Recebe DUAS imagens: a #1 é ' +
  'a referência original do projeto (autoridade) e a #2 é uma variação gerada. ' +
  'Avalie objetivamente se a #2 preserva o MESMO projeto arquitetônico da #1. ' +
  'Responda SEMPRE e APENAS com JSON válido.'

// O que pode legitimamente mudar depende do nível: em STRICT a câmera deve ser
// preservada; em ARCH a câmera pode mudar (nova vista do mesmo prédio), então
// não penalizamos divergência de câmera/enquadramento.
function checkUserPrompt(level: SpacesPreservationLevel): string {
  const cameraRule = level === 'STRICT_SOURCE_LOCK'
    ? 'A câmera/enquadramento DEVE ser preservada — penalize se mudou.'
    : 'A câmera PODE mudar (é uma nova vista do mesmo projeto) — NÃO penalize ' +
      'mudança de câmera/enquadramento; foque em ser o mesmo edifício.'

  return (
    'Compare a imagem #2 (gerada) com a #1 (original). ' + cameraRule + '\n\n' +
    'Pergunta central: a imagem #2 preserva o mesmo projeto arquitetônico da #1?\n' +
    'Avalie especialmente: volumetria, aberturas (quantidade/posição/proporção), ' +
    'telhado, implantação, proporções, câmera (quando deveria ser preservada) e ' +
    'materiais (quando deveriam ser preservados).\n\n' +
    'Devolva JSON:\n' +
    '{\n' +
    '  "preserved": boolean,        // true = claramente o mesmo projeto\n' +
    '  "score": number,             // 0-1, confiança de que é o mesmo projeto\n' +
    '  "attributes": {\n' +
    '    "volumetria": number, "aberturas": number, "telhado": number,\n' +
    '    "implantacao": number, "proporcoes": number, "camera": number,\n' +
    '    "materiais": number        // cada 0-1 (1 = preservado)\n' +
    '  },\n' +
    '  "notes": string              // 1 frase se algo desviou; vazio se ok\n' +
    '}'
  )
}

export async function checkArchitecturalPreservation(
  sourceUrl:    string,
  generatedUrl: string,
  level:        SpacesPreservationLevel,
): Promise<PreservationCheck | null> {
  try {
    const raw = await geminiMultiVisionJson({
      system:   CHECK_SYSTEM,
      user:     checkUserPrompt(level),
      imageUrls: [sourceUrl, generatedUrl],
      timeoutMs: 30_000,
    })
    return parseCheck(raw)
  } catch (err) {
    console.warn('[spaces.preserve] checagem de preservação falhou (best-effort):', (err as Error).message)
    return null
  }
}

function stripFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

// Threshold abaixo do qual marcamos warning interno. 0.7 = tolera variação
// legítima (luz/atmosfera muda a imagem) mas pega redesign claro.
const WARNING_THRESHOLD = 0.7

function parseCheck(raw: string): PreservationCheck {
  const parsed = JSON.parse(stripFence(raw)) as Partial<PreservationCheck>
  const clamp = (n: unknown): number =>
    typeof n === 'number' ? Math.max(0, Math.min(1, n)) : 0

  const score = clamp(parsed.score)
  const preserved = parsed.preserved === true
  const a = parsed.attributes ?? {}
  const attributes = {
    volumetria:  clamp(a.volumetria),
    aberturas:   clamp(a.aberturas),
    telhado:     clamp(a.telhado),
    implantacao: clamp(a.implantacao),
    proporcoes:  clamp(a.proporcoes),
    camera:      clamp(a.camera),
    materiais:   clamp(a.materiais),
  }
  // Warning se o modelo disse "não preservado" OU score baixo.
  const warning = !preserved || score < WARNING_THRESHOLD

  return {
    preserved,
    warning,
    score,
    attributes,
    notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : undefined,
  }
}
