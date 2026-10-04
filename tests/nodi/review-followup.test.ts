import { describe, expect, it } from 'vitest'
import { reviewFollowUp } from '@/lib/nodi/review-followup'
import { reviewSummary } from '@/lib/nodi/v4/review-policy'

describe('revisão ligada ao resultado correto', () => {
  it.each(['editar_local', 'melhorar', 'regenerar', 'preparar_entrada', 'decidir', 'aprovar'])('prepara %s sem autorização para gastar', decision => {
    const ref = { kind: 'render' as const, id: 'specific-reviewed-result' }
    const draft = reviewFollowUp(decision, 'Conferir a janela.', ref)
    expect(draft?.attachment).toEqual(ref)
    expect(draft?.requireConfirmation).toBe(true)
    expect(draft?.message).toContain('Não execute nem gaste nodes agora')
  })
  it('não escolhe outra imagem quando a avaliada não tem referência', () => {
    expect(reviewFollowUp('regenerar', 'n')).toBeNull()
    expect(reviewFollowUp('regenerar', 'n', { kind: 'upload', id: 'source' })).toBeNull()
    expect(reviewFollowUp('unknown', 'n', { kind: 'render', id: 'r' })).toBeNull()
  })
  it('limita a nota e mantém preservado, alterado e veredito no envelope', () => {
    expect(reviewFollowUp('editar_local', 'x'.repeat(900), { kind: 'render', id: 'r' })?.message.length).toBeLessThan(900)
    const review = reviewSummary({ subject: 'Original × resultado', summary: 'Conferir piso',
      findings: [{ dimension: 'materiais', severity: 'problema', note: 'textura grande' }],
      comparison: { preserved: ['janela'], changed: ['piso'], verdict: 'Corrigir apenas o piso.' } })
    expect(review.decision).toBe('editar_local')
    expect(review.comparison?.preserved).toEqual(['janela'])
    expect(review.comparison?.changed).toEqual(['piso'])
  })
})
