import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { CONTACT_NOTICE_VERSION } from '@/lib/customer-contact/validation'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn(), enabled: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ upsert: mocks.upsert }) }) }))
vi.mock('@/lib/customer-contact/server', () => ({ contactCaptureEnabled: mocks.enabled }))
import { PUT } from '@/app/api/users/me/contact/route'

const input = { whatsapp: '11999991234', support_opt_in: false, marketing_opt_in: false, notice_version: CONTACT_NOTICE_VERSION }
function request(body: unknown = input, origin = 'https://spacenode.app') {
  return new NextRequest('https://spacenode.app/api/users/me/contact', { method: 'PUT',
    headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } }, error: null })
  mocks.upsert.mockResolvedValue({ error: null })
})
describe('gravação de contato', () => {
  it('usa somente o dono da sessão e não inclui o telefone na resposta', async () => {
    const response = await PUT(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'current-user',
      whatsapp_e164: '+5511999991234', signup_exempt: false, marketing_opt_in: false }), { onConflict: 'user_id' })
  })
  it('rejeita envio de outra origem antes de acessar a conta', async () => {
    expect((await PUT(request(input, 'https://other.example'))).status).toBe(403)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('não grava sem sessão', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await PUT(request())).status).toBe(401)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejeita tentativa de trocar o dono ou dispensar o campo', async () => {
    expect((await PUT(request({ ...input, user_id: 'other-user' }))).status).toBe(400)
    expect((await PUT(request({ ...input, whatsapp: '' }))).status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('falha sem informar sucesso quando o banco rejeita a gravação', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'internal database detail' } })
    const response = await PUT(request())
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('internal database detail')
  })
  it('respeita a chave de ativação', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await PUT(request())).status).toBe(503)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
