// vertex/imagen-edit — Google Vertex AI Imagen mask-edit (INTEGRAÇÃO FUTURA).
//
// Prioridade #7. Endpoint mais barato para quick fixes com máscara
// (~US$0.020/image). Ainda NÃO integrado: o editRouter só o seleciona quando
// VERTEX_IMAGEN_ENABLED = true (lib/spaces/edit-router.ts). Enquanto false, os
// quick fixes vão para fal-ai/flux-kontext-lora/inpaint.
//
// Para ligar:
//   1. Provisionar credenciais Vertex (GOOGLE_VERTEX_PROJECT, location,
//      service account) nas envs (e na Vercel — ver [[project_vercel_env_parity]]).
//   2. Implementar a chamada real abaixo (predict :editImage com editMode
//      EDIT_MODE_INPAINT_INSERTION/REMOVAL + maskMode MASK_MODE_USER_PROVIDED).
//   3. Subir a imagem resultante pro Supabase Storage e devolver a URL pública.
//   4. Setar VERTEX_IMAGEN_ENABLED = true.

import {
  type RetouchEngine,
  type RetouchOutput,
} from './types'

export const VERTEX_IMAGEN_EDIT_ENDPOINT = 'vertex/imagen-edit'

// Stub explícito: nunca deve ser chamado enquanto VERTEX_IMAGEN_ENABLED=false.
// Lançar deixa o erro óbvio caso a flag seja ligada sem a implementação real.
// (Sem parâmetro: o tipo RetouchEngine aceita funções com menos argumentos.)
export const callVertexImagenEdit: RetouchEngine = async (): Promise<RetouchOutput> => {
  throw new Error(
    '[vertex-imagen-edit] não integrado. Implemente a chamada Vertex AI antes de ligar VERTEX_IMAGEN_ENABLED.',
  )
}
