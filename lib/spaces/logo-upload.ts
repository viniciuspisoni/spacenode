// lib/spaces/logo-upload.ts
//
// Regras do logo do escritório (bucket `architect-identity`). Sem import de
// server: o IdentityEditor (client) usa as mesmas listas.
//
// Sem SVG (auditoria 2026-11-18, recomendação 3): o bucket é público, e um SVG
// aberto direto na URL do Storage roda o <script> que tiver dentro. O tipo vem
// dos primeiros bytes do arquivo, não do `type` que o navegador manda — assim
// um SVG/HTML renomeado para .png também é recusado.

export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number]

export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export const LOGO_FORMATS_LABEL = 'PNG, JPG ou WebP'

const EXTENSION: Record<LogoMimeType, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function logoExtension(type: LogoMimeType): string {
  return EXTENSION[type]
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((b, i) => bytes[offset + i] === b)
}

const PNG  = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const RIFF = [0x52, 0x49, 0x46, 0x46] // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50] // "WEBP" (offset 8)

/** Tipo real do logo pelos bytes iniciais; null para qualquer outra coisa
 *  (SVG, HTML, GIF, vazio…). */
export function detectLogoType(bytes: Uint8Array): LogoMimeType | null {
  if (startsWith(bytes, PNG)) return 'image/png'
  if (startsWith(bytes, JPEG)) return 'image/jpeg'
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp'
  return null
}
