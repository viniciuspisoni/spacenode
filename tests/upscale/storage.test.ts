import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveUpscaleOutput } from '@/lib/upscale/output'
import { signStorageUrl, mediaProxyUrl } from '@/lib/storage/signed'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import { DIRECT_UPLOAD_AREAS } from '@/lib/storage/direct-upload'

const { download } = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('@/lib/storage/fetch', () => ({ fetchStorageBuffer: download }))
afterEach(() => vi.unstubAllEnvs())

describe('Ampliar: arquivo grande e bucket privado', () => {
  it('persiste o master acima de 15 MB sem recomprimir e cria prévias menores', async () => {
    const source = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: 'white' } }).png().toBuffer()
    const master = await sharp(source).resize(3000, 2000).png({ compressionLevel: 0 }).toBuffer()
    expect(master.byteLength).toBeGreaterThan(15 * 1024 * 1024)
    download.mockResolvedValue(master)
    const upload = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ upload,
      getPublicUrl: (key: string) => ({ data: { publicUrl: 'https://storage.test/' + key } }),
    })
    const admin = { storage: { from } } as unknown as SupabaseClient
    const result = await saveUpscaleOutput(admin, 'owner', 'job', source, 'https://fal.media/master.png',
      { width: 1500, height: 1000 }, 2, new AbortController().signal)
    expect(from).toHaveBeenCalledWith('spacenode-media')
    expect(upload.mock.calls[0][1]).toBe(master)
    expect(result.bytes).toBe(master.byteLength)
    expect(upload).toHaveBeenCalledTimes(3)
    expect(result.previewUrl).toContain('-after.webp')
    expect(result.beforePreviewUrl).toContain('-before.webp')
    expect(DIRECT_UPLOAD_AREAS['upscale-source'].bucket).toBe('spacenode-media')
    expect(DIRECT_UPLOAD_AREAS['upscale-source'].maxBytes).toBeGreaterThan(master.byteLength)
  })
  it('assina e usa proxy para spacenode-media mesmo com as flags legadas desligadas', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('STORAGE_PRIVATE', '0')
    vi.stubEnv('NEXT_PUBLIC_STORAGE_PRIVATE', '0')
    const url = 'https://project.supabase.co/storage/v1/object/public/spacenode-media/owner/upscale/job.png'
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/image' }, error: null })
    const admin = { storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } } as unknown as SupabaseClient
    expect(await signStorageUrl(admin, url)).toBe('https://signed.test/image')
    expect(mediaProxyUrl(url)).toContain('/api/media?bucket=spacenode-media')
    expect(toMediaProxyUrl(url)).toBe(mediaProxyUrl(url))
    const legacy = url.replace('spacenode-media', 'space-mestres')
    expect(await signStorageUrl(admin, legacy)).toBe(legacy)
    expect(toMediaProxyUrl(legacy)).toBe(legacy)
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
  })
})
