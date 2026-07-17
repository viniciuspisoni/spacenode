// lib/blocos3d/provider.ts
//
// Facade dos providers do Blocos 3D (SERVER-ONLY). A rota conversa só com
// createProviderTask/getProviderTask — o catálogo (config.ts) decide qual
// provider atende cada tier de qualidade.
//
// Dispatch por Record<Blocos3DProvider, …> (padrão do lib/video/adapters):
// adicionar um provider novo à union sem registrar o adapter é erro de
// compilação, não fallback silencioso.

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

interface Blocos3DAdapter {
  isAvailable(): boolean
  create(engine: Blocos3DEngine, imageUrl: string, options: Blocos3DOptions): Promise<string>
  get(engineId: string, providerTaskId: string): Promise<ProviderTaskState>
}

const ADAPTERS: Record<Blocos3DProvider, Blocos3DAdapter> = {
  fal: {
    isAvailable: () => !!process.env.FAL_KEY,
    create: (engine, imageUrl) => createFalTask(engine, imageUrl),
    get:    (engineId, taskId) => getFalTask(engineId, taskId),
  },
  meshy: {
    isAvailable: meshyConfigured,
    create: (_engine, imageUrl, options) => createMeshyTask(imageUrl, options),
    get:    (_engineId, taskId) => getMeshyTask(taskId),
  },
}

/** O motor tem credencial configurada? (pra UI desabilitar o tier — a rota
 *  também recusa, com mensagem amigável). */
export function engineAvailable(engine: Blocos3DEngine): boolean {
  return ADAPTERS[engine.provider].isAvailable()
}

export async function createProviderTask(
  engine: Blocos3DEngine,
  imageUrl: string,
  options: Blocos3DOptions,
): Promise<string> {
  return ADAPTERS[engine.provider].create(engine, imageUrl, options)
}

/** Consulta pela identidade persistida no job (provider + engine do banco) —
 *  imune a mudanças futuras no catálogo quality→engine. */
export async function getProviderTask(
  provider: Blocos3DProvider,
  engineId: string,
  providerTaskId: string,
): Promise<ProviderTaskState> {
  try {
    return await ADAPTERS[provider].get(engineId, providerTaskId)
  } catch (err) {
    if ((err as { status?: number })?.status === 404) throw new TaskGoneError()
    throw err
  }
}
