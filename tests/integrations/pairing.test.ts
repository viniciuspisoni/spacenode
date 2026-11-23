// Pareamento dos plugins: /api/integrations/* (Archicad, Revit) e as rotas
// /api/sketchup/* do plugin em campo, que agora usam a mesma implementação.
//
// O que estes testes protegem:
//   • o fluxo completo start → claim pendente → approve → claim pronto → refresh;
//   • o approve de /integrations/pair recusa um código de outra plataforma;
//   • as rotas do SketchUp nunca leem nem gravam a coluna `platform` — elas
//     continuam funcionando se o deploy chegar antes da migration;
//   • o catálogo só traz `pluginLatest` (o .rbz) para o SketchUp.

import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createMemorySupabase, type MemorySupabase } from '../helpers/memory-supabase'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon-test-key'

type Call = { table: string; op: string; arg: unknown }

const state = vi.hoisted(() => ({
  db: null as unknown as MemorySupabase,
  calls: [] as Call[],
  rateKeys: [] as string[],
  cookieUser: null as null | { id: string; email: string },
  bearerUser: null as null | { id: string; email: string },
  refresh: vi.fn(),
  mint: vi.fn(),
}))

// Admin client = banco em memória, registrando o 1º passo de cada query
// (select/insert/update) para checar quais colunas cada modo toca.
function trackedAdmin() {
  return {
    ...state.db,
    from(table: string) {
      const builder = state.db.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>
      return new Proxy(builder, {
        get(target, prop: string) {
          const value = target[prop]
          if (typeof value !== 'function' || !['select', 'insert', 'update'].includes(prop)) return value
          return (...args: unknown[]) => {
            let arg = args[0]
            // O banco gera uuid; o duplo em memória não.
            if (prop === 'insert' && table === 'sketchup_devices' && arg && typeof arg === 'object') {
              arg = { id: randomUUID(), ...(arg as object) }
            }
            state.calls.push({ table, op: prop, arg })
            return value(arg, ...args.slice(1))
          }
        },
      })
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => trackedAdmin() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.cookieUser } }) } }),
}))
vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: async () => ({ user: state.bearerUser, source: state.bearerUser ? 'bearer' : 'none' }),
}))
vi.mock('@/lib/rate-limit', () => ({
  clientIp: () => '203.0.113.7',
  rateLimit: async (_admin: unknown, key: string) => { state.rateKeys.push(key); return { allowed: true, count: 1 } },
}))
vi.mock('@/lib/sketchup/devices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sketchup/devices')>()),
  mintDeviceSession: state.mint,
  refreshDeviceSession: state.refresh,
}))
vi.mock('@/lib/orion/access', () => ({ canUseOrion: async () => false, orionInternalEnabled: () => false }))

import * as intStart from '@/app/api/integrations/pair/start/route'
import * as intClaim from '@/app/api/integrations/pair/claim/route'
import * as intRefresh from '@/app/api/integrations/pair/refresh/route'
import * as intApprove from '@/app/api/integrations/pair/approve/route'
import * as intDevices from '@/app/api/integrations/devices/route'
import * as intCatalog from '@/app/api/integrations/catalog/route'
import * as skpStart from '@/app/api/sketchup/pair/start/route'
import * as skpClaim from '@/app/api/sketchup/pair/claim/route'
import * as skpApprove from '@/app/api/sketchup/pair/approve/route'
import * as skpDevices from '@/app/api/sketchup/devices/route'
import * as skpCatalog from '@/app/api/sketchup/catalog/route'

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'arq@example.com' }

