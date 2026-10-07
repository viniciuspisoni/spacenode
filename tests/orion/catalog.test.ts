// Catálogo do plugin SketchUp × Orion.
//
// O painel do plugin monta os cards de motor a partir do que /api/sketchup/
// catalog devolve — não existe lista de motores em Ruby. Então ESTE é o ponto
// onde o Orion aparece (ou não) dentro do SketchUp, e a regra tem que ser a
// mesma da página: flag ligada E credencial do fornecedor.
//
// Sem chamada real: auth e provider são stubs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ENGINE_ORDER } from '@/lib/engines'
import { ORION_NODES } from '@/lib/orion/config'

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(async () => ({
    user: { id: 'u-1', email: 'cliente@escritorio.com.br' },
    source: 'bearer',
  })),
}))

const { getRequestUser } = await import('@/lib/auth/request-user')
const { GET } = await import('@/app/api/sketchup/catalog/route')

const req = () => new NextRequest('https://spacenode.app.br/api/sketchup/catalog')

async function catalog() {
  const res = await GET(req())
  return await res.json()
}

async function engines() {
  const body = await catalog()
  return body.engines as { id: string; name: string; tagline: string; resolutions: { id: string; nodes: number }[] }[]
}

beforeEach(() => {
  // orionProviderReady() na rota openai: basta a chave existir.
  process.env.OPENAI_API_KEY = 'sk-test-não-usada'
})

afterEach(() => {
  delete process.env.ORION_INTERNAL_ENABLED
  delete process.env.OPENAI_API_KEY
  delete process.env.ORION_IMAGE_PROVIDER
  vi.mocked(getRequestUser).mockResolvedValue({
    user: { id: 'u-1', email: 'cliente@escritorio.com.br' },
    source: 'bearer',
  } as Awaited<ReturnType<typeof getRequestUser>>)
})

describe('/api/sketchup/catalog · motores', () => {
  it('sem a flag, o plugin não vê Orion — só o catálogo público', async () => {
    const list = await engines()
    expect(list.map(e => e.id)).toEqual([...ENGINE_ORDER])
  })

  it('com a flag ligada, Orion entra POR ÚLTIMO, com 2K e 4K e o preço real', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    const list = await engines()
    expect(list.map(e => e.id)).toEqual([...ENGINE_ORDER, 'orion'])

    const orion = list.at(-1)!
    expect(orion.name).toBe('Orion')
    // Preço vem do catálogo do Orion, não de lib/engines — se um dia divergir,
    // o painel do plugin cobraria diferente da tela do web app.
    expect(orion.resolutions.map(r => [r.id, r.nodes])).toEqual([
      ['2k', ORION_NODES['2k']],
      ['4k', ORION_NODES['4k']],
    ])
    // Zero jargão técnico: nada de modelo/fornecedor/endpoint no payload.
    // \bfal\b: o catálogo v10 leva `supports: { seed: false }` e "false" contém "fal".
    expect(JSON.stringify(orion)).not.toMatch(/\bopenai\b|gpt-image|\bfal\b|flare|sunburst/i)
  })

  it('o cartão do Orion não carrega selo — nem em pt, nem na tradução EN', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    const body = await catalog()
    const orion = (body.engines as { id: string; tagline: string }[]).at(-1)!
    expect(orion.id).toBe('orion')
    // O painel monta o cartão com `catUi('engineTaglines')[id] || tagline`:
    // com os dois vazios ele não desenha a segunda linha.
    expect(orion.tagline).toBe('')
    expect(body.i18n.en.ui.engineTaglines.orion).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/experimental/i)
  })

  it('flag ligada sem credencial do fornecedor NÃO oferece o motor', async () => {
    process.env.ORION_INTERNAL_ENABLED = '1'
    delete process.env.OPENAI_API_KEY
    const list = await engines()
    expect(list.map(e => e.id)).toEqual([...ENGINE_ORDER])
  })

  it('sem sessão, 401 — nem catálogo público sai', async () => {
    vi.mocked(getRequestUser).mockResolvedValueOnce({ user: null, source: 'none' } as Awaited<ReturnType<typeof getRequestUser>>)
    process.env.ORION_INTERNAL_ENABLED = '1'
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})

// ── v10 (plugin 1.9.0): a semente só vale em Vega/Pulsar ──────────────────
describe('/api/sketchup/catalog · v10 supports.seed', () => {
  it('cada motor diz se a semente chega ao fornecedor; versão 10; pluginLatest bate com PLUGIN_VERSION', async () => {
    const { PLUGIN_VERSION } = await import('@/lib/sketchup/plugin-release')
    process.env.ORION_INTERNAL_ENABLED = '1'
    const body = await catalog()
    const byId = Object.fromEntries(body.engines.map((e: { id: string; supports?: { seed?: boolean } }) => [e.id, e.supports?.seed]))
    expect(byId.vega).toBe(true)
    expect(byId.pulsar).toBe(true)
    expect(byId.quasar).toBe(false)
    expect(byId.orion).toBe(false)
    expect(body.version).toBe(10)
    expect(body.pluginLatest.version).toBe(PLUGIN_VERSION)
  })
})
