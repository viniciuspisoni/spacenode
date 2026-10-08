import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOwnSavedRenderReview, normalizeSavedRenderReview } from '@/lib/ai/fidelity/saved-render-review'

const userId = '11111111-1111-4111-8111-111111111111'
const renderId = '22222222-2222-4222-8222-222222222222'
const row = {
  id: renderId, user_id: userId, status: 'completed', engine: 'vega', resolution: '2k',
  input_url: 'https://v3b.fal.media/files/source.png', output_url: 'https://v3b.fal.media/files/result.png',
  config_snapshot: { projectType: 'interior', segment: 'Residencial', environment: 'Banheiro', lighting: 'Preservar Original', materials: null, sceneElements: [] },
  generation_log: { seed: 2137796273, fidelity: { min_score: .8, final_score: .76, semantic_audit: { warning: true, material_review: 'changed' } } },
}

describe('saved result correction preparation (no image generation)', () => {
  it('restores the original/result distinction, original config and seed without re-upload', () => {
    expect(normalizeSavedRenderReview(row, userId)).toMatchObject({ id: renderId, inputUrl: row.input_url,
      outputUrl: row.output_url, seed: 2137796273, warning: true, score: .76, materials: {},
      config: { projectType: 'interior', environment: 'Banheiro', selectedEngine: 'vega', selectedResolution: '2k' } })
  })
  it.each([
    { user_id: '33333333-3333-4333-8333-333333333333' }, { status: 'failed' }, { id: 'invalid' },
    { engine: 'orion' }, { engine: 'invalid' }, { resolution: 'invalid' },
    { input_url: 'http://localhost/source.png' }, { output_url: 'javascript:alert(1)' },
    { config_snapshot: {} }, { input_url: null },
  ])('rejects unowned, incomplete, unsupported or unsafe saved data %j', override => {
    expect(normalizeSavedRenderReview({ ...row, ...override }, userId)).toBeNull()
  })
  it.each([NaN, -1, 2 ** 40, '2137796273'])('does not forward an invalid seed %s', seed => {
    expect(normalizeSavedRenderReview({ ...row, generation_log: { seed } }, userId)?.seed).toBeNull()
  })
  it('keeps explicit materials and excludes unknown snapshot fields from client props', () => {
    const result = normalizeSavedRenderReview({ ...row, config_snapshot: { ...row.config_snapshot,
      materials: { piso: 'porcelanato branco', paredes: false, unknown: 'ignored' }, prompt: 'private provider prompt' } }, userId)
    expect(result?.materials).toEqual({ piso: 'porcelanato branco' })
    expect(JSON.stringify(result)).not.toContain('private provider prompt')
  })
  it.each([[{ field: 'piso', url: row.input_url }], 'malformed'])('does not silently omit a saved photographic material reference %j', material_refs => {
    expect(normalizeSavedRenderReview({ ...row, config_snapshot: { ...row.config_snapshot, material_refs } }, userId)).toBeNull()
  })
  it('does not invent a geometry warning without a saved threshold', () => {
    expect(normalizeSavedRenderReview({ ...row, generation_log: { fidelity: { final_score: .76 } } }, userId)?.warning).toBe(false)
  })
  it('filters by render, signed-in owner and completed status on the authenticated client', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
    const from = vi.fn().mockReturnValue(query)
    expect(await loadOwnSavedRenderReview({ from } as unknown as Pick<SupabaseClient, 'from'>, userId, renderId)).not.toBeNull()
    expect(from).toHaveBeenCalledWith('renders')
    expect(query.eq.mock.calls).toEqual([['id', renderId], ['user_id', userId], ['status', 'completed']])
    expect(query.select.mock.calls[0][0]).not.toContain('prompt')
  })
  it('invalid request ids cause no database query', async () => {
    const from = vi.fn()
    expect(await loadOwnSavedRenderReview({ from } as unknown as Pick<SupabaseClient, 'from'>, userId, "' or true --")).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
  it('keeps ordinary reference loading available if the optional lookup fails', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockRejectedValue(new Error('unavailable')) }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query)
    expect(await loadOwnSavedRenderReview({ from: () => query } as unknown as Pick<SupabaseClient, 'from'>, userId, renderId)).toBeNull()
  })
})
