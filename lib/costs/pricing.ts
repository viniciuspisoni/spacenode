import { amount, obj } from './aggregate'

export const COST_TARIFF_VERSION = '2026-10-09'
export const COST_TARIFF_SOURCES = ['https://fal.ai/models/fal-ai/nano-banana-pro/edit', 'https://fal.ai/models/fal-ai/nano-banana-2/edit', 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing']
/** Standard Global estimates. Incomplete usage remains unknown. */
export function googleImageUsageUsd(model: string, raw: unknown, location = 'global'): number | null {
  if (location !== 'global') return null
  const u = obj(raw), input = amount(u.promptTokenCount), output = amount(u.candidatesTokenCount)
  const cached = amount(u.cachedContentTokenCount) ?? 0, thoughts = amount(u.thoughtsTokenCount) ?? 0
  if (input === null || output === null || cached > input) return null
  const rates = model === 'gemini-3.1-flash-image' ? [0.5, 0.05, 3, 60] : model === 'gemini-3-pro-image' ? [2, 0.2, 12, 120] : null
  if (!rates || !Array.isArray(u.candidatesTokensDetails)) return null
  const details = u.candidatesTokensDetails.map(obj)
  const image = details.filter(d => d.modality === 'IMAGE').reduce((sum, d) => sum + (amount(d.tokenCount) ?? 0), 0)
  if (image <= 0 || image > output || details.some(d => !['TEXT', 'IMAGE'].includes(String(d.modality)) || amount(d.tokenCount) === null)) return null
  return ((input - cached) * rates[0] + cached * rates[1] + (output - image + thoughts) * rates[2] + image * rates[3]) / 1_000_000
}
export function falGoogleImageUsd(endpoint: string, input: Record<string, unknown>, outputs: number): number | null {
  if (!Number.isInteger(outputs) || outputs < 1) return null
  const resolution = String(input.resolution ?? '1K').toUpperCase(), search = input.enable_web_search === true || input.enable_google_search === true ? 0.015 : 0
  if (endpoint === 'fal-ai/nano-banana-pro/edit') { if (!['1K', '2K', '4K'].includes(resolution)) return null; return outputs * (resolution === '4K' ? 0.3 : 0.15) + search }
  if (endpoint === 'fal-ai/nano-banana-2/edit') {
    const multiplier = { '0.5K': 0.75, '1K': 1, '2K': 1.5, '4K': 2 }[resolution]
    if (multiplier === undefined) return null
    return outputs * 0.08 * multiplier + search + (input.thinking_level === 'high' ? 0.002 : 0)
  }
  return null
}
