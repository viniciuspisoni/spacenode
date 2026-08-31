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
  isTransientCapacityError,
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

// Payloads REAIS colhidos do generation_log de produção (renders que caíram no
// fallback FAL). O 429 do Vertex nos modelos de imagem vem sem quota_metric e
// sem violations — é capacidade compartilhada do endpoint global, o caso que o
// retry existe pra absorver.
describe('isTransientCapacityError', () => {
  const prod429 = '{"error":{"code":429,"message":"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.","status":"RESOURCE_EXHAUSTED"}}'
  const prod429Curto = '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}'
  const prod503 = '{"error":{"code":503,"message":"The service is currently unavailable.","status":"UNAVAILABLE"}}'

  it('repete o 429 de capacidade do Vertex (mensagem crua de produção)', () => {
    expect(isTransientCapacityError(new Error(prod429))).toBe(true)
    expect(isTransientCapacityError(new Error(prod429Curto))).toBe(true)
  })

  it('repete 503 UNAVAILABLE', () => {
    expect(isTransientCapacityError(new Error(prod503))).toBe(true)
  })

  it('repete quando o ApiError expõe status/code numérico', () => {
    expect(isTransientCapacityError({ status: 429 })).toBe(true)
    expect(isTransientCapacityError({ code: 503 })).toBe(true)
    expect(isTransientCapacityError({ status: 500 })).toBe(true)
  })

  it('NÃO repete o que não se cura sozinho — 400/401/403 e o 404 do incidente -preview', () => {
    expect(isTransientCapacityError({ status: 400 })).toBe(false)
    expect(isTransientCapacityError({ status: 401 })).toBe(false)
    expect(isTransientCapacityError({ status: 403 })).toBe(false)
    const prod404 = '{"error":{"code":404,"message":"Publisher model `projects/x/locations/global/publishers/google/models/gemini-3-pro-image-preview` was not found or your project does not have access to it.","status":"NOT_FOUND"}}'
    expect(isTransientCapacityError(new Error(prod404))).toBe(false)
  })

  it('status numérico tem precedência sobre o texto da mensagem', () => {
    // 400 cuja mensagem cita "429" não pode virar retry.
    expect(isTransientCapacityError({ status: 400, message: 'quota 429 mencionada' })).toBe(false)
  })

  it('não lança em entrada estranha', () => {
    expect(isTransientCapacityError(null)).toBe(false)
    expect(isTransientCapacityError(undefined)).toBe(false)
    expect(isTransientCapacityError('erro solto')).toBe(false)
  })
})