const post = (path: string, body: unknown) =>
  new NextRequest(`https://spacenode.app${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const get = (path: string) => new NextRequest(`https://spacenode.app${path}`)

const devices = () => state.db.rows('public.sketchup_devices')

beforeEach(() => {
  state.db = createMemorySupabase({ 'public.profiles': [{ id: USER.id, email: USER.email }] })
  state.calls = []
  state.rateKeys = []
  state.cookieUser = USER
  state.bearerUser = USER
  let n = 0
  state.mint.mockReset().mockResolvedValue({ accessToken: 'at-mint', refreshToken: 'rt-0', expiresAt: 1, email: USER.email })
  state.refresh.mockReset().mockImplementation(async () => {
    n += 1
    return { accessToken: `at-${n}`, refreshToken: `rt-${n}`, expiresAt: 2_000_000_000 + n }
  })
})

describe('/api/integrations/pair', () => {
  it('exige a plataforma e devolve a página de pareamento com ela', async () => {
    expect((await intStart.POST(post('/api/integrations/pair/start', { deviceName: 'Mac' }))).status).toBe(400)
    expect((await intStart.POST(post('/api/integrations/pair/start', { platform: 'rhino' }))).status).toBe(400)
    expect(devices()).toHaveLength(0)

    const res = await intStart.POST(post('/api/integrations/pair/start', { platform: 'archicad' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verificationUrl).toBe('https://spacenode.app/integrations/pair?app=archicad')
    expect(body.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(body.verificationUrl).not.toContain(body.userCode)
    expect(body.deviceSecret).toMatch(/^snd_/)

    const [row] = devices()
    expect(row).toMatchObject({ platform: 'archicad', device_name: 'Archicad', status: 'pending' })
    // Segredos nunca persistem crus.
    expect(JSON.stringify(row)).not.toContain(body.deviceSecret)
    expect(JSON.stringify(row)).not.toContain(body.userCode)
    expect(new Set(state.rateKeys)).toEqual(new Set(['int-pair-start:203.0.113.7']))
  })

  it('pareia de ponta a ponta e renova com rotação do refresh token', async () => {
    const start = await (await intStart.POST(post('/api/integrations/pair/start', { platform: 'archicad', deviceName: 'Archicad 29 · Mac' }))).json()
    const creds = { deviceId: start.deviceId, deviceSecret: start.deviceSecret }

    expect(await (await intClaim.POST(post('/api/integrations/pair/claim', creds))).json()).toEqual({ status: 'pending' })

    const approve = await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode.toLowerCase(), platform: 'archicad' }))
    expect(approve.status).toBe(200)
    expect(await approve.json()).toEqual({ ok: true, deviceName: 'Archicad 29 · Mac', platform: 'archicad' })
    expect(state.mint).toHaveBeenCalledWith(expect.anything(), expect.anything(), USER.email)

    const ready = await (await intClaim.POST(post('/api/integrations/pair/claim', creds))).json()
    expect(ready).toEqual({ status: 'ready', accessToken: 'at-1', expiresAt: 2_000_000_001, userEmail: USER.email })
    expect(state.refresh).toHaveBeenLastCalledWith('rt-0')
    expect(devices()[0]).toMatchObject({ status: 'active', code_hash: null, refresh_token: 'rt-1', user_id: USER.id })

    // O código já foi usado: não aprova de novo.
    expect((await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode }))).status).toBe(404)

    const refreshed = await (await intRefresh.POST(post('/api/integrations/pair/refresh', creds))).json()
    expect(refreshed).toEqual({ accessToken: 'at-2', expiresAt: 2_000_000_002 })
    expect(state.refresh).toHaveBeenLastCalledWith('rt-1')
    expect(devices()[0].refresh_token).toBe('rt-2')

    // Segredo errado não renova.
    expect((await intRefresh.POST(post('/api/integrations/pair/refresh', { ...creds, deviceSecret: 'snd_x' }))).status).toBe(401)
  })

  it('a página de uma plataforma não aprova código de outra', async () => {
    const start = await (await intStart.POST(post('/api/integrations/pair/start', { platform: 'revit' }))).json()

    const wrong = await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode, platform: 'archicad' }))
    expect(wrong.status).toBe(404)
    expect(state.mint).not.toHaveBeenCalled()
    expect(devices()[0].status).toBe('pending')

    const right = await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode, platform: 'revit' }))
    expect(await right.json()).toMatchObject({ ok: true, platform: 'revit' })
  })

  it('aprovar exige o navegador logado e avisa o código expirado com o nome do plugin', async () => {
    const start = await (await intStart.POST(post('/api/integrations/pair/start', { platform: 'archicad' }))).json()

    state.cookieUser = null
    expect((await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode }))).status).toBe(401)

    state.cookieUser = USER
    devices()[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const expired = await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode }))
    expect(expired.status).toBe(410)
    expect((await expired.json()).error).toBe('Código expirado. Gere um novo no Archicad.')
  })

  it('dispositivo revogado perde a renovação', async () => {
    const start = await (await intStart.POST(post('/api/integrations/pair/start', { platform: 'archicad' }))).json()
    const creds = { deviceId: start.deviceId, deviceSecret: start.deviceSecret }
    await intApprove.POST(post('/api/integrations/pair/approve', { code: start.userCode }))
    await intClaim.POST(post('/api/integrations/pair/claim', creds))

    const list = await (await intDevices.GET()).json()
    expect(list.devices).toEqual([expect.objectContaining({ id: start.deviceId, platform: 'archicad', status: 'active' })])

    const revoke = await intDevices.POST(post('/api/integrations/devices', { action: 'revoke', deviceId: start.deviceId }))
    expect(revoke.status).toBe(200)
    expect(devices()[0]).toMatchObject({ status: 'revoked', refresh_token: null })
    expect((await intRefresh.POST(post('/api/integrations/pair/refresh', creds))).status).toBe(401)
  })
})

