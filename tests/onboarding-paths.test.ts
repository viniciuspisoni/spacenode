import { describe, expect, it } from 'vitest'
import { ONBOARDING_PATHS, canOfferAfterValue, canOfferForContinuation } from '@/lib/onboarding'

describe('onboarding até primeiro valor', () => {
  it('encaminha imagens de modelo e fotos ao Renderizar com guia aberto', () => {
    for (const source of ['model', 'photo'] as const) {
      const url = new URL(ONBOARDING_PATHS[source].href, 'https://spacenode.app')
      expect(url.pathname).toBe('/app/generate')
      expect(url.hash).toBe('#guia')
      expect(url.searchParams.get('onboarding')).toBe(source)
    }
  })
  it('encaminha um render já existente ao Editar', () => {
    expect(ONBOARDING_PATHS.render.href).toBe('/app/editar?onboarding=1')
  })
  it('não confunde conclusão ou silêncio com primeiro valor', () => {
    expect(canOfferAfterValue(true, null)).toBe(false)
    expect(canOfferAfterValue(true, false)).toBe(false)
    expect(canOfferAfterValue(true, true)).toBe(true)
  })
  it('não oferece nova assinatura a um pagante ou membro de equipe', () => {
    expect(canOfferAfterValue(false, true)).toBe(false)
  })
  it('convida após utilidade sem exigir uma segunda resposta e respeita uso pontual', () => {
    expect(canOfferForContinuation(true, true, 'recurring')).toBe(true)
    for (const need of [null, 'unknown'] as const) expect(canOfferForContinuation(true, true, need)).toBe(true)
    expect(canOfferForContinuation(true, true, 'one_project')).toBe(false)
    expect(canOfferForContinuation(false, true, 'recurring')).toBe(false)
    expect(canOfferForContinuation(true, null, 'recurring')).toBe(false)
    expect(canOfferForContinuation(true, false, 'recurring')).toBe(false)
  })
})
