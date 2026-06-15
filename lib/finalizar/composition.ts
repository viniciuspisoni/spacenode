// lib/finalizar/composition.ts — fábrica e (de)serialização da composição.
//
// Sem dependências de DOM: roda no servidor (validação) e no cliente.

import type { Composition, Layer } from './types'

/** id curto e estável o suficiente para chaves de camada (sem libs externas). */
export function makeLayerId(seed: number): string {
  return `l${seed.toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

interface NewLayerInput {
  url: string
  name?: string
  isBase?: boolean
  seed: number
}

export function newLayer({ url, name, isBase = false, seed }: NewLayerInput): Layer {
  return {
    id: makeLayerId(seed),
    name: name ?? (isBase ? 'Base' : `Camada ${seed}`),
    url,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    feather: 0,
    isBase,
    // Camada nova começa visível: empilhe a geração boa e oculte o que ficou ruim.
    maskFill: isBase ? 'full' : 'full',
    maskUrl: null,
  }
}

/** Cria uma composição nova a partir da imagem base e suas dimensões naturais. */
export function createComposition(baseUrl: string, width: number, height: number): Composition {
  return {
    version: 1,
    width,
    height,
    layers: [newLayer({ url: baseUrl, name: 'Base', isBase: true, seed: 1 })],
  }
}

/** Normaliza/valida um document vindo do banco para o formato corrente.
 *  Tolerante: campos ausentes recebem defaults seguros. Retorna null se o
 *  document estiver irrecuperável (sem camadas). */
export function deserializeComposition(raw: unknown): Composition | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Partial<Composition>
  if (!Array.isArray(doc.layers) || doc.layers.length === 0) return null

  const layers: Layer[] = doc.layers
    .filter((l): l is Layer => Boolean(l && typeof (l as Layer).url === 'string'))
    .map((l, i) => ({
      id: typeof l.id === 'string' ? l.id : makeLayerId(i + 1),
      name: typeof l.name === 'string' ? l.name : `Camada ${i + 1}`,
      url: l.url,
      visible: l.visible !== false,
      opacity: clamp01(typeof l.opacity === 'number' ? l.opacity : 1),
      blendMode: l.blendMode ?? 'normal',
      feather: typeof l.feather === 'number' && l.feather >= 0 ? Math.min(l.feather, 200) : 0,
      isBase: Boolean(l.isBase),
      maskFill: l.maskFill === 'empty' ? 'empty' : 'full',
      maskUrl: typeof l.maskUrl === 'string' ? l.maskUrl : null,
    }))

  if (layers.length === 0) return null
  // Garante exatamente uma base no fundo.
  if (!layers[0].isBase) layers[0].isBase = true
  for (let i = 1; i < layers.length; i++) layers[i].isBase = false

  return {
    version: 1,
    width: typeof doc.width === 'number' && doc.width > 0 ? doc.width : 1024,
    height: typeof doc.height === 'number' && doc.height > 0 ? doc.height : 1024,
    layers,
  }
}

/** Document para gravar (sem nada além do que o schema espera). */
export function serializeComposition(comp: Composition): Composition {
  return {
    version: 1,
    width: comp.width,
    height: comp.height,
    layers: comp.layers.map((l) => ({
      id: l.id,
      name: l.name,
      url: l.url,
      visible: l.visible,
      opacity: clamp01(l.opacity),
      blendMode: l.blendMode,
      feather: l.feather,
      isBase: l.isBase,
      maskFill: l.maskFill,
      maskUrl: l.maskUrl ?? null,
    })),
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1
  return Math.max(0, Math.min(1, n))
}
