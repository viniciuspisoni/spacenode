import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toMediaProxyUrl } from '@/lib/storage/media-url'
import { signStorageUrl } from '@/lib/storage/signed'

const oldHost = process.env.NEXT_PUBLIC_SUPABASE_URL
const oldPrivate = process.env.NEXT_PUBLIC_STORAGE_PRIVATE
const oldServerPrivate = process.env.STORAGE_PRIVATE
const host = 'https://example.supabase.co'
const media = `${host}/storage/v1/object/public/spacenode-media/user-123/animar/clip.mp4`

afterEach(() => {
  if (oldHost === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = oldHost
  if (oldPrivate === undefined) delete process.env.NEXT_PUBLIC_STORAGE_PRIVATE
  else process.env.NEXT_PUBLIC_STORAGE_PRIVATE = oldPrivate
  if (oldServerPrivate === undefined) delete process.env.STORAGE_PRIVATE
  else process.env.STORAGE_PRIVATE = oldServerPrivate
})

describe('URLs do bucket privado de vídeo', () => {
  it('usa proxy autenticado mesmo sem o flip global de Storage', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = host
    delete process.env.NEXT_PUBLIC_STORAGE_PRIVATE
    expect(toMediaProxyUrl(media)).toBe('/api/media?bucket=spacenode-media&key=user-123%2Fanimar%2Fclip.mp4')
    expect(toMediaProxyUrl(`${host}/storage/v1/object/public/space-mestres/user-123/a.jpg`))
      .toContain('/storage/v1/object/public/')
  })

  it('assina o vídeo privado quando a flag global estiver desligada', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = host
    delete process.env.STORAGE_PRIVATE
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/clip' }, error: null })
    const admin = { storage: { from: () => ({ createSignedUrl }) } } as unknown as SupabaseClient
    expect(await signStorageUrl(admin, media)).toBe('https://signed.example/clip')
    expect(createSignedUrl).toHaveBeenCalledWith('user-123/animar/clip.mp4', 3600)
  })
})
