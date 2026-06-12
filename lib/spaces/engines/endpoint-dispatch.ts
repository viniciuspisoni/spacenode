// Ponte entre a DECISÃO do editRouter (EditEndpoint) e o ENGINE concreto.
//
// O routeEdit() escolhe um EditEndpoint; aqui mapeamos para a função que de fato
// chama o provider, mais um flag `usesMask` que diz se o endpoint consome a
// máscara (inpaint / duas-imagens) ou edita por instrução na imagem inteira
// (Flux Pro Kontext). O route usa `usesMask` para compor o prompt e decidir o
// crop corretos.

import type { EditEndpoint } from '../edit-router'
import type { RetouchEngine } from './types'

import { callFluxKontextLoraInpaint } from './flux-kontext-lora-inpaint'
import { callFluxFillForRemoval }     from './flux-fill-removal'
import { callNanoBananaEdit }         from './nano-banana-edit'
import { callFluxProKontext }         from './flux-pro-kontext'
import { callGemini3ProEdit }         from './gemini-3-pro-edit'
import { callVertexImagenEdit }       from './vertex-imagen-edit'
import { callNanoBanana2Masked, callNanoBanana2Instruct }     from './nano-banana-2-edit'
import { callNanoBananaProMasked, callNanoBananaProInstruct } from './nano-banana-pro-edit'

export interface EndpointEngine {
  call:     RetouchEngine
  /** true = consome a máscara (inpaint / 2-imagens); false = edita por instrução. */
  usesMask: boolean
}

const DISPATCH: Record<EditEndpoint, EndpointEngine> = {
  'vertex/imagen-edit':                     { call: callVertexImagenEdit,       usesMask: true },
  'fal-ai/flux-kontext-lora/inpaint':       { call: callFluxKontextLoraInpaint, usesMask: true },
  // Remoção: Flux Pro Fill com prompt de remoção dedicado (limpa + reconstrói).
  'fal-ai/flux-pro/v1/fill':                { call: callFluxFillForRemoval,     usesMask: true },
  'fal-ai/nano-banana/edit':                { call: callNanoBananaEdit,         usesMask: true },
  'fal-ai/flux-pro/kontext':                { call: callFluxProKontext,         usesMask: false },
  'fal-ai/gemini-3-pro-image-preview/edit': { call: callGemini3ProEdit,         usesMask: true },
  // ── Google-first ──
  // Mascarados: máscara como 2ª imagem; o pipeline recompõe e o gate valida.
  'fal-ai/nano-banana-2/edit':              { call: callNanoBanana2Masked,      usesMask: true },
  'fal-ai/nano-banana-pro/edit':            { call: callNanoBananaProMasked,    usesMask: true },
  // Instrução (edição conversacional, SEM máscara) — Flux Pro Kontext preserva
  // a composição original; nano-banana sem máscara regenera a cena do zero.
  'google/gemini-3.1-flash-image':          { call: callFluxProKontext,         usesMask: false },
  'google/gemini-3-pro-image':              { call: callFluxProKontext,         usesMask: false },
}

export function dispatchEndpoint(endpoint: EditEndpoint): EndpointEngine {
  return DISPATCH[endpoint]
}
