import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { belongsToRecovery, lightRecoveryInstruction, materialRecoveryInstruction, recoveryHref, recoveryReason } from '@/lib/onboarding/render-recovery'
import { loadOwnRenderRecovery } from '@/lib/onboarding/render-recovery-server'

const mocks = vi.hoisted(() => ({ user: vi.fn(), render: vi.fn(), jobs: vi.fn(), saved: vi.fn(), persist: vi.fn(), limit: vi.fn(), eq: vi.fn() }))
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: mocks.user }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.limit }))
vi.mock('@/lib/marketing/ads/service', () => ({ recordAcquisitionEvent: mocks.persist }))
vi.mock('@/lib/analytics/internal', () => ({ isInternalTraffic: () => true }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }))

function from(table: string) {
  const q = {
    select: () => q, eq: (...args: unknown[]) => { mocks.eq(...args); return q }, in: () => q, contains: () => q,
    gte: () => q, order: () => q,
    limit: () => table === 'edit_v3_jobs' ? mocks.jobs() : q,
    maybeSingle: () => table === 'renders' ? mocks.render() : mocks.saved(),
  }
  return q
}
const db = { from, schema: () => ({ from }) }
import { GET, POST } from '@/app/api/renders/[renderId]/recovery/[jobId]/feedback/route'
const renderId = 'c25ac18f-8f83-4e7a-84d1-b31d53e24382'
const jobId = 'a25ac18f-8f83-4e7a-84d1-b31d53e24382'
const output = 'https://nucyyqmurhnakhldshwr.supabase.co/storage/v1/object/public/renders/root.png'
const edited = 'https://nucyyqmurhnakhldshwr.supabase.co/storage/v1/object/public/edits/result.png'
const job = { id: jobId, source_image_url: output, result_image_url: edited, nodes_cost: 18, charged: true }
const root = { id: renderId, user_id: 'owner', status: 'completed', input_url: output, output_url: output, ambient: 'interior', is_internal_test: false, created_at: '2026-10-19T10:00:00Z' }
const params = { params: Promise.resolve({ renderId, jobId }) }
const url = `https://spacenode.app/api/renders/${renderId}/recovery/${jobId}/feedback`
function post(body: unknown, origin = 'https://spacenode.app') {
  return new NextRequest(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nucyyqmurhnakhldshwr.supabase.co'
  mocks.user.mockResolvedValue({ user: { id: 'owner' } })
  mocks.render.mockResolvedValue({ data: root, error: null })
  mocks.jobs.mockResolvedValue({ data: [job], error: null })
  mocks.saved.mockResolvedValue({ data: null, error: null })
  mocks.persist.mockResolvedValue(true)
  mocks.limit.mockResolvedValue({ allowed: true })
})

