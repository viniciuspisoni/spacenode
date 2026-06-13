// lib/edit-v2/interpret-selection.ts
//
// Interpretação de intenção da seleção (Trocar material v2). Recebe a imagem,
// um overlay verde da região APROXIMADA que o usuário circulou e a instrução
// em PT; devolve o ALVO arquitetônico estruturado — qual elemento/superfície,
// onde, e o que excluir. É isso que guia a segmentação (evf-sam/SAM2), em vez
// de o rabisco decidir sozinho.
//
// Best-effort: se a flag estiver off ou o Gemini falhar, cai num fallback
// determinístico (frase derivada por palavras-chave da instrução) — nunca
// bloqueia. Custo/latência logados separados (~US$0,0015, gemini-2.5-flash).

import { geminiMultiVisionJson } from '@/lib/gemini'

export interface SelectionIntent {
  /** Frase EN curta para o evf-sam segmentar (ex.: "wooden wall panels"). */
  targetPhraseEn: string
  /** Tipo arquitetônico (PT, para a legenda da UI): parede, piso, painel… */
  elementType: string
  /** Descrição da superfície/material atual. */
  surface: string
  /** Localização legível (PT): "parede direita", "piso central". */
  location: string
  /** Objetos a excluir da seleção (EN, para subtrair): rug, bed, lamp… */
  exclusions: string[]
  used: boolean
  durationMs: number
  costUsdEstimated: number
}

const COST_USD = 0.0015

const SYSTEM = `You are the selection interpreter of an architectural image editor for
architects and interior designers. You receive: (1) an interior/architectural photo,
(2) the SAME photo with a GREEN highlight over the region the user roughly circled,
and (3) the user's edit instruction in Portuguese.

Identify the SINGLE architectural surface or element the user most likely wants to
change material on — the dominant surface under/near the green region, guided by the
instruction. Prefer one coherent element (a wall, the floor, a set of wood panels, a
countertop, the ceiling, a specific cabinetry run).

Return a concise English segmentation phrase for that element, plus the objects sitting
ON or IN FRONT of it that must be EXCLUDED (rug, bed, sofa, chairs, lamp, plants, etc.).
Output JSON only.`

interface IntentLlmOutput {
  target_phrase_en?: unknown
  element_type?: unknown
  surface?: unknown
  location?: unknown
  exclusions?: unknown
}

/** Fallback por palavras-chave (PT) — só quando o LLM não roda. */
function deriveFallbackPhrase(instructionPt: string): { en: string; pt: string } {
  const s = instructionPt.toLowerCase()
  if (/\bpiso|ch(ã|a)o|porcelanato|laje\b/.test(s)) return { en: 'floor', pt: 'piso' }
  if (/\bteto|forro\b/.test(s)) return { en: 'ceiling', pt: 'teto' }
  if (/\bparede|muro|alvenaria\b/.test(s)) return { en: 'wall', pt: 'parede' }
  if (/\bpainel|painéis|mdf|marcenaria|ripado|lambri\b/.test(s)) return { en: 'wood wall panels', pt: 'painéis' }
  if (/\bbancada|countertop|pia\b/.test(s)) return { en: 'countertop', pt: 'bancada' }
  if (/\bporta|esquadria|janela\b/.test(s)) return { en: 'door or window frame', pt: 'esquadria' }
  return { en: 'the highlighted surface', pt: 'superfície' }
}

export interface InterpretSelectionOpts {
  imageUrl: string
  /** Overlay verde da região (entrada visual para o Gemini). */
  regionOverlayUrl: string
  instructionPt: string
  enabled: boolean
  timeoutMs?: number
}

export async function interpretSelection(opts: InterpretSelectionOpts): Promise<SelectionIntent> {
  const fb = deriveFallbackPhrase(opts.instructionPt)
  const fallback: SelectionIntent = {
    targetPhraseEn: fb.en,
    elementType: fb.pt,
    surface: '',
    location: '',
    exclusions: [],
    used: false,
    durationMs: 0,
    costUsdEstimated: 0,
  }
  if (!opts.enabled) return fallback

  const startedAt = Date.now()
  try {
    const user = JSON.stringify({
      user_instruction_pt: opts.instructionPt.trim() || '(sem texto — use só a região destacada)',
      images: ['1: original photo', '2: same photo with GREEN highlight on the user region'],
      expected_json: {
        target_phrase_en: 'string — concise phrase naming the element to segment',
        element_type: 'string — short PT label (parede, piso, painel, bancada, teto, esquadria)',
        surface: 'string — current material/finish, short PT',
        location: 'string — short PT (ex.: parede direita)',
        exclusions: "string[] — EN object words on top of/in front of it to exclude",
      },
    })
    const raw = await geminiMultiVisionJson({
      system: SYSTEM,
      user,
      imageUrls: [opts.imageUrl, opts.regionOverlayUrl],
      temperature: 0.1,
      maxTokens: 400,
      timeoutMs: opts.timeoutMs ?? 20_000,
    })
    const parsed = JSON.parse(raw) as IntentLlmOutput

    const targetPhraseEn =
      typeof parsed.target_phrase_en === 'string' && parsed.target_phrase_en.trim()
        ? parsed.target_phrase_en.trim()
        : fb.en
    const exclusions = Array.isArray(parsed.exclusions)
      ? parsed.exclusions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12)
      : []

    return {
      targetPhraseEn,
      elementType: typeof parsed.element_type === 'string' && parsed.element_type.trim() ? parsed.element_type.trim() : fb.pt,
      surface: typeof parsed.surface === 'string' ? parsed.surface.trim() : '',
      location: typeof parsed.location === 'string' ? parsed.location.trim() : '',
      exclusions,
      used: true,
      durationMs: Date.now() - startedAt,
      costUsdEstimated: COST_USD,
    }
  } catch (err) {
    console.warn(
      `[edit-v2/interpret-selection] indisponível (${String((err as Error)?.message ?? err).slice(0, 120)}) — fallback`,
    )
    return { ...fallback, durationMs: Date.now() - startedAt }
  }
}
