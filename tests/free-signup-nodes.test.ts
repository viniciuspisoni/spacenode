// 80 nodes no cadastro — o que estes testes protegem:
//
//   • concessão única: o trigger de cadastro cria UM profile com o default
//     (80); a mesma conta não ganha um segundo crédito por nenhum caminho
//     (auth.users repetido, fallback do /app/generate);
//   • saldo correto: a migration que volta para 80 não mexe em saldo nenhum —
//     quem entrou com 40 continua com 40 até uma decisão manual;
//   • sem crédito duplicado: a assinatura soma os nodes do plano por cima do
//     cadastro uma única vez, mesmo com o Stripe reentregando o evento;
//   • uma oferta só: banco, supabase-schema.sql, landing e app dizem 80.
//
// A parte de banco roda as migrations REAIS num Postgres em WASM (PGlite) —
// tests/helpers/pglite-supabase.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { FREE_SIGNUP_NODES } from '@/lib/plans'
import { ensureProfileRow } from '@/lib/profiles/ensure-profile'
import {
  CREDIT_PATH_MIGRATIONS,
  applyMigration,
  createSupabaseLikeDb,
  readRepoFile,
} from './helpers/pglite-supabase'

const RESTORE_MIGRATION = 'supabase/migrations/20261001222051_free_signup_nodes_80_restore.sql'
const OFFER_40 = `(40 nodes grátis|com 40 nodes)`

describe('uma oferta só: banco, schema e copy', () => {
  it('a última migration que define o default de profiles.credits concede FREE_SIGNUP_NODES', () => {
    const files = readdirSync(join(__dirname, '..', 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort()
    const defaults = files.flatMap(f => {
      const m = readRepoFile(`supabase/migrations/${f}`).match(/ALTER COLUMN credits SET DEFAULT (\d+)/i)
      return m ? [{ file: f, value: Number(m[1]) }] : []
    })
    expect(defaults.at(-1)).toEqual({ file: RESTORE_MIGRATION.split('/').pop(), value: FREE_SIGNUP_NODES })
    expect(FREE_SIGNUP_NODES).toBe(80)
  })

  it('supabase-schema.sql nasce com o mesmo default', () => {
    const m = readRepoFile('supabase-schema.sql').match(/credits\s+integer\s+not null default (\d+)/i)
    expect(Number(m?.[1])).toBe(FREE_SIGNUP_NODES)
  })

  it('landing e app só anunciam o número do cadastro vigente', () => {
    // Frases de OFERTA de cadastro — custo de geração ("com 0 nodes" de saldo,
    // "até 40 nodes em 4K") fica de fora de propósito.
    const patterns = [
      /(\d+)\s+nodes?\s+grátis/gi,
      /grátis\s+(?:—\s+|com\s+)(\d+)\s+nodes/gi,
      /cadastro\s+(?:dá|oferece)\s+(\d+)\s+nodes/gi,
      /conta gratuita de (\d+) nodes/gi,
      /\bos (\d+) nodes de cadastro/gi,
    ]
    const found: Array<{ where: string; value: number }> = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(__dirname, '..', dir))) {
        const rel = `${dir}/${name}`
        if (statSync(join(__dirname, '..', rel)).isDirectory()) walk(rel)
        else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(join(__dirname, '..', rel), 'utf8')
          for (const re of patterns) {
            for (const m of src.matchAll(re)) found.push({ where: rel, value: Number(m[1]) })
          }
        }
      }
    }
    ;['app', 'components', 'lib'].forEach(walk)
    expect(found.length).toBeGreaterThan(20)
    expect(found.filter(f => f.value !== FREE_SIGNUP_NODES)).toEqual([])
  })
})

describe('fallback do /app/generate (ensureProfileRow)', () => {
  it('cria sem informar saldo e nunca sobrescreve profile existente', async () => {
    const calls: Array<{ table: string; row: Record<string, unknown>; options: unknown }> = []
    const admin = {
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          calls.push({ table, row, options })
          return { error: null }
        },
      }),
    }
    await ensureProfileRow(admin as never, { id: 'u1', email: 'a@b.c', user_metadata: { full_name: 'Ana' } } as never)
    expect(calls).toEqual([{
      table: 'profiles',
      row: { id: 'u1', email: 'a@b.c', full_name: 'Ana' },
      options: { onConflict: 'id', ignoreDuplicates: true },
    }])
    expect(calls[0].row).not.toHaveProperty('credits')
  })
})

