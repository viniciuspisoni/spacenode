// fal-ai/flux-kontext-lora/inpaint — Flux Kontext LoRA inpainting.
//
// Endpoint barato e sensível a área (custo ~US$0.035/MP), usado pelo editRouter
// para correções rápidas (grátis / 1 node) e edições localizadas (2 nodes) com
// máscara. O custo por MP é o motivo de SEMPRE recortar a máscara antes
// (shouldUseCrop): mandar só a região editada derruba o custo direto.
//
// Mask-based: recebe image_url + mask_url reais (WHITE = editar, BLACK = preservar).
// O prompt já chega do route com as regras de preservação fora da máscara.
//
// Schema confirmado contra a OpenAPI da Fal.ai (2026-06): exige
// `reference_image_url` (obrigatório!) além de image_url/mask_url/prompt.
// Sem referência explícita ('replace'), usamos a própria imagem como referência
// de estilo/conteúdo — coerente com o objetivo de preservar o contexto.
// Opcionais relevantes: num_inference_steps (10–50, default 30), guidance_scale
// (0–20, default 2.5), strength (default 0.88), output_format (jpeg|png).

import { fal } from '@fal-ai/client'
import {
  type RetouchEngine,
  type RetouchInput,
  type RetouchOutput,
  RetouchNoOutputError,
  RetouchTimeoutError,
} from './types'

export const FLUX_KONTEXT_LORA_INPAINT_ENDPOINT = 'fal-ai/flux-kontext-lora/inpaint'
const TIMEOUT_MS = 90_000

interface FalInpaintOutput {
  images?: { url?: string }[]
  image?:  { url?: string }
}

export const callFluxKontextLoraInpaint: RetouchEngine = async (
  input: RetouchInput,
): Promise<RetouchOutput> => {
  // Referência de ANCORAGEM selecionada por PAPEL (textura/objeto) — não mais
  // references[0] cego: anexar só "imagem original"/"estilo" fazia o modelo
  // REPRODUZIR a superfície antiga (achado P1-4 da auditoria).
  const anchorRef = (input.references ?? []).find(
    r => r.role === 'material_texture' || r.role === 'object_reference',
  )
  const falInput: Record<string, unknown> = {
    image_url:           input.imageUrl,
    mask_url:            input.maskUrl,
    // Obrigatório no schema. Usa a referência de ancoragem ou a do 'replace';
    // senão a própria imagem (auto-referência preserva estilo/contexto).
    reference_image_url: anchorRef?.url ?? input.referenceUrl ?? input.imageUrl,
    prompt:              input.prompt,
    num_images:          1,
    num_inference_steps: 30,
    guidance_scale:      2.5,
    // strength < default (0.88): regenera MENOS a região → preserva mais a
    // ILUMINAÇÃO/sombra original da superfície (queixa "lava perto da janela").
    // Validado num experimento de luz (A baseline vs B strength+prompt vs C
    // luminance-transfer): B ganhou — material aplica e a luz da cena integra.
    strength:            0.75,
    // PNG (lossless): o crop é recomposto na original lossless; JPEG aqui
    // re-encodava o crop com perda ANTES do recompose, degradando a textura.
    output_format:       'png',
  }
  if (input.seed !== undefined) falInput.seed = input.seed

  let result: Awaited<ReturnType<typeof fal.subscribe>>
  try {
    result = await Promise.race([
      fal.subscribe(FLUX_KONTEXT_LORA_INPAINT_ENDPOINT, { input: falInput as unknown as never }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new RetouchTimeoutError(FLUX_KONTEXT_LORA_INPAINT_ENDPOINT)), TIMEOUT_MS),
      ),
    ])
  } catch (e) {
    // Loga o DETALHE de validação da FAL (422 "Unprocessable Entity" não diz o
    // campo/imagem culpado por padrão). Rethrow preserva o fluxo de erro/refund.
    const err = e as { status?: number; body?: unknown }
    if (err?.status || err?.body) {
      let detail: string
      try { detail = JSON.stringify(err.body) } catch { detail = String(err.body) }
      console.error(`[flux-kontext-lora/inpaint] FAL ${err.status ?? '?'} detail: ${detail?.slice(0, 1200)}`)
    }
    throw e
  }

  const data = result.data as FalInpaintOutput
  const url  = data.images?.[0]?.url ?? data.image?.url
  if (!url) throw new RetouchNoOutputError(FLUX_KONTEXT_LORA_INPAINT_ENDPOINT)

  return { imageUrl: url, endpoint: FLUX_KONTEXT_LORA_INPAINT_ENDPOINT, requestId: (result as { requestId?: string }).requestId ?? null }
}
