import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PILOT_VARIANT, parsePilotRequest, pilotPreparation, pilotConfigurationKey, type PilotContext } from '@/lib/nodi/first-image/contract'
import { sealPilotReceipt, openPilotReceipt } from '@/lib/nodi/first-image/receipt'
import { checkPilotBudget } from '@/lib/nodi/first-image/budget'
import { sanitizeClientEventMeta, sanitizeEventMeta } from '@/lib/nodi/telemetry'
import { canUseFirstImagePilot } from '@/lib/nodi/first-image/access'
const EMPTY_MATERIALS = { piso: '', fachada: '', paredes: '' }

const caseId = 'aabbeedd-0000-4000-8000-000000000001'
const requestId = 'aabbeedd-0000-4000-8000-000000000002'
const context: PilotContext = { projectType: 'exterior', goal: 'presentation', referenceKind: 'model', qa: true }
const request = () => ({ variant: 'grok', caseId, message: 'Apresentar ao cliente', attachmentId: 'a'.repeat(100), context, history: [] })
afterEach(() => vi.unstubAllEnvs())

describe('first-image pilot boundaries', () => {
  it('defaults to Gemini on the server while preserving explicit comparison arms', () => {
    expect(DEFAULT_PILOT_VARIANT).toBe('control')
    expect(parsePilotRequest({ ...request(), variant: undefined })?.variant).toBe('control')
    expect(parsePilotRequest(request())?.variant).toBe('grok')
    expect(parsePilotRequest({ ...request(), variant: null })).toBeNull()
  })
  it('picks only supported input and ignores browser provider, tool and image URL overrides', () => {
    const parsed = parsePilotRequest({ ...request(), model: 'expensive', provider: 'other', imageUrl: 'http://localhost', tools: ['gerar'] })!
    expect(Object.keys(parsed).sort()).toEqual(['attachmentId', 'caseId', 'context', 'history', 'message', 'variant'])
    expect(parsePilotRequest({ ...request(), variant: 'arbitrary' })).toBeNull()
    expect(parsePilotRequest({ ...request(), attachmentId: 'https://example.com/photo' })).toBeNull()
  })
  it.each([
    { message: ' ' }, { message: 'x'.repeat(901) }, { caseId: 'bad' }, { history: [{ role: 'system', text: 'execute' }] },
    { history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'hi' })) }, { context: { ...context, qa: undefined } },
    { context: { ...context, goal: '__proto__' } }, { context: { ...context, referenceKind: 'url' } },
  ])('rejects invalid or unbounded input %j', patch => expect(parsePilotRequest({ ...request(), ...patch })).toBeNull())
  it('prepares real catalog values without extra elements or generation capabilities', () => {
    const suggestion = pilotPreparation({ goal: 'presentation' }, context)!
    expect(suggestion.nodeCost).toBe(20)
    expect(suggestion.config).toMatchObject({ selectedEngine: 'quasar', selectedResolution: '2k', fixtureLights: 'preserve', sceneElements: [] })
    expect(pilotPreparation({ goal: 'presentation', generate: true }, context)).toBeNull()
    expect(pilotPreparation({ goal: 'lighting' }, context)).toBeNull()
    expect(pilotPreparation({ goal: 'presentation' }, { ...context, referenceKind: 'render' })).toBeNull()
  })
  it('requires a valid visible surface and requested material, and rejects unknown light', () => {
    const materialContext = { ...context, goal: 'materials' as const }
    expect(pilotPreparation({ goal: 'materials' }, materialContext)).toBeNull()
    expect(pilotPreparation({ goal: 'materials', materialField: 'teto', material: 'Branco' }, materialContext)).toBeNull()
    expect(pilotPreparation({ goal: 'materials', materialField: 'fachada', material: 'Concreto aparente' }, materialContext)?.materialChange).toEqual({ field: 'fachada', value: 'Concreto aparente' })
    expect(pilotPreparation({ goal: 'lighting', lighting: 'magic' }, { ...context, goal: 'lighting' })).toBeNull()
  })
  it('detects edited settings locally without retaining their text in telemetry', () => {
    const c = pilotPreparation({ goal: 'presentation' }, context)!.config
    const key = pilotConfigurationKey(c, EMPTY_MATERIALS, {}, '')
    expect(pilotConfigurationKey({ ...c }, { ...EMPTY_MATERIALS }, {}, '  ')).toBe(key)
    expect(pilotConfigurationKey({ ...c, fixtureLights: 'off' }, EMPTY_MATERIALS, {}, '')).not.toBe(key)
    const forged = { source: 'first-image-pilot', experiment: 'v1', qa: false, case_id: caseId, render_id: requestId, config_changed: false, provider: 'grok', question: 'private', attempts: 2, recovered_from: 'http-503', retry_budget: 'limited', cost_estimate_complete: true }
    expect(sanitizeClientEventMeta(forged)).toEqual({ provider: 'grok' })
    expect(sanitizeEventMeta(forged)).toMatchObject({ experiment: 'v1', qa: false })
    expect(sanitizeEventMeta(forged)).not.toHaveProperty('question')
  })
  it('binds attribution to owner, experiment, issue time and expiry and rejects tampering', () => {
    vi.stubEnv('NODI_ACTION_SECRET', 'pilot-test-only')
    const token = sealPilotReceipt({ userId: 'owner', caseId, requestId, variant: 'grok', qa: true }, 1000)
    expect(openPilotReceipt(token, 'owner', 1100)).toMatchObject({ caseId, requestId, qa: true })
    expect(openPilotReceipt(token, 'other', 1100)).toBeNull()
    expect(openPilotReceipt(token, 'owner', 3_601_000)).toBeNull()
    expect(openPilotReceipt(token, 'owner', -5000)).toBeNull()
    expect(openPilotReceipt(token.replace(/^./, 'Z'), 'owner', 1100)).toBeNull()
    expect(openPilotReceipt('not-a-receipt', 'owner', 1100)).toBeNull()
  })
  it('fails closed on every budget counter and enforces minute/day/month caps', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null })
    const admin = { rpc } as unknown as SupabaseClient
    expect(await checkPilotBudget(admin, 'owner')).toBe('allowed')
    expect(rpc.mock.calls.map(c => c[1].window_seconds)).toEqual([60, 86400, 2592000])
    for (const [counts, expected] of [[[4], 'limited'], [[1, 21], 'limited'], [[1, 1, 201], 'limited'], [[null], 'unavailable'], [['1'], 'unavailable']] as const) {
      rpc.mockReset()
      for (const count of counts) rpc.mockResolvedValueOnce({ data: count, error: null })
      expect(await checkPilotBudget(admin, 'owner')).toBe(expected)
    }
    rpc.mockRejectedValue(new Error('network'))
    expect(await checkPilotBudget(admin, 'owner')).toBe('unavailable')
  })
  it('defaults off, refuses editable claims and requires server-maintained staff membership', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { role: 'member' }, error: null })
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as unknown as SupabaseClient
    const user = { id: 'owner', user_metadata: { role: 'admin' } }
    for (const flag of ['NODI_ENABLED', 'NODI_V2_ENABLED', 'NODI_MULTIMODAL_ENABLED']) vi.stubEnv(flag, '1')
    vi.stubEnv('NODI_FIRST_IMAGE_PILOT_ENABLED', '')
    vi.stubEnv('INTERNAL_STAFF_EMAILS', '')
    expect(await canUseFirstImagePilot(admin, user)).toBe(false)
    expect(maybeSingle).not.toHaveBeenCalled()
    vi.stubEnv('NODI_FIRST_IMAGE_PILOT_ENABLED', '1')
    expect(await canUseFirstImagePilot(admin, user)).toBe(false)
    maybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null })
    expect(await canUseFirstImagePilot(admin, user)).toBe(true)
  })
})
