// Proxy /api/download (auditoria 2026-11-18, S4): allowlist de URL, tipo de
// conteúdo devolvido da nossa origem e exigência de sessão.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  allowedDownloadUrl,
  safeDownloadContentType,
  safeDownloadFilename,
} from '@/lib/http/download-proxy'

const SB = 'abcd.supabase.co'

describe('allowedDownloadUrl', () => {
  it.each([
    'https://fal.media/files/x.png',
    'https://v3.fal.media/files/lion/abc.mp4',
    `https://${SB}/storage/v1/object/public/renders/u/x.jpg`,
    `https://${SB}/storage/v1/object/sign/spacenode-media/u/x.mp4?token=t`,
  ])('aceita %s', (url) => {
    expect(allowedDownloadUrl(url, SB)).not.toBeNull()
  })

  it.each([
    ['http (sem TLS)', 'http://fal.media/x.png'],
    ['host parecido', 'https://evilfal.media/x.png'],
    ['sufixo forjado', 'https://fal.media.attacker.com/x.png'],
    ['porta fora do padrão', 'https://fal.media:8443/x.png'],
    ['credenciais na URL', 'https://user:pw@fal.media/x.png'],
    ['REST do Supabase', `https://${SB}/rest/v1/profiles?select=*`],
    ['Auth do Supabase', `https://${SB}/auth/v1/admin/users`],
    ['traversal pra fora do storage', `https://${SB}/storage/v1/object/../../rest/v1/profiles`],
    ['outro projeto Supabase', 'https://outro.supabase.co/storage/v1/object/public/x.png'],
    ['metadados de nuvem', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'https://localhost/x.png'],
    ['lixo', 'not a url'],
  ])('recusa %s', (_label, url) => {
    expect(allowedDownloadUrl(url, SB)).toBeNull()
  })

  it('sem host Supabase configurado, só a FAL passa', () => {
    expect(allowedDownloadUrl(`https://${SB}/storage/v1/object/public/x.png`, null)).toBeNull()
    expect(allowedDownloadUrl('https://fal.media/x.png', null)).not.toBeNull()
  })
})

describe('safeDownloadContentType', () => {
  it.each([
    ['image/png', 'image/png'],
    ['image/jpeg; charset=binary', 'image/jpeg'],
    ['video/mp4', 'video/mp4'],
    ['text/html', 'application/octet-stream'],
    ['image/svg+xml', 'application/octet-stream'],
    ['application/javascript', 'application/octet-stream'],
    [null, 'application/octet-stream'],
  ])('%s → %s', (input, expected) => {
    expect(safeDownloadContentType(input)).toBe(expected)
  })
})

describe('safeDownloadFilename', () => {
  it('remove caracteres que quebram o header', () => {
    expect(safeDownloadFilename('a"\r\nSet-Cookie: x=1.jpg')).toBe('a___Set-Cookie__x_1.jpg')
  })
  it('cai no padrão quando vazio ou só pontos', () => {
    expect(safeDownloadFilename(null)).toBe('spacenode-render.jpg')
    expect(safeDownloadFilename('...')).toBe('spacenode-render.jpg')
  })
})

// ── Rota: sessão obrigatória e allowlist antes de qualquer fetch ─────────────

const getRequestUser = vi.fn()
vi.mock('@/lib/auth/request-user', () => ({ getRequestUser: (...a: unknown[]) => getRequestUser(...a) }))

describe('GET /api/download', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    getRequestUser.mockReset()
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })

  async function call(url: string) {
    const { GET } = await import('@/app/api/download/route')
    return GET(new NextRequest(`https://spacenode.app/api/download?url=${encodeURIComponent(url)}`))
  }

  it('sem sessão → 401 e nenhum fetch', async () => {
    getRequestUser.mockResolvedValue({ user: null, source: 'none' })
    const res = await call('https://fal.media/x.png')
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('URL fora da allowlist → 403 e nenhum fetch', async () => {
    getRequestUser.mockResolvedValue({ user: { id: 'u' }, source: 'cookie' })
    const res = await call('http://169.254.169.254/latest/meta-data/')
    expect(res.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('redirect para host fora da allowlist → 502, sem segundo fetch', async () => {
    getRequestUser.mockResolvedValue({ user: { id: 'u' }, source: 'cookie' })
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }))
    const res = await call('https://fal.media/x.png')
    expect(res.status).toBe(502)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('upstream text/html sai como attachment octet-stream', async () => {
    getRequestUser.mockResolvedValue({ user: { id: 'u' }, source: 'cookie' })
    fetchSpy.mockResolvedValueOnce(new Response('<script>alert(1)</script>', { status: 200, headers: { 'content-type': 'text/html' } }))
    const res = await call('https://fal.media/x.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/)
  })

  it('arquivo acima do teto → 413', async () => {
    getRequestUser.mockResolvedValue({ user: { id: 'u' }, source: 'cookie' })
    fetchSpy.mockResolvedValueOnce(new Response('x', {
      status: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': String(300 * 1024 * 1024) },
    }))
    const res = await call('https://fal.media/x.mp4')
    expect(res.status).toBe(413)
  })
})
