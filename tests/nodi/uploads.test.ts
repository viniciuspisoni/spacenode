import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sealUpload, openUpload, newUploadKey, validUploadKey, validatePrint,
  resolveUploadImages, persistentPrintUrl, refreshPrintUrl, NODI_UPLOAD_MAX_BYTES } from '@/lib/nodi/v2/uploads'
import { conversationTurns } from '@/lib/nodi/conversation'
import { contextBlock } from '@/lib/nodi/v2/context-pack'
import { deriveNodiContext } from '@/lib/nodi/context'

beforeEach(() => { vi.stubEnv('NODI_ACTION_SECRET', 'upload-test-secret'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co') })
afterEach(() => vi.unstubAllEnvs())

describe('private print references', () => {
  it('roundtrip is owner-bound, opaque and expires after 24 hours', () => {
    const key = newUploadKey('owner', 'image/png')
    const token = sealUpload('owner', key, 1000)
    expect(openUpload(token, 'owner', 1001)).toBe(key)
    expect(openUpload(token, 'other', 1001)).toBeNull()
    expect(openUpload(token, 'owner', 1000 + 86400000)).toBeNull()
    expect(Buffer.from(token, 'base64url').toString()).not.toContain(key)
  })
  it('rejects tampering, traversal, other namespaces and owners', () => {
    const key = newUploadKey('owner', 'image/png')
    const token = sealUpload('owner', key)
    expect(openUpload(`${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`, 'owner')).toBeNull()
    expect(validUploadKey(key.replace('owner/', 'other/'), 'owner')).toBe(false)
    expect(validUploadKey('owner/nodi/source/../secret.png', 'owner')).toBe(false)
    expect(validUploadKey('owner/render/source/test.png', 'owner')).toBe(false)
    expect(() => sealUpload('other', key)).toThrow()
    expect(openUpload('garbage', 'owner')).toBeNull()
  })
  it('does not send the encrypted reference to the model or its history', () => {
    const attachment = { kind: 'upload' as const, id: sealUpload('owner', newUploadKey('owner', 'image/png')) }
    const history = conversationTurns([{ role: 'user', kind: 'text', text: 'Analise', generationRef: attachment }])
    const block = contextBlock({ nodi: deriveNodiContext('/app'), planId: null, planName: null, balance: null, extras: null, attachment })
    expect(history[0].text).toContain('print enviado')
    expect(history[0].text).not.toContain(attachment.id)
    expect(block).toContain('analisar_print')
    expect(block).not.toContain(attachment.id)
  })
  it('never signs a download for another owner', async () => {
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test.supabase.co/signed' }, error: null })
    const client = { storage: { from: () => ({ createSignedUrl: sign }) } } as unknown as SupabaseClient
    const key = newUploadKey('owner', 'image/png')
    const token = sealUpload('owner', key)
    expect(await resolveUploadImages(client, 'other', token)).toBeNull()
    expect(sign).not.toHaveBeenCalled()
    expect((await resolveUploadImages(client, 'owner', token))?.inputUrl).toContain('/signed')
    expect(sign).toHaveBeenCalledWith(key, 3600)
  })
  it('stores an authenticated proxy and refreshes access without retaining the download token', async () => {
    const key = newUploadKey('owner', 'image/png')
    const input = `https://test.supabase.co/storage/v1/object/sign/spacenode-media/${key}?token=temporary-secret`
    const proxy = persistentPrintUrl(input, 'owner')
    expect(proxy).toContain('/api/media?')
    expect(proxy).not.toContain('temporary-secret')
    expect(persistentPrintUrl(input, 'other')).toBe(input)
    expect(persistentPrintUrl(input.replace('test.supabase.co', 'evil.example'), 'owner')).toContain('evil.example')
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: 'fresh' }, error: null })
    const client = { storage: { from: () => ({ createSignedUrl: sign }) } } as unknown as SupabaseClient
    expect(await refreshPrintUrl(client, 'other', proxy)).toBeNull()
    expect(sign).not.toHaveBeenCalled()
    expect(await refreshPrintUrl(client, 'owner', proxy)).toBe('fresh')
  })
})

describe('decode and size checks', () => {
  it('accepts a real PNG, rejects forged MIME, invalid content and oversized buffers', async () => {
    const image = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#eee' } }).png().toBuffer()
    await expect(validatePrint(image, 'image/png')).resolves.toBeUndefined()
    await expect(validatePrint(image, 'image/jpeg')).rejects.toThrow()
    await expect(validatePrint(Buffer.from('<svg>secret</svg>'), 'image/png')).rejects.toThrow()
    await expect(validatePrint(Buffer.alloc(NODI_UPLOAD_MAX_BYTES + 1), 'image/png')).rejects.toThrow()
    await expect(validatePrint(image.subarray(0, 45), 'image/png')).rejects.toThrow()
  })
})
