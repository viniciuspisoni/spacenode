// tests/ai/gemini-knobs.test.ts
//
// Contrato dos knobs Gemini 3 compartilhados (lib/ai/gemini-knobs):
//   - defaults LIGADOS sem env (media 'high', thinking 'high');
//   - kill-switches e valores explícitos por env;
//   - valor inválido cai no default seguro (nunca lança);
//   - detecção de request inválida (retry compat dos caminhos Google).

import { describe, it, expect, afterEach } from 'vitest'
import {
  inputMediaResolutionDefault,
  nb2ThinkingLevel,
  isInvalidArgumentError,
  isTransientProviderError,
} from '@/lib/ai/gemini-knobs'

const savedMedia    = process.env.IMAGE_INPUT_MEDIA_RESOLUTION
const savedThinking = process.env.IMAGE_NB2_THINKING_LEVEL

afterEach(() => {
  if (savedMedia === undefined) delete process.env.IMAGE_INPUT_MEDIA_RESOLUTION
  else process.env.IMAGE_INPUT_MEDIA_RESOLUTION = savedMedia
  if (savedThinking === undefined) delete process.env.IMAGE_NB2_THINKING_LEVEL
  else process.env.IMAGE_NB2_THINKING_LEVEL = savedThinking
})

describe('inputMediaResolutionDefault', () => {
  it('default sem env é high (ligado no código, sem depender da Vercel)', () => {
    delete process.env.IMAGE_INPUT_MEDIA_RESOLUTION
    expect(inputMediaResolutionDefault()).toBe('high')
  })

  it('aceita os níveis documentados e normaliza caixa/espaço', () => {
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = ' ULTRA_HIGH '
    expect(inputMediaResolutionDefault()).toBe('ultra_high')
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = 'low'
    expect(inputMediaResolutionDefault()).toBe('low')
  })

  it('off/0 desligam; valor inválido cai no default high', () => {
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = 'off'
    expect(inputMediaResolutionDefault()).toBeNull()
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = '0'
    expect(inputMediaResolutionDefault()).toBeNull()
    process.env.IMAGE_INPUT_MEDIA_RESOLUTION = 'banana'
    expect(inputMediaResolutionDefault()).toBe('high')
  })
})

describe('nb2ThinkingLevel', () => {
  it('default sem env é high (o default de fábrica do NB2 é minimal — nós subimos)', () => {
    delete process.env.IMAGE_NB2_THINKING_LEVEL
    expect(nb2ThinkingLevel()).toBe('high')
  })

  it('minimal explícito e kill-switch off', () => {
    process.env.IMAGE_NB2_THINKING_LEVEL = 'minimal'
    expect(nb2ThinkingLevel()).toBe('minimal')
    process.env.IMAGE_NB2_THINKING_LEVEL = 'off'
    expect(nb2ThinkingLevel()).toBeNull()
  })
})

describe('isInvalidArgumentError', () => {
  it('reconhece status 400 e mensagens INVALID_ARGUMENT do Vertex', () => {
    expect(isInvalidArgumentError(Object.assign(new Error('bad'), { status: 400 }))).toBe(true)
    expect(isInvalidArgumentError(new Error('got status: INVALID_ARGUMENT.'))).toBe(true)
    expect(isInvalidArgumentError(new Error('Invalid JSON payload received. Unknown name "media_resolution"'))).toBe(true)
  })

  it('não confunde timeout/quota/5xx com knob rejeitado', () => {
    expect(isInvalidArgumentError(new Error('RESOURCE_EXHAUSTED: quota'))).toBe(false)
    expect(isInvalidArgumentError(Object.assign(new Error('internal'), { status: 500 }))).toBe(false)
    expect(isInvalidArgumentError(new Error('geração de imagem excedeu 90000ms'))).toBe(false)
  })
})

describe('isTransientProviderError', () => {
  it('reconhece capacidade/quota (429 RESOURCE_EXHAUSTED) e 5xx do Vertex', () => {
    expect(isTransientProviderError(Object.assign(new Error('quota'), { status: 429 }))).toBe(true)
    expect(isTransientProviderError(new Error('got status: RESOURCE_EXHAUSTED.'))).toBe(true)
    expect(isTransientProviderError(Object.assign(new Error('internal'), { status: 500 }))).toBe(true)
    expect(isTransientProviderError(Object.assign(new Error('unavailable'), { status: 503 }))).toBe(true)
    expect(isTransientProviderError(new Error('UNAVAILABLE: The model is overloaded. Please try again later.'))).toBe(true)
  })

  it('reconhece blip de rede (fetch/socket)', () => {
    expect(isTransientProviderError(new Error('fetch failed'))).toBe(true)
    expect(isTransientProviderError(new Error('read ECONNRESET'))).toBe(true)
  })

  it('erro de contrato (400/404) e timeout do budget NÃO são transitórios', () => {
    expect(isTransientProviderError(Object.assign(new Error('bad'), { status: 400 }))).toBe(false)
    expect(isTransientProviderError(new Error('INVALID_ARGUMENT: unknown field'))).toBe(false)
    expect(isTransientProviderError(Object.assign(new Error('não achou'), { status: 404 }))).toBe(false)
    expect(isTransientProviderError(new Error('geração de imagem excedeu 90000ms (gcp: fal-ai/nano-banana-pro/edit)'))).toBe(false)
  })
})
