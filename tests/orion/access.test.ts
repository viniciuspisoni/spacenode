// Orion · autorização. As duas travas em série: flag privada de servidor E
// equipe interna. Nenhuma sozinha basta.
//
// Sem chamadas reais — o "admin" aqui é um stub do PostgREST.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canUseOrion, orionInternalEnabled } from '@/lib/orion/access'

/** Stub mínimo do encadeamento que isInternalStaff usa:
 *  admin.from('profiles').select('role').eq('id', …).maybeSingle() */
function fakeAdmin(role: string | null, opts: { error?: boolean } = {}): SupabaseClient {
  const maybeSingle = vi.fn(async () =>
    opts.error ? { data: null, error: { message: 'coluna role inexistente' } } : { data: role === null ? null : { role }, error: null },
  )
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  } as unknown as SupabaseClient
}

const STAFF = { id: 'u-staff', email: 'dev@spacenode.app' }
const CLIENT = { id: 'u-client', email: 'cliente@escritorio.com.br' }

afterEach(() => {
  delete process.env.ORION_INTERNAL_ENABLED
  delete process.env.INTERNAL_STAFF_EMAILS
})

describe('flag ORION_INTERNAL_ENABLED', () => {
  it('desligada por padrão — nem a equipe interna passa', async () => {
    process.env.INTERNAL_STAFF_EMAILS = 'dev@spacenode.app'
    expect(orionInternalEnabled()).toBe(false)
    expect(await canUseOrion(fakeAdmin('admin'), STAFF)).toBe(false)
  })

  it('qualquer valor que não seja exatamente "1" continua desligado', async () => {
    process.env.INTERNAL_STAFF_EMAILS = 'dev@spacenode.app'
    for (const v of ['0', 'true', 'yes', '', ' 1', 'ORION']) {
      process.env.ORION_INTERNAL_ENABLED = v
      expect(orionInternalEnabled(), `valor ${JSON.stringify(v)}`).toBe(false)
      expect(await canUseOrion(fakeAdmin('admin'), STAFF)).toBe(false)
    }
  })
})

describe('com a flag ligada', () => {
  it('libera pela allowlist de e-mail (sem depender de profiles.role)', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    process.env.INTERNAL_STAFF_EMAILS = 'outro@spacenode.app, dev@spacenode.app'
    expect(await canUseOrion(fakeAdmin(null), STAFF)).toBe(true)
  })

  it('libera por profiles.role interno', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    for (const role of ['admin', 'support', 'owner']) {
      expect(await canUseOrion(fakeAdmin(role), STAFF), `role ${role}`).toBe(true)
    }
  })

  it('RECUSA usuário comum, mesmo com role de workspace de cliente', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    // 'member'/'admin de workspace' não são papéis internos: isInternalStaff só
    // olha profiles.role, nunca workspace_members.role.
    for (const role of [null, 'user', 'member', 'client', 'workspace_admin', 'workspace_owner']) {
      expect(await canUseOrion(fakeAdmin(role), CLIENT), `role ${role}`).toBe(false)
    }
  })

  it('e-mail parecido não passa pela allowlist', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    process.env.INTERNAL_STAFF_EMAILS = 'dev@spacenode.app'
    expect(await canUseOrion(fakeAdmin(null), { id: 'x', email: 'dev@spacenode.app.br' })).toBe(false)
    expect(await canUseOrion(fakeAdmin(null), { id: 'x', email: null })).toBe(false)
  })

  it('falha na leitura do perfil nega o acesso (fail-closed)', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    expect(await canUseOrion(fakeAdmin(null, { error: true }), STAFF)).toBe(false)
  })
})
