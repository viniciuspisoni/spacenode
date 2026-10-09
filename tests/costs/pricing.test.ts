import { describe, expect, it } from 'vitest'
import { falGoogleImageUsd, googleImageUsageUsd } from '@/lib/costs/pricing'
describe('tariff estimates', () => {
  it('accounts for fal output count, resolution and optional search/thinking', () => {
    expect(falGoogleImageUsd('fal-ai/nano-banana-pro/edit', { resolution: '4K', enable_web_search: true }, 2)).toBeCloseTo(0.615)
    expect(falGoogleImageUsd('fal-ai/nano-banana-2/edit', { resolution: '2K', thinking_level: 'high' }, 1)).toBeCloseTo(0.122)
    expect(falGoogleImageUsd('fal-ai/nano-banana-2/edit', { resolution: '0.5K' }, 1)).toBeCloseTo(0.06)
  })
  it('prices input, cache, image output, text and thoughts separately', () => {
    const value = googleImageUsageUsd('gemini-3.1-flash-image', { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 1200, thoughtsTokenCount: 100, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1100 }, { modality: 'TEXT', tokenCount: 100 }] })
    expect(value).toBeCloseTo((800 * 0.5 + 200 * 0.05 + 200 * 3 + 1100 * 60) / 1_000_000)
  })
  it('does not invent prices for unknown models, regions or missing modalities', () => {
    expect(googleImageUsageUsd('gemini-3.1-flash-image', { promptTokenCount: 100, candidatesTokenCount: 200 })).toBeNull()
    expect(googleImageUsageUsd('future-model', {})).toBeNull()
    expect(googleImageUsageUsd('gemini-3-pro-image', {}, 'us-central1')).toBeNull()
    expect(falGoogleImageUsd('other-endpoint', {}, 1)).toBeNull()
  })
})
