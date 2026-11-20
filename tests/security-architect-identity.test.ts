// Logo do escritório sem SVG (auditoria 2026-11-18, recomendação 3).
//
// O que estes testes protegem:
//   • o bucket público `architect-identity` deixa de aceitar SVG (script roda
//     se o arquivo for aberto direto na URL do Storage);
//   • conta logada não grava mais no bucket direto pela API do Storage — só a
//     rota, que confere o tipo pelos bytes;
//   • a rota recusa SVG/HTML mesmo renomeado para .png e grava com o tipo real.
//
// A parte SQL roda a seção de buckets REAL de 20260509000000_spaces_block_1.sql
// (estado de produção) e a migration nova num Postgres em WASM (PGlite).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { PGlite } from '@electric-sql/pglite'
import { applyMigration, createSupabaseLikeDb, readRepoFile } from './helpers/pglite-supabase'
import { LOGO_MIME_TYPES, detectLogoType } from '@/lib/spaces/logo-upload'

const FIX = 'supabase/migrations/20261120120000_architect_identity_no_svg.sql'
const USER = '11111111-1111-4111-8111-111111111111'

const PNG_BYTES  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const WEBP_BYTES = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0x24, 0, 0, 0], [...'WEBPVP8 '].map(c => c.charCodeAt(0))))
const SVG_TEXT   = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>'
const bytes = (s: string) => new TextEncoder().encode(s)

// ── Detecção pelo conteúdo ───────────────────────────────────────────────────

describe('detectLogoType', () => {
  it('reconhece PNG, JPG e WebP pelos bytes iniciais', () => {
    expect(detectLogoType(PNG_BYTES)).toBe('image/png')
    expect(detectLogoType(JPEG_BYTES)).toBe('image/jpeg')
    expect(detectLogoType(WEBP_BYTES)).toBe('image/webp')
  })

  it('recusa SVG, HTML, GIF, outro RIFF e arquivo vazio', () => {
    expect(detectLogoType(bytes(SVG_TEXT))).toBeNull()
    expect(detectLogoType(bytes(`<?xml version="1.0"?>${SVG_TEXT}`))).toBeNull()
    expect(detectLogoType(bytes('<html><script>alert(1)</script></html>'))).toBeNull()
    expect(detectLogoType(bytes('GIF89a....'))).toBeNull()
    expect(detectLogoType(bytes('RIFF\x24\x00\x00\x00WAVEfmt '))).toBeNull()
    expect(detectLogoType(new Uint8Array())).toBeNull()
    expect(detectLogoType(PNG_BYTES.slice(0, 4))).toBeNull()
  })

  it('a lista do editor não tem SVG', () => {
    expect(LOGO_MIME_TYPES).not.toContain('image/svg+xml')
    expect(readRepoFile('components/spaces/IdentityEditor.tsx')).not.toMatch(/svg\+xml/i)
  })
})

// ── Bucket e policies (SQL real) ─────────────────────────────────────────────

/** Seção "11. Storage buckets" de 20260509000000_spaces_block_1.sql — cria os
 *  buckets e as policies como estão em produção. */
function bucketSection(): string {
  const file = readRepoFile('supabase/migrations/20260509000000_spaces_block_1.sql')
  const start = file.indexOf('-- ── 11. Storage buckets')
  if (start === -1) throw new Error('seção 11 não encontrada em 20260509000000_spaces_block_1.sql')
  return file.slice(start)
}

