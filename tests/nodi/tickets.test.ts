// Serviço de chamados: validação, saneamento e o contrato do que é gravado.
// O que importa aqui: nada sensível passa, campos são clampados, e o resumo
// de texto (copiar/WhatsApp) carrega o essencial.

import { describe, expect, it } from 'vitest'
import {
  buildTicketRow,
  sanitizeTicketContext,
  summarizeTranscript,
  ticketPlainSummary,
  ticketProtocol,
} from '@/lib/nodi/tickets'
import type { NodiTurn, TicketDraft, TicketRecord } from '@/lib/nodi/types'

const baseDraft: TicketDraft = {
  title: 'Geração com erro no Renderizar',
  description: 'A imagem não saiu e o saldo baixou.',
  category: 'generation_failed',
  priority: 'normal',
  context: {
    route: '/app/generate',
    module: 'Renderizar',
    generationKind: 'render',
    generationId: 'abc-123',
    status: 'failed',
  },
}

describe('buildTicketRow', () => {
  it('monta a linha com user_id e campos saneados', () => {
    const row = buildTicketRow('user-1', baseDraft)
    expect(row.user_id).toBe('user-1')
    expect(row.title).toBe(baseDraft.title)
    expect(row.category).toBe('generation_failed')
    expect(row.generation_kind).toBe('render')
    expect(row.generation_id).toBe('abc-123')
  })

  it('rejeita título/descrição vazios', () => {
    expect(() => buildTicketRow('u', { ...baseDraft, title: '   ' })).toThrow()
    expect(() => buildTicketRow('u', { ...baseDraft, description: '' })).toThrow()
  })

  it('remove segredos colados na descrição', () => {
    const row = buildTicketRow('u', {
      ...baseDraft,
      description: 'olha meu token: super-secreto-123 e o erro',
    })
    expect(String(row.description)).not.toContain('super-secreto-123')
  })

  it('categoria/prioridade fora da lista caem no padrão', () => {
    const row = buildTicketRow('u', {
      ...baseDraft,
      category: 'hacker' as TicketDraft['category'],
      priority: 'apocalyptic' as TicketDraft['priority'],
    })
    expect(row.category).toBe('other')
    expect(row.priority).toBe('normal')
  })
})

describe('sanitizeTicketContext', () => {
  it('só deixa passar chaves conhecidas', () => {
    const dirty = {
      route: '/app/video',
      module: 'Animar',
      apiKey: 'sk-123',
      stack: 'Error at...',
    } as unknown as TicketDraft['context']
    const clean = sanitizeTicketContext(dirty)
    expect(clean.route).toBe('/app/video')
    expect(clean.module).toBe('Animar')
    expect('apiKey' in clean).toBe(false)
    expect('stack' in clean).toBe(false)
  })

  it('extra é clampado a 8 pares de strings curtas', () => {
    const extra: Record<string, string> = {}
    for (let i = 0; i < 20; i++) extra[`k${i}`] = `v${i}`
    const clean = sanitizeTicketContext({ extra })
    expect(Object.keys(clean.extra ?? {}).length).toBeLessThanOrEqual(8)
  })
})

describe('summarizeTranscript', () => {
  it('mantém só os últimos 12 turnos, truncados', () => {
    const turns: NodiTurn[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? 'nodi' : 'user',
      text: `turno ${i} ` + 'x'.repeat(600),
      at: i,
    }))
    const out = summarizeTranscript(turns)!
    expect(out.length).toBe(12)
    expect(out[0].text).toContain('turno 18')
    for (const t of out) expect(t.text.length).toBeLessThanOrEqual(400)
  })

  it('vazio → null', () => {
    expect(summarizeTranscript([])).toBeNull()
    expect(summarizeTranscript(undefined)).toBeNull()
  })
})

describe('protocolo e resumo', () => {
  it('protocolo tem o formato ND-<seq>', () => {
    expect(ticketProtocol(42)).toBe('ND-42')
  })

  it('resumo carrega protocolo, título e contexto essencial', () => {
    const record: TicketRecord = {
      id: 'x',
      protocol: 'ND-7',
      status: 'open',
      priority: 'normal',
      category: 'generation_failed',
      title: baseDraft.title,
      createdAt: '2026-07-17T12:00:00Z',
    }
    const text = ticketPlainSummary(record, baseDraft)
    expect(text).toContain('ND-7')
    expect(text).toContain(baseDraft.title)
    expect(text).toContain('render abc-123')
  })
})
