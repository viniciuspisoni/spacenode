import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/download/route'
import { downloadMetadata, imageFormat } from '@/lib/media/download-metadata'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
afterEach(() => vi.unstubAllGlobals())

describe('image download keeps the original bytes and matches its real type', () => {
  it('corrects a PNG served under a JPEG URL and requested filename', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { headers: { 'Content-Type': 'image/jpeg' } })))
    const response = await GET(new NextRequest('https://spacenode.app/api/download?url=https%3A%2F%2Ffal.media%2Fresult.jpg&filename=projeto.jpg'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="projeto.png"')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not rename or modify a video download', async () => {
    const mp4 = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 109, 112, 52, 50])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(mp4, { headers: { 'Content-Type': 'video/mp4' } })))
    const response = await GET(new NextRequest('https://spacenode.app/api/download?url=https%3A%2F%2Ffal.media%2Fvideo.mp4&filename=projeto.mp4'))
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="projeto.mp4"')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(mp4)
  })

  it('retains the trusted-host boundary before fetching', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await GET(new NextRequest('https://spacenode.app/api/download?url=https%3A%2F%2Funtrusted.example%2Fresult.png'))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not return an attachment on an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })))
    const response = await GET(new NextRequest('https://spacenode.app/api/download?url=https%3A%2F%2Ffal.media%2Fresult.png'))
    expect(response.status).toBe(502)
    expect(response.headers.get('Content-Disposition')).toBeNull()
  })

  it.each([
    [[255, 216, 255, 224], 'jpg', 'image/jpeg'],
    [Array.from(png), 'png', 'image/png'],
    [Array.from(Buffer.from('RIFF0000WEBP')), 'webp', 'image/webp'],
    [Array.from(Buffer.from('GIF89a')), 'gif', 'image/gif'],
  ])('uses bytes rather than a misleading extension', (bytes, extension, mime) => {
    const metadata = downloadMetadata(new Uint8Array(bytes), 'image/png', 'projeto.wrong')
    expect(metadata).toEqual({ contentType: mime, filename: `projeto.${extension}` })
  })

  it('recognizes an AVIF compatible brand without misreading the minor version', () => {
    const avif = new Uint8Array([0, 0, 0, 20, ...Buffer.from('ftypmif1'), 0, 0, 0, 0, ...Buffer.from('avif')])
    expect(imageFormat(avif)?.extension).toBe('avif')
    const minorVersion = new Uint8Array([0, 0, 0, 20, ...Buffer.from('ftypmif1avifmif1')])
    expect(imageFormat(minorVersion)).toBeNull()
    expect(imageFormat(avif.subarray(0, 15))).toBeNull()
  })

  it('sanitizes the final filename and keeps unknown binary types honest', () => {
    const metadata = downloadMetadata(png, 'image/jpeg', 'render"\r\nContent-Type:bad.jpg')
    expect(metadata.filename).not.toMatch(/["\r\n:]/)
    expect(metadata.filename).toMatch(/\.png$/)
    expect(downloadMetadata(png, null, '').filename).toBe('spacenode-render.png')
    expect(downloadMetadata(png, null, 'a'.repeat(200) + '.jpg').filename.length).toBeLessThanOrEqual(120)
    expect(downloadMetadata(new Uint8Array([1, 2, 3]), null, 'result.bin').contentType).toBe('application/octet-stream')
  })
})
