// fuzzystrmatch fora do schema public (auditoria 2026-11-18, advisor 0014).
//
// O que estes testes protegem:
//   • antes: levenshtein, soundex… moravam em `public` — o PostgREST expõe
//     tudo de `public` como /rest/v1/rpc/…, e `anon` podia executar;
//   • depois: nenhuma função da extensão fica em `public`; elas continuam
//     funcionando em `extensions`, inclusive sem prefixo para quem tem
//     `extensions` no search_path (o papel `postgres` no console).
//
// Roda a extensão de verdade num Postgres em WASM (PGlite).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch'
import { readRepoFile } from './helpers/pglite-supabase'

const FIX = readRepoFile('supabase/migrations/20261120140000_fuzzystrmatch_to_extensions.sql')

const EXT_FUNCS = ['daitch_mokotoff', 'difference', 'dmetaphone', 'dmetaphone_alt', 'levenshtein',
  'levenshtein_less_equal', 'metaphone', 'soundex', 'text_soundex']

let db: PGlite

async function schemaOfExtension(): Promise<string | null> {
  const { rows } = await db.query<{ s: string }>(
    `select extnamespace::regnamespace::text as s from pg_extension where extname = 'fuzzystrmatch'`,
  )
  return rows[0]?.s ?? null
}

async function functionsIn(schema: string): Promise<string[]> {
  const { rows } = await db.query<{ proname: string }>(
    `select distinct proname from pg_proc where pronamespace = $1::regnamespace and proname = any($2) order by proname`,
    [schema, EXT_FUNCS],
  )
  return rows.map(r => r.proname)
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role`)
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { fuzzystrmatch } })
  // Estado de produção: papéis do Supabase, schema `extensions` com USAGE para
  // os papéis da API e a extensão instalada em `public`.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema extensions;
    grant usage on schema public, extensions to anon, authenticated;
    create extension fuzzystrmatch schema public;
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('antes da correção', () => {
  it('as funções ficam em public e anon executa', async () => {
    expect(await schemaOfExtension()).toBe('public')
    expect(await functionsIn('public')).toEqual(EXT_FUNCS)
    const { rows } = await asAnon(() => db.query<{ d: number }>(`select public.levenshtein('kitten', 'sitting') as d`))
    expect(rows[0].d).toBe(3)
  })
})

describe('depois da correção', () => {
  beforeAll(async () => {
    await db.exec(FIX)
  })

  it('a extensão mora em extensions e nada dela sobra em public', async () => {
    expect(await schemaOfExtension()).toBe('extensions')
    expect(await functionsIn('public')).toEqual([])
    expect(await functionsIn('extensions')).toEqual(EXT_FUNCS)
  })

  it('public.levenshtein não existe mais', async () => {
    await expect(db.query(`select public.levenshtein('a', 'b')`)).rejects.toThrow(/does not exist/i)
  })

  it('as funções seguem funcionando em extensions', async () => {
    const { rows } = await db.query<{ d: number; s: string }>(
      `select extensions.levenshtein('kitten', 'sitting') as d, extensions.soundex('Robert') as s`,
    )
    expect(rows[0]).toEqual({ d: 3, s: 'R163' })
  })

  it('consulta sem prefixo funciona com extensions no search_path (console)', async () => {
    await db.exec(`set search_path = "$user", public, extensions`)
    try {
      const { rows } = await db.query<{ d: number }>(`select levenshtein('kitten', 'sitting') as d`)
      expect(rows[0].d).toBe(3)
    } finally {
      await db.exec(`reset search_path`)
    }
  })

  it('reaplicar a migration não faz nada (idempotente)', async () => {
    await expect(db.exec(FIX)).resolves.toBeDefined()
    expect(await schemaOfExtension()).toBe('extensions')
  })
})

describe('banco sem a extensão', () => {
  it('a migration não faz nada e não falha', async () => {
    const fresh = new PGlite()
    try {
      await fresh.exec(FIX)
      const { rows } = await fresh.query(`select 1 from pg_extension where extname = 'fuzzystrmatch'`)
      expect(rows).toEqual([])
    } finally {
      await fresh.close()
    }
  })
})
