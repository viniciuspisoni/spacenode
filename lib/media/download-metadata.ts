/** Inspect the bytes being downloaded, without decoding or recompressing them.
 * A CDN URL or Content-Type can disagree with the actual image format. */
export function imageFormat(bytes: Uint8Array): { mime: string; extension: string } | null {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v)
  const ascii = (from: number, length: number) => String.fromCharCode(...bytes.subarray(from, from + length))
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', extension: 'png' }
  if (starts(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', extension: 'jpg' }
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { mime: 'image/webp', extension: 'webp' }
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { mime: 'image/gif', extension: 'gif' }
  if (bytes.length >= 16 && ascii(4, 4) === 'ftyp') {
    // AVIF image / sequence brands: https://aomediacodec.github.io/av1-avif/#brands
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
    const avif = (at: number) => ['avif', 'avis'].includes(ascii(at, 4))
    if (size >= 16 && size <= bytes.length) {
      if (avif(8)) return { mime: 'image/avif', extension: 'avif' }
      // Offset 12 is the minor version, not a compatible brand.
      for (let at = 16; at + 4 <= Math.min(size, 256); at += 4) {
        if (avif(at)) return { mime: 'image/avif', extension: 'avif' }
      }
    }
  }
  return null
}

export function downloadMetadata(bytes: Uint8Array, contentType: string | null, requestedName: string) {
  const format = imageFormat(bytes)
  const sanitized = requestedName.replace(/[^\w.\-]/g, '_')
  if (!format) return { contentType: contentType ?? 'application/octet-stream', filename: sanitized.slice(0, 120) || 'spacenode-download' }
  const stem = sanitized.replace(/\.[a-z0-9]{1,12}$/i, '').slice(0, 110) || 'spacenode-render'
  return { contentType: format.mime, filename: `${stem}.${format.extension}` }
}
