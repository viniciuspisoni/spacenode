import { describe, expect, it } from 'vitest'
import { buildEditPrompt, buildSeedreamEditPrompt } from '@/lib/edit-v3/buildEditPrompt'
import { buildEditV4Prompt } from '@/lib/edit-v4/prompt'

const request = {
  action: 'refine_area' as const,
  instructionEn: 'Remove the bright reflection on the wood panel on the right.',
  preservation: 'maximum' as const,
  intensity: 'standard' as const,
  references: [],
}

describe('lighting artifact repair across active editor paths', () => {
  it.each([false, true])('preserves the scene while allowing the named reflection repair (selection=%s)', selected => {
    const regionTag = selected ? '<bbox>700 100 900 800</bbox>' : null
    const prompts = [
      buildEditPrompt({ ...request, hasMask: selected }),
      buildSeedreamEditPrompt({ ...request, hasMask: selected, regionTag }),
      buildEditV4Prompt({ ...request, regionTag, hasOutline: selected }),
    ]
    for (const prompt of prompts) {
      expect(prompt).toContain(request.instructionEn)
      expect(prompt).toContain('does not require preserving that named artifact')
      expect(prompt).toContain('Keep the surface itself and all geometry intact')
      expect(prompt).toContain('Preserve lighting and reflections everywhere else')
      expect(prompt).toMatch(/PRESERVATION(?:: Maximum| \(MAXIMUM\))/)
      expect(prompt).toContain(selected ? 'pixel-identical' : 'NO selection')
    }
  })

  it('does not authorize relighting when the request only changes a material', () => {
    const prompt = buildEditV4Prompt({
      ...request,
      action: 'swap_material',
      instructionEn: 'Change the selected countertop to white quartz.',
      regionTag: '<bbox>200 300 700 600</bbox>',
      hasOutline: true,
    })
    expect(prompt).toContain('If the user explicitly asks')
    expect(prompt).toContain('When no lighting repair is requested, preserve the existing lighting and reflections')
    expect(prompt).toContain('Inherit the existing scene lighting, shadows and reflections onto the new material')
  })
})
