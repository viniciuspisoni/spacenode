// lib/blocos3d/provider.ts
//
// Facade dos providers do Blocos 3D (SERVER-ONLY). A rota conversa só com
// createProviderTask/getProviderTask — o catálogo (config.ts) decide qual
// provider atende cada tier de qualidade.

import type { Blocos3DEngine } from './config'
import type { Blocos3DOptions, Blocos3DProvider, ProviderTaskState } from './types'
import { createFalTask, getFalTask } from './fal'
import { createMeshyTask, getMeshyTask, meshyConfigured } from './meshy'

/** Task sumiu do provider (404) — o poll transiciona pra failed + refund. */
export class TaskGoneError extends Error {
  constructor() {
    super('Task não encontrada no provider')
    this.name = 'TaskGoneError'
  }
}

/** O motor tem credencial configurada? (pra UI desabilitar o tier — a rota
 *  também recusa, com mensagem amigável). */
export function engineAvailable(engine: Blocos3DEngine): boolean {
  if (engine.provider === 'meshy') return meshyConfigured()
  return !!process.env.FAL_KEY
}

export async function createProviderTask(
  engine: Blocos3DEngine,
  imageUrl: string,
  options: Blocos3DOptions,
): Promise<string> {
  return engine.provider === 'meshy'
    ? createMeshyTask(imageUrl, options)
    : createFalTask(engine, imageUrl)
}

/** Consulta pela identidade persistida no job (provider + engine do banco) —
 *  imune a mudanças futuras no catálogo quality→engine. */
export async function getProviderTask(
  provider: Blocos3DProvider,
  engineId: string,
  providerTaskId: string,
): Promise<ProviderTaskState> {
  try {
    return provider === 'meshy'
      ? await getMeshyTask(providerTaskId)
      : await getFalTask(engineId, providerTaskId)
  } catch (err) {
    if ((err as { status?: number })?.status === 404) throw new TaskGoneError()
    throw err
  }
}