describe('/api/sketchup/pair (plugin em campo)', () => {
  it('mantém o contrato e nunca toca a coluna platform', async () => {
    const start = await (await skpStart.POST(post('/api/sketchup/pair/start', {}))).json()
    expect(start.verificationUrl).toBe('https://spacenode.app/sketchup/pair')
    expect(devices()[0]).toMatchObject({ device_name: 'SketchUp', status: 'pending' })

    const creds = { deviceId: start.deviceId, deviceSecret: start.deviceSecret }
    expect(await (await skpApprove.POST(post('/api/sketchup/pair/approve', { code: start.userCode }))).json())
      .toEqual({ ok: true, deviceName: 'SketchUp' })
    expect(await (await skpClaim.POST(post('/api/sketchup/pair/claim', creds))).json())
      .toMatchObject({ status: 'ready', accessToken: 'at-1' })
    await skpDevices.GET()

    const touched = state.calls.filter(c => c.table === 'sketchup_devices')
    expect(touched.length).toBeGreaterThan(3)
    for (const c of touched) {
      if (typeof c.arg === 'string') expect(c.arg).not.toContain('platform')
      else expect(Object.keys(c.arg as object)).not.toContain('platform')
    }
    expect(state.rateKeys.every(k => k.startsWith('skp-'))).toBe(true)
  })
})

describe('catálogo dos plugins', () => {
  it('pluginLatest só para o SketchUp; o resto é o mesmo catálogo', async () => {
    const skp = await (await skpCatalog.GET(get('/api/sketchup/catalog'))).json()
    const arc = await (await intCatalog.GET(get('/api/integrations/catalog?platform=archicad'))).json()
    const none = await (await intCatalog.GET(get('/api/integrations/catalog'))).json()

    expect(skp.pluginLatest?.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(arc.pluginLatest).toBeUndefined()
    expect(none.pluginLatest).toBeUndefined()

    expect(arc).toEqual({ ...skp, pluginLatest: undefined })
    expect(arc.engines.length).toBeGreaterThan(0)
    expect(arc.projectTypes.map((t: { id: string }) => t.id)).toEqual(['interior', 'exterior'])
  })

  it('exige sessão', async () => {
    state.bearerUser = null
    expect((await intCatalog.GET(get('/api/integrations/catalog'))).status).toBe(401)
  })
})