describe('banco: 80 nodes no cadastro (migrations reais em PGlite)', () => {
  let db: PGlite
  let joined40: string    // entrou enquanto o default era 40 (produção desde 01/10 12:09)
  let joined40Spent: string
  let offer40Before = 0

  const signUp = async (email: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email])
    return r.rows[0].id
  }
  const credits = async (id: string): Promise<number> =>
    (await db.query<{ credits: number }>(`select credits from public.profiles where id = $1`, [id])).rows[0].credits
  const offerCount = async (pattern: string): Promise<number> => {
    const r = await db.query<{ n: number }>(`
      select (select count(*) from marketing.landing_pages
               where concat_ws(' ', headline, subheadline, cta_label, meta_title, meta_description, sections::text) ~* $1)
           + (select count(*) from marketing.ads
               where concat_ws(' ', primary_text, headline, description) ~* $1) as n`, [pattern])
    return Number(r.rows[0].n)
  }
  const grantPlan = async (id: string, key: string) => {
    const r = await db.query<{ r: unknown }>(
      `select public.grant_plan_nodes($1, 800, 'essence', 'grant_plan', $2, 'stripe') as r`, [id, key])
    const v = r.rows[0].r
    return (typeof v === 'string' ? JSON.parse(v) : v) as { applied: boolean; balance: number }
  }

  beforeAll(async () => {
    db = await createSupabaseLikeDb(CREDIT_PATH_MIGRATIONS)
    joined40 = await signUp('quarenta@teste.invalid')
    joined40Spent = await signUp('gastou@teste.invalid')
    await db.query(`update public.profiles set credits = 15 where id = $1`, [joined40Spent])
    // Texto de custo que menciona 40 nodes: a volta não pode reescrevê-lo.
    await db.query(`update marketing.landing_pages set subheadline = subheadline || ' Render 4K custa 40 nodes.'
                    where id = (select id from marketing.landing_pages order by created_at limit 1)`)
    offer40Before = await offerCount(OFFER_40)
    await applyMigration(db, RESTORE_MIGRATION)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('antes da volta o banco concedia 40 (estado atual de produção)', () => {
    return expect(credits(joined40)).resolves.toBe(40)
  })

  it('conta nova recebe exatamente 80, numa única linha, sem passar pelo livro-razão', async () => {
    const id = await signUp('nova@teste.invalid')
    expect(await credits(id)).toBe(FREE_SIGNUP_NODES)
    const rows = await db.query<{ n: number }>(`select count(*) as n from public.profiles where id = $1`, [id])
    expect(Number(rows.rows[0].n)).toBe(1)
    const ledger = await db.query<{ n: number }>(`select count(*) as n from public.node_ledger where user_id = $1`, [id])
    expect(Number(ledger.rows[0].n)).toBe(0)
  })

  it('a mesma conta não ganha segundo crédito de cadastro', async () => {
    const id = await signUp('unica@teste.invalid')
    await expect(db.query(`insert into auth.users (id, email) values ($1, 'outra@teste.invalid')`, [id])).rejects.toThrow()
    await db.query(`update public.profiles set credits = 12 where id = $1`, [id])
    // O que o ensureProfileRow gera no PostgREST: INSERT … ON CONFLICT DO NOTHING.
    await db.query(`insert into public.profiles (id, email, full_name) values ($1, 'unica@teste.invalid', null)
                    on conflict (id) do nothing`, [id])
    expect(await credits(id)).toBe(12)
  })

  it('a volta para 80 não mexe em saldo existente — sem complemento automático', async () => {
    expect(await credits(joined40)).toBe(40)
    expect(await credits(joined40Spent)).toBe(15)
  })

  it('reaplicar a migration não altera saldo nenhum', async () => {
    const snapshot = async () => (await db.query(`select id, credits from public.profiles order by id`)).rows
    const before = await snapshot()
    await applyMigration(db, RESTORE_MIGRATION)
    expect(await snapshot()).toEqual(before)
  })

  it('assinatura soma o plano por cima do cadastro uma vez só, mesmo com reentrega', async () => {
    const id = await signUp('assina@teste.invalid')
    expect((await grantPlan(id, 'sub_teste_1')).applied).toBe(true)
    expect(await credits(id)).toBe(FREE_SIGNUP_NODES + 800)
    expect((await grantPlan(id, 'sub_teste_1')).applied).toBe(false)
    expect(await credits(id)).toBe(FREE_SIGNUP_NODES + 800)
    const plan = await db.query<{ plan: string }>(`select plan from public.profiles where id = $1`, [id])
    expect(plan.rows[0].plan).toBe('essence')
  })

  it('complemento manual proposto (+40 por conta, chave única) credita uma vez só e não mexe no plano', async () => {
    // NÃO roda em migration: é a regra sugerida no PR para quem entrou com 40.
    const id = await signUp('complemento@teste.invalid')
    await db.query(`update public.profiles set credits = 40 where id = $1`, [id]) // entrou com 40
    const topUp = () => db.query(
      `select public.grant_plan_nodes($1::uuid, 40, null, 'adjustment', $2, 'manual')`, [id, `signup-topup-80:${id}`])
    await topUp()
    await topUp()
    expect(await credits(id)).toBe(80)
    const ledger = await db.query<{ n: number }>(
      `select count(*) as n from public.node_ledger where user_id = $1 and kind = 'adjustment'`, [id])
    expect(Number(ledger.rows[0].n)).toBe(1)
    const plan = await db.query<{ plan: string }>(`select plan from public.profiles where id = $1`, [id])
    expect(plan.rows[0].plan).toBe('free')
  })

  it('conteúdo do painel volta a anunciar 80 e preserva custo que fala em 40', async () => {
    expect(offer40Before).toBeGreaterThan(0)
    expect(await offerCount(OFFER_40)).toBe(0)
    expect(await offerCount('80 nodes grátis')).toBeGreaterThan(0)
    expect(await offerCount('Render 4K custa 40 nodes')).toBe(1)
  })
})