describe('bucket architect-identity', () => {
  let db: PGlite

  async function asUser<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER}', false);`)
    try {
      return await fn()
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
    }
  }

  async function errorOf(sql: string): Promise<string | null> {
    try {
      await db.exec(sql)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }

  async function mimes(): Promise<string[]> {
    const { rows } = await db.query<{ m: string[] }>(`select allowed_mime_types as m from storage.buckets where id = 'architect-identity'`)
    return rows[0].m
  }

  const insertObject = (bucket: string, name: string) =>
    `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`

  beforeAll(async () => {
    db = await createSupabaseLikeDb([])
    await db.exec(bucketSection())
    // Privilégios de tabela que o Supabase dá ao `authenticated` no Storage.
    await db.exec(`
      grant usage on schema auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
    `)
    await db.exec(insertObject('architect-identity', `${USER}/logo-1.png`))
  })

  afterAll(async () => {
    await db?.close()
  })

  it('antes: aceita SVG e a conta grava direto na própria pasta', async () => {
    expect(await mimes()).toContain('image/svg+xml')
    const err = await asUser(() => errorOf(insertObject('architect-identity', `${USER}/logo-xss.svg`)))
    expect(err).toBeNull()
    await db.exec(`delete from storage.objects where name = '${USER}/logo-xss.svg'`)
  })

  describe('depois da correção', () => {
    beforeAll(async () => {
      await applyMigration(db, FIX)
    })

    it('o bucket só aceita PNG, JPG e WebP', async () => {
      expect((await mimes()).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    })

    it('a conta não sobe arquivo direto pela API do Storage', async () => {
      const err = await asUser(() => errorOf(insertObject('architect-identity', `${USER}/logo-xss.svg`)))
      expect(err).toMatch(/row-level security/i)
    })

    it('nem troca ou apaga o logo existente por fora da rota', async () => {
      const updated = await asUser(() => db.query(
        `update storage.objects set name = '${USER}/logo-xss.svg' where bucket_id = 'architect-identity' returning id`,
      ))
      const deleted = await asUser(() => db.query(
        `delete from storage.objects where bucket_id = 'architect-identity' returning id`,
      ))
      expect(updated.rows).toEqual([])
      expect(deleted.rows).toEqual([])
      const { rows } = await db.query<{ name: string }>(`select name from storage.objects where bucket_id = 'architect-identity'`)
      expect(rows.map(r => r.name)).toEqual([`${USER}/logo-1.png`])
    })

    it('space-mestres não muda', async () => {
      const err = await asUser(() => errorOf(insertObject('space-mestres', `${USER}/mestre.png`)))
      expect(err).toBeNull()
    })

    it('reaplicar a migration não falha (idempotente)', async () => {
      await expect(applyMigration(db, FIX)).resolves.toBeUndefined()
      expect((await mimes()).sort()).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    })
  })
})

// ── Rota PUT /api/users/me/identity ──────────────────────────────────────────

const upload = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (key: string) => ({
          data: { publicUrl: `https://exemplo.supabase.co/storage/v1/object/public/architect-identity/${key}` },
        }),
      }),
    },
    from: () => ({
      upsert: (row: Record<string, unknown>) => ({
        select: () => ({ single: async () => ({ data: row, error: null }) }),
      }),
    }),
  }),
}))

describe('PUT /api/users/me/identity', () => {
  beforeEach(() => {
    upload.mockReset()
    upload.mockResolvedValue({ error: null })
  })

  async function putLogo(content: Uint8Array, name: string, type: string) {
    const fd = new FormData()
    fd.append('name', 'Escritório')
    fd.append('logo', new File([Buffer.from(content)], name, { type }))
    const { PUT } = await import('@/app/api/users/me/identity/route')
    return PUT(new NextRequest('https://spacenode.app/api/users/me/identity', { method: 'PUT', body: fd }))
  }

  it('SVG → 400 e nada sobe', async () => {
    const res = await putLogo(bytes(SVG_TEXT), 'logo.svg', 'image/svg+xml')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/PNG, JPG ou WebP/)
    expect(upload).not.toHaveBeenCalled()
  })

  it('SVG renomeado para .png → 400 e nada sobe', async () => {
    const res = await putLogo(bytes(SVG_TEXT), 'logo.png', 'image/png')
    expect(res.status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
  })

  it('HTML declarado como imagem → 400 e nada sobe', async () => {
    const res = await putLogo(bytes('<html><script>alert(1)</script></html>'), 'logo.jpg', 'image/jpeg')
    expect(res.status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
  })

  it('PNG sobe com o tipo e a extensão reais', async () => {
    const res = await putLogo(PNG_BYTES, 'logo.png', 'image/png')
    expect(res.status).toBe(200)
    expect(upload).toHaveBeenCalledTimes(1)
    const [key, , opts] = upload.mock.calls[0] as [string, Buffer, { contentType: string }]
    expect(key).toMatch(new RegExp(`^${USER}/logo-\\d+\\.png$`))
    expect(opts.contentType).toBe('image/png')
    expect((await res.json()).identity.logo_url).toContain(`/architect-identity/${USER}/`)
  })

  it('o tipo declarado pelo navegador é ignorado', async () => {
    const res = await putLogo(WEBP_BYTES, 'logo.svg', 'image/svg+xml')
    expect(res.status).toBe(200)
    const [key, , opts] = upload.mock.calls[0] as [string, Buffer, { contentType: string }]
    expect(key).toMatch(/\.webp$/)
    expect(opts.contentType).toBe('image/webp')
  })

  it('acima de 2 MB → 400 e nada sobe', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    big.set(PNG_BYTES)
    const res = await putLogo(big, 'logo.png', 'image/png')
    expect(res.status).toBe(400)
    expect(upload).not.toHaveBeenCalled()
  })
})
