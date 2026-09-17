import { describe, expect, it } from 'vitest'
import {
  IN_PROGRESS_STALE_MS,
  decideReplay,
  parseClientRequestId,
} from '@/lib/edit-v4/idempotency'
import type { PriorEditJob } from '@/lib/edit-v3/persist'

const NOW = Date.parse('2026-09-17T12:00:00Z')

function job(patch: Partial<PriorEditJob>): PriorEditJob {
  return {
    id: 'job-1',
    status: 'completed',
    result_image_url: 'https://storage.example/retocar/result/1.png',
    nodes_cost: 18,
    charged: true,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...patch,
  }
}

describe('parseClientRequestId', () => {
  it('aceita só UUID (normalizado em minúsculas)', () => {
    expect(parseClientRequestId(' 5D41402A-BC4B-4C2E-9E2A-1F2A3B4C5D6E ')).toBe('5d41402a-bc4b-4c2e-9e2a-1f2a3b4c5d6e')
    expect(parseClientRequestId('abc')).toBeNull()
    expect(parseClientRequestId(42)).toBeNull()
    expect(parseClientRequestId(undefined)).toBeNull()
    // Texto livre nunca entra no banco por este campo.
    expect(parseClientRequestId("5d41402a-bc4b-4c2e-9e2a-1f2a3b4c5d6e'; drop table")).toBeNull()
  })
})

describe('decideReplay', () => {
  it('sem job anterior → gera normalmente', () => {
    expect(decideReplay(null, NOW)).toEqual({ kind: 'none' })
    expect(decideReplay(undefined, NOW)).toEqual({ kind: 'none' })
  })

  it('job concluído com resultado → replay (nada é cobrado de novo)', () => {
    const prior = job({})
    expect(decideReplay(prior, NOW)).toEqual({ kind: 'replay', job: prior })
  })

  it('job concluído SEM resultado não é reaproveitável', () => {
    expect(decideReplay(job({ result_image_url: null }), NOW)).toEqual({ kind: 'none' })
  })

  it('job em andamento e recente → o cliente espera (409)', () => {
    const prior = job({ status: 'processing', result_image_url: null })
    expect(decideReplay(prior, NOW)).toEqual({ kind: 'in_progress', job: prior })
  })

  it('job "em andamento" velho demais é tratado como morto → gera de novo', () => {
    const prior = job({
      status: 'processing',
      result_image_url: null,
      created_at: new Date(NOW - IN_PROGRESS_STALE_MS - 1).toISOString(),
    })
    expect(decideReplay(prior, NOW)).toEqual({ kind: 'none' })
  })

  it('job com created_at ilegível nunca prende o cliente', () => {
    const prior = job({ status: 'processing', result_image_url: null, created_at: 'ontem' })
    expect(decideReplay(prior, NOW)).toEqual({ kind: 'none' })
  })

  it('falha e recusa liberam uma nova tentativa (que não foram cobradas)', () => {
    expect(decideReplay(job({ status: 'failed', result_image_url: null }), NOW)).toEqual({ kind: 'none' })
    expect(decideReplay(job({ status: 'rejected' }), NOW)).toEqual({ kind: 'none' })
  })
})