describe('ajuste guiado: pedido e contexto', () => {
  it('transporta só id e motivo conhecido, sem prompt ou URL da imagem', () => {
    expect(recoveryHref(renderId, 'lighting')).toContain('reason=lighting')
    expect(recoveryHref(renderId, null)).toContain('reason=other')
    expect(recoveryReason(['lighting'])).toBeNull()
    expect(recoveryReason('unknown')).toBeNull()
  })
  it('material exige um alvo e um acabamento ou amostra antes de preparar', () => {
    expect(materialRecoveryInstruction('', 'madeira', false, false)).toBeNull()
    expect(materialRecoveryInstruction('piso', '', false, false)).toBeNull()
    expect(materialRecoveryInstruction('', '', true, true)).toContain('área selecionada')
    expect(materialRecoveryInstruction('piso da sala', 'bege fosco', false, false)).toContain('piso da sala por bege fosco')
  })
  it('as sugestões de luz descrevem apenas a intenção selecionada', () => {
    expect(lightRecoveryInstruction('bright')).toContain('Clarear')
    expect(lightRecoveryInstruction('soft')).toContain('reduzir o brilho')
  })
  it('carrega imagem persistida e restringe a consulta ao dono autenticado', async () => {
    expect(await loadOwnRenderRecovery(db as never, 'owner', renderId, 'lighting')).toMatchObject({ renderId, reason: 'lighting', outputUrl: output })
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'owner')
    mocks.render.mockResolvedValue({ data: { ...root, user_id: 'other' }, error: null })
    expect(await loadOwnRenderRecovery(db as never, 'owner', renderId, 'lighting')).toBeNull()
  })
  it('não abre resultado incompleto, interno, vídeo ou imagem externa', async () => {
    for (const patch of [{ status: 'failed' }, { is_internal_test: true }, { ambient: 'video' }, { output_url: 'https://evil.example/image.jpg' }]) {
      mocks.render.mockResolvedValue({ data: { ...root, ...patch }, error: null })
      expect(await loadOwnRenderRecovery(db as never, 'owner', renderId, 'geometry')).toBeNull()
    }
  })
  it('reconhece ajustes encadeados e assinaturas do mesmo objeto no Storage', () => {
    const next = { ...job, id: 'next', source_image_url: edited, result_image_url: 'https://fal.media/next.png' }
    expect(belongsToRecovery(output, [job, next], 'next')).toBe(true)
    expect(belongsToRecovery(output, [{ ...job, source_image_url: output.replace('/public/', '/sign/') + '?token=signature' }], jobId)).toBe(true)
    expect(belongsToRecovery(output, [{ ...job, source_image_url: 'https://fal.media/unrelated.png' }], jobId)).toBe(false)
  })
  it('encerra ciclos e mantém a identidade de URLs CDN com query diferente', () => {
    expect(belongsToRecovery('https://fal.media/a.png?x=1', [{ ...job, source_image_url: 'https://fal.media/a.png?x=2' }], jobId)).toBe(false)
    expect(belongsToRecovery(output, [{ ...job, source_image_url: edited }], jobId)).toBe(false)
  })
})

describe('avaliação autenticada após o ajuste', () => {
  it('não aceita origem externa nem campos extras', async () => {
    expect((await POST(post({ useful: true }, 'https://evil.example'), params)).status).toBe(403)
    expect((await POST(post({ useful: true, nodes_cost: 0 }), params)).status).toBe(400)
    expect(mocks.persist).not.toHaveBeenCalled()
  })
  it('exige sessão e um render do dono', async () => {
    mocks.user.mockResolvedValue({ user: null })
    expect((await POST(post({ useful: true }), params)).status).toBe(401)
    mocks.user.mockResolvedValue({ user: { id: 'owner' } })
    mocks.render.mockResolvedValue({ data: null, error: null })
    expect((await GET(new NextRequest(url), params)).status).toBe(404)
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'owner')
  })
  it('recusa job ausente, alheio ou sem relação com o render', async () => {
    mocks.jobs.mockResolvedValue({ data: [], error: null })
    expect((await POST(post({ useful: true }), params)).status).toBe(404)
    mocks.jobs.mockResolvedValue({ data: [{ ...job, source_image_url: 'https://fal.media/other.png' }], error: null })
    expect((await POST(post({ useful: true }), params)).status).toBe(404)
    expect(mocks.persist).not.toHaveBeenCalled()
  })
  it('persiste resposta explícita e custo real, sem sobrescrever a avaliação original', async () => {
    const res = await POST(post({ useful: false, reason: 'materials' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ feedback: { useful: false, reason: 'materials' } })
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_type: 'result_rejected', user_id: 'owner', is_internal: true,
      metadata: expect.objectContaining({ recovery_feedback: expect.objectContaining({ render_id: renderId, job_id: jobId, useful: false, reason: 'materials', nodes_cost: 18, charged: true }) }),
    }))
  })
  it('não confirma sucesso quando a gravação falha e respeita o limite', async () => {
    mocks.persist.mockResolvedValue(false)
    expect((await POST(post({ useful: true }), params)).status).toBe(500)
    mocks.limit.mockResolvedValue({ allowed: false })
    expect((await POST(post({ useful: true }), params)).status).toBe(429)
  })
  it('consulta a última avaliação da edição, mantendo silêncio como desconhecido', async () => {
    expect(await (await GET(new NextRequest(url), params)).json()).toEqual({ feedback: null })
    mocks.saved.mockResolvedValue({ data: { metadata: { recovery_feedback: { useful: true, reason: null } } }, error: null })
    expect(await (await GET(new NextRequest(url), params)).json()).toEqual({ feedback: { useful: true, reason: null } })
  })
})
