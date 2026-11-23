// Coluna `platform` em sketchup_devices (Archicad/Revit pareando pelo mesmo
// fluxo do SketchUp). Roda as migrations reais num Postgres em WASM (PGlite).
//
// Protege: linhas antigas e inserts das rotas /api/sketchup/* (que não mandam
// a coluna) viram 'sketchup'; plataforma desconhecida é recusada; reaplicar a
// migration não quebra.

import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, createSupabaseLikeDb } from '../helpers/pglite-supabase'

const BASE = 'supabase/migrations/20260901180000_sketchup_devices.sql'
const FIX = 'supabase/migrations/20261122120000_integration_devices_platform.sql'

const insert = (db: PGlite, platform?: string) =>
  db.query<{ platform: string }>(
    platform === undefined
      ? `insert into public.sketchup_devices (secret_hash, expires_at) values ('h', now()) returning platform`
      : `insert into public.sketchup_devices (secret_hash, expires_at, platform) values ('h', now(), $1) returning platform`,
    platform === undefined ? [] : [platform],
  )

describe('migration integration_devices_platform', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await createSupabaseLikeDb([BASE])
    // pareamento SketchUp existente antes da migration
    await db.query(`insert into public.sketchup_devices (secret_hash, expires_at) values ('h', now())`)
    await applyMigration(db, FIX)
  })

  it('linhas existentes e inserts sem a coluna ficam como sketchup', async () => {
    const { rows } = await db.query<{ platform: string }>('select platform from public.sketchup_devices')
    expect(rows).toEqual([{ platform: 'sketchup' }])
    expect((await insert(db)).rows[0].platform).toBe('sketchup')
  })

  it('aceita archicad e revit e recusa o resto', async () => {
    expect((await insert(db, 'archicad')).rows[0].platform).toBe('archicad')
    expect((await insert(db, 'revit')).rows[0].platform).toBe('revit')
    await expect(insert(db, 'rhino')).rejects.toThrow(/sketchup_devices_platform_check/)
  })

  it('pode ser reaplicada', async () => {
    await expect(applyMigration(db, FIX)).resolves.toBeUndefined()
  })
})
