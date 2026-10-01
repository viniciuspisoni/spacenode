import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertMp4, deliverGeneratedVideo } from '@/lib/video/delivery'

function box(name: string, bytes: number): Buffer {
  const result = Buffer.alloc(bytes)
  result.writeUInt32BE(bytes, 0)
  result.write(name, 4, 4, 'ascii')
  return result
}

const video = Buffer.concat([box('ftyp', 24), box('moov', 8), box('mdat', 1024)])
const provider = 'https://v3.fal.media/files/example.mp4'

function fakeStorage(uploadError: Error | null = null) {
  const upload = vi.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = vi.fn((key: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/spacenode-media/${key}` } }))
  const from = vi.fn(() => ({ upload, getPublicUrl }))
  return { admin: { storage: { from } } as unknown as SupabaseClient, upload, from }
}

const fetchVideo = vi.fn(async () => new Response(new Uint8Array(video), {
  headers: { 'content-type': 'video/mp4', 'content-length': String(video.length) },
})) as unknown as typeof fetch

describe('entrega técnica do Animar', () => {
  it('valida o contêiner e grava uma cópia privada sob a conta do usuário', async () => {
    const { admin, upload, from } = fakeStorage()
    const result = await deliverGeneratedVideo(admin, provider, 'user-123', fetchVideo)
    expect(result.status).toBe('stored')
    expect(result.bytes).toBe(video.length)
    expect(result.storageKey).toMatch(/^user-123\/animar\/.+\.mp4$/)
    expect(from).toHaveBeenCalledWith('spacenode-media')
    expect(upload).toHaveBeenCalledWith(result.storageKey, video, { contentType: 'video/mp4', upsert: false })
  })

  it('recusa HTML, contêiner incompleto e URL fora da fal antes de entregar', async () => {
    expect(() => assertMp4(Buffer.alloc(1024))).toThrow()
    expect(() => assertMp4(Buffer.concat([box('ftyp', 24), box('mdat', 1024)]))).toThrow()
    const { admin, upload } = fakeStorage()
    await expect(deliverGeneratedVideo(admin, 'https://fal.media.evil.test/a.mp4', 'user-123', fetchVideo))
      .rejects.toThrow('Origem')
    expect(upload).not.toHaveBeenCalled()
  })

  it('não segue redirecionamento do provider para um host externo', async () => {
    const { admin, upload } = fakeStorage()
    const redirect = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: 'https://example.com/private' },
    })) as unknown as typeof fetch
    await expect(deliverGeneratedVideo(admin, provider, 'user-123', redirect)).rejects.toThrow('Origem')
    expect(redirect).toHaveBeenCalledTimes(1)
    expect(upload).not.toHaveBeenCalled()
  })

  it('entrega o MP4 verificado pelo provider se o Storage estiver indisponível', async () => {
    const { admin } = fakeStorage(new Error('Storage indisponível'))
    const result = await deliverGeneratedVideo(admin, provider, 'user-123', fetchVideo)
    expect(result).toMatchObject({ status: 'provider_fallback', storedUrl: null, storageKey: null })
  })
})
