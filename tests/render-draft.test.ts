import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_MAX_AGE, parseRenderDraft, readRenderDraft, saveRenderDraft, type RenderDraft } from '@/lib/onboarding/render-draft'

const now = Date.now()
function fixture(): RenderDraft {
  return { version: 1, id: 'draft-1', ownerId: 'owner-a', updatedAt: now,
    image: new Blob(['image-bytes'], { type: 'image/jpeg' }), filename: 'fachada.jpg', lastModified: now,
    config: { projectType: 'exterior', segment: 'Residencial', environment: 'Fachada Residencial', lighting: 'Golden Hour',
      fixtureLights: 'preserve', background: 'Preservar Original', sceneElements: [], selectedEngine: 'vega', selectedResolution: '2k' },
    materials: { fachada: 'Concreto aparente' }, materialRefs: {}, direction: 'Preservar as aberturas.', goal: 'presentation' }
}
afterEach(() => vi.unstubAllGlobals())
describe('rascunho local de Renderizar', () => {
  it('preserva imagem, materiais, intenção e uma configuração válida', async () => {
    const original = fixture(), parsed = parseRenderDraft(original, 'owner-a', now)!
    expect(await parsed.image.text()).toBe('image-bytes')
    expect(parsed.config).toEqual(original.config)
    expect(parsed.materials).toEqual(original.materials)
    expect(parsed.direction).toBe(original.direction)
    expect(parsed.goal).toBe('presentation')
  })
  it('nunca restaura o rascunho de outra conta', () => {
    expect(parseRenderDraft(fixture(), 'owner-b', now)).toBeNull()
    expect(parseRenderDraft(fixture(), '', now)).toBeNull()
  })
  it('recusa versões desconhecidas, vencidas ou data corrompida', () => {
    expect(parseRenderDraft({ ...fixture(), version: 2 }, 'owner-a', now)).toBeNull()
    expect(parseRenderDraft(fixture(), 'owner-a', now + DRAFT_MAX_AGE + 1)).toBeNull()
    expect(parseRenderDraft({ ...fixture(), updatedAt: NaN }, 'owner-a', now)).toBeNull()
    expect(parseRenderDraft({ ...fixture(), updatedAt: now + 120000 }, 'owner-a', now)).toBeNull()
  })
  it('não restaura motor interno nem combinações de custo inválidas', () => {
    const original = fixture()
    for (const override of [{ selectedEngine: 'orion' }, { selectedEngine: 'quasar', selectedResolution: '4k' }, { selectedResolution: '8k' }]) {
      expect(parseRenderDraft({ ...original, config: { ...original.config, ...override } }, 'owner-a', now)).toBeNull()
    }
  })
  it('recusa imagens inválidas ou muito grandes e referências temporárias', () => {
    for (const image of [new Blob(), new Blob(['x'], { type: 'text/html' }), new Blob([new Uint8Array(16 * 1024 * 1024)], { type: 'image/jpeg' })]) {
      expect(parseRenderDraft({ ...fixture(), image }, 'owner-a', now)).toBeNull()
    }
    expect(parseRenderDraft({ ...fixture(), materialRefs: { fachada: 'blob:expired' } }, 'owner-a', now)).toBeNull()
    expect(parseRenderDraft({ ...fixture(), goal: '__proto__' }, 'owner-a', now)).toBeNull()
  })
  it('limita textos e rejeita campos de configuração ausentes', () => {
    expect(parseRenderDraft({ ...fixture(), direction: 'x'.repeat(4001) }, 'owner-a', now)).toBeNull()
    expect(parseRenderDraft({ ...fixture(), materials: { fachada: 42 } }, 'owner-a', now)).toBeNull()
    expect(parseRenderDraft({ ...fixture(), config: {} }, 'owner-a', now)).toBeNull()
  })
  it('informa indisponibilidade de armazenamento sem simular sucesso', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(readRenderDraft('owner-a')).rejects.toThrow('draft-storage-unavailable')
    await expect(saveRenderDraft(fixture())).rejects.toThrow('draft-storage-unavailable')
  })
})
