import { describe, expect, it } from 'vitest'
import { conversationTurns, latestConversationImage, isActionConfirmation, automaticHandoff } from '@/lib/nodi/conversation'
import type { ConversationMessage } from '@/lib/nodi/conversation'

const result: ConversationMessage = { role: 'nodi', kind: 'executed', text: 'Imagem concluída.',
  generationRef: { kind: 'render', id: 'owned-render' }, projectScope: 'project-a' }

describe('continuidade de imagem e decisões', () => {
  it('não sai do chat quando uma geração aguarda confirmação ou o print é novo', () => {
    const free = { id: 'free', type: 'apply_settings' as const, label: 'Configurar' }
    const answer = { text: 'Proposta', source: 'v2' as const, proposals: [free] }
    expect(automaticHandoff(answer, null)).toBe(free)
    expect(automaticHandoff(answer, { kind: 'upload', id: 'sealed' })).toBeNull()
    expect(automaticHandoff({ ...answer, proposals: [free, { id: 'paid', type: 'start_generation', label: 'Gerar', executable: true }] }, null)).toBeNull()
  })
  it('resultado executado entra no histórico da próxima pergunta', () => {
    expect(conversationTurns([result])[0].text).toContain('owned-render')
    expect(latestConversationImage([result], 'project-a')).toEqual(result.generationRef)
  })
  it('texto longo não apaga a referência do resultado', () => {
    expect(conversationTurns([{ ...result, text: 'a'.repeat(1400) }])[0].text).toContain('owned-render')
  })
  it('outro projeto não herda a imagem anterior', () => {
    expect(latestConversationImage([result], 'project-b')).toBeNull()
    expect(latestConversationImage([result], null)).toBeNull()
  })
  it('vídeo não vira imagem de referência', () => {
    expect(latestConversationImage([{ ...result, generationRef: { kind: 'video', id: 'v' } }], 'project-a')).toBeNull()
  })
  it('inclui direção e configuração, sem o token da proposta', () => {
    const turns = conversationTurns([{ role: 'nodi', kind: 'v2', text: 'Sugestão pronta.',
      v2: { text: 'Sugestão pronta.', source: 'v2', promptSuggestion: { prompt: 'Luz suave', rationale: 'r' },
        recommendation: { moduleId: 'renderizar', moduleLabel: 'Renderizar', settings: { engine: 'vega' }, rationale: 'r' },
        proposals: [{ id: 'p', type: 'start_generation', label: 'Gerar', intentToken: 'secret-intent' }] } }])
    expect(turns[0].text).toContain('Luz suave')
    expect(turns[0].text).toContain('vega')
    expect(turns[0].text).not.toContain('secret-intent')
  })
})

describe('confirmação exata de ações', () => {
  it.each(['sim', 'Sim!', 'pode gerar', 'sim, pode gerar', 'confirmo a geração'])('%s confirma', text => expect(isActionConfirmation(text)).toBe(true))
  it.each(['sim, mas não gere ainda', 'ok quanto custa?', 'pode me explicar?', 'faz sem gastar', 'sim se for grátis', 'não'])('%s não confirma', text => expect(isActionConfirmation(text)).toBe(false))
})
