// Escopo de leitura do Histórico (2026-09-11).
//
// Esta é a peça que decide QUEM enxerga a produção de QUEM — e ela troca a RLS
// por uma checagem em TypeScript (em escopo de escritório a leitura vai de
// service-role). Ou seja: se resolveHistoryScope errar, não existe segunda
// barreira no banco pra segurar. Daí a bateria abaixo estar escrita pelo lado
// de quem NÃO pode ver.

import { describe, expect, it, vi } from 'vitest'
import {
  applyHistoryScope,
  historyReadClient,
  requestedScope,
  resolveHistoryScope,
  runScopedQuery,
  scopeAuthorIds,
  type HistoryScope,
} from '@/lib/history/scope'

const OWNER  = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const WS     = '33333333-3333-4333-8333-333333333333'

/** Client mínimo no formato que getActiveWorkspace consome: uma membership
 *  ativa (ou nenhuma). */
function clientWith(membership: { role: string; type: string } | null) {
  const result = membership
    ? { data: { role: membership.role, workspace: { id: WS, name: 'Escritório', type: membership.type, owner_id: OWNER } }, error: null }
    : { data: null, error: null }

  const builder = {
    select:      () => builder,
    eq:          () => builder,
    limit:       () => builder,
    maybeSingle: () => Promise.resolve(result),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any
}

describe('requestedScope — pedir escritório é explícito', () => {
  it('sem parâmetro é pessoal — o padrão de toda rota', () => {
    expect(requestedScope(new URLSearchParams(''))).toBe('own')
  })

  it('?scope=office pede o escritório', () => {
    expect(requestedScope(new URLSearchParams('scope=office'))).toBe('office')
  })

  it('qualquer outro valor não vira escritório por acidente', () => {
    expect(requestedScope(new URLSearchParams('scope=all'))).toBe('own')
    expect(requestedScope(new URLSearchParams('scope=OFFICE'))).toBe('own')
    expect(requestedScope(new URLSearchParams('scope='))).toBe('own')
  })
})

describe('resolveHistoryScope — quem ganha o histórico do escritório', () => {
  it('dono de escritório vê a produção da equipe', async () => {
    const scope = await resolveHistoryScope(clientWith({ role: 'owner', type: 'office' }), OWNER, 'office')
    expect(scope).toEqual({ kind: 'workspace', userId: OWNER, workspaceId: WS })
  })

  it('admin também — é o mesmo critério da tela Equipe', async () => {
    const scope = await resolveHistoryScope(clientWith({ role: 'admin', type: 'office' }), OWNER, 'office')
    expect(scope.kind).toBe('workspace')
  })

  it('MEMBRO comum continua vendo só o dele, mesmo pedindo escritório', async () => {
    const scope = await resolveHistoryScope(clientWith({ role: 'member', type: 'office' }), MEMBER, 'office')
    expect(scope).toEqual({ kind: 'own', userId: MEMBER })
  })

  it('dono de workspace individual segue no caminho antigo (RLS, sem service-role)', async () => {
    const scope = await resolveHistoryScope(clientWith({ role: 'owner', type: 'individual' }), OWNER, 'office')
    expect(scope).toEqual({ kind: 'own', userId: OWNER })
  })

  it('sem membership ativa, cai no pessoal em vez de vazar', async () => {
    const scope = await resolveHistoryScope(clientWith(null), OWNER, 'office')
    expect(scope).toEqual({ kind: 'own', userId: OWNER })
  })

  it('user_id que não é uuid nunca chega a virar filtro', async () => {
    const sb = clientWith({ role: 'owner', type: 'office' })
    const scope = await resolveHistoryScope(sb, "' or true --", 'office')
    expect(scope.kind).toBe('own')
  })

  it('quem NÃO pede escritório continua pessoal, mesmo sendo dono', async () => {
    // É o caso do plugin SketchUp e dos modais de importação, que chamam as
    // mesmas rotas de listagem sem ?scope=office.
    const sb = clientWith({ role: 'owner', type: 'office' })
    expect(await resolveHistoryScope(sb, OWNER)).toEqual({ kind: 'own', userId: OWNER })
    expect(await resolveHistoryScope(sb, OWNER, 'own')).toEqual({ kind: 'own', userId: OWNER })
  })
})

describe('applyHistoryScope — o filtro que substitui a RLS', () => {
  function spyQuery() {
    const calls: { eq: [string, string][]; or: string[] } = { eq: [], or: [] }
    const q = {
      eq: (c: string, v: string) => { calls.eq.push([c, v]); return q },
      or: (f: string)            => { calls.or.push(f);      return q },
    }
    return { q, calls }
  }

  it('pessoal: filtra por user_id, como sempre foi', () => {
    const { q, calls } = spyQuery()
    applyHistoryScope(q, { kind: 'own', userId: MEMBER })
    expect(calls.eq).toEqual([['user_id', MEMBER]])
    expect(calls.or).toEqual([])
  })

  it('escritório: workspace OU as próprias — nunca só workspace_id', () => {
    const { q, calls } = spyQuery()
    applyHistoryScope(q, { kind: 'workspace', userId: OWNER, workspaceId: WS })
    expect(calls.or).toEqual([`workspace_id.eq.${WS},user_id.eq.${OWNER}`])
    // O OR é o que impede a regressão: geração antiga sem carimbo de workspace
    // (workspace_id nulo) continuaria no histórico do próprio dono.
    expect(calls.or[0]).toContain(`user_id.eq.${OWNER}`)
  })

  it('o filtro de escritório não alcança outro workspace', () => {
    const { q, calls } = spyQuery()
    applyHistoryScope(q, { kind: 'workspace', userId: OWNER, workspaceId: WS })
    expect(calls.or[0]).toBe(`workspace_id.eq.${WS},user_id.eq.${OWNER}`)
  })
})

describe('historyReadClient — escopo e client andam juntos', () => {
  const session = { tag: 'sessao' }
  const admin   = { tag: 'service-role' }

  it('pessoal lê com a sessão do usuário (RLS ligada)', () => {
    expect(historyReadClient({ kind: 'own', userId: OWNER }, session, admin)).toBe(session)
  })

  it('escritório lê com service-role — a RLS por user_id barraria o colega', () => {
    expect(historyReadClient({ kind: 'workspace', userId: OWNER, workspaceId: WS }, session, admin)).toBe(admin)
  })
})

describe('runScopedQuery — tabela ainda sem workspace_id', () => {
  const wsScope: HistoryScope = { kind: 'workspace', userId: OWNER, workspaceId: WS }

  it('42703 degrada pro pessoal em vez de derrubar a aba', async () => {
    const run = vi.fn(async (s: HistoryScope) =>
      s.kind === 'workspace'
        ? { data: null, error: { code: '42703' } }
        : { data: [{ id: 'r1' }], error: null })

    const res = await runScopedQuery(wsScope, run)
    expect(res.data).toEqual([{ id: 'r1' }])
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1][0]).toEqual({ kind: 'own', userId: OWNER })
  })

  it('outros erros sobem — não viram fallback silencioso', async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: '42501' } }))
    const res = await runScopedQuery(wsScope, run)
    expect(res.error?.code).toBe('42501')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('sucesso não tenta duas vezes', async () => {
    const run = vi.fn(async () => ({ data: [{ id: 'r1' }], error: null }))
    await runScopedQuery(wsScope, run)
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('scopeAuthorIds — o chip de autor sobrevive ao "carregar mais"', () => {
  it('pessoal: só a própria pessoa', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = await scopeAuthorIds({} as any, { kind: 'own', userId: MEMBER })
    expect(ids).toEqual([MEMBER])
  })

  it('escritório: todos os membros ativos, não só os da primeira página', async () => {
    const builder = {
      select: () => builder,
      eq:     () => builder,
      then:   (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ user_id: MEMBER }, { user_id: OWNER }] }).then(r),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = await scopeAuthorIds({ from: () => builder } as any, { kind: 'workspace', userId: OWNER, workspaceId: WS })
    expect(new Set(ids)).toEqual(new Set([OWNER, MEMBER]))
    // Sem duplicar quem já entrou pelo próprio escopo.
    expect(ids.length).toBe(2)
  })
})
