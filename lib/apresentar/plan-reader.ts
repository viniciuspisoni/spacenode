import sharp from 'sharp'
import { geminiVisionJson } from '@/lib/gemini'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { uploadToStorage } from '@/lib/ai/image-provider'
import type { HumanizedPlanProjectType } from './config'

export interface PlanRoom {
  name: string
  x: number
  y: number
  confidence: number
}

export interface PlanRead {
  projectType: HumanizedPlanProjectType
  existingLabels: boolean
  rooms: PlanRoom[]
}

const TYPES: HumanizedPlanProjectType[] = [
  'apartamento', 'casa', 'comercial', 'corporativo', 'paisagismo',
]

export function parsePlanRead(raw: string): PlanRead {
  const value = JSON.parse(raw) as Record<string, unknown>
  const projectType = TYPES.includes(value.projectType as HumanizedPlanProjectType)
    ? value.projectType as HumanizedPlanProjectType
    : 'apartamento'
  const rooms = Array.isArray(value.rooms) ? value.rooms : []
  return {
    projectType,
    existingLabels: value.existingLabels === true,
    rooms: rooms.slice(0, 40).flatMap((room: unknown) => {
      if (!room || typeof room !== 'object') return []
      const r = room as Record<string, unknown>
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 36) : ''
      if (!name || typeof r.x !== 'number' || typeof r.y !== 'number' ||
          !Number.isFinite(r.x) || !Number.isFinite(r.y) ||
          r.x < 0.05 || r.x > 0.95 || r.y < 0.05 || r.y > 0.95) return []
      const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence)
        ? Math.max(0, Math.min(1, r.confidence))
        : 0
      return [{ name, x: r.x, y: r.y, confidence }]
    }),
  }
}

/** Reading is advisory: a failed vision call must never prevent generation. */
export async function readHumanizedPlan(imageUrl: string): Promise<PlanRead> {
  const raw = await geminiVisionJson({
    imageUrl,
    system: 'You read architectural floor plans. Return only valid JSON, no commentary. Never invent room names or positions.',
    user: 'Identify projectType (apartamento, casa, comercial, corporativo, paisagismo), existingLabels (true if room names are already printed), and rooms [{name in PT-BR, x, y, confidence}]. x/y are normalized 0..1 positions inside the room, away from walls. Omit uncertain rooms. Preserve printed room names verbatim when present.',
    maxTokens: 1200,
  })
  return parsePlanRead(raw)
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[ch] ?? ch)
}

/** Applies only high-confidence labels; output already containing labels is left untouched. */
export async function composePlanLabels(
  imageUrl: string,
  originalWidth: number,
  originalHeight: number,
  read: PlanRead,
  userId: string,
): Promise<string> {
  if (read.existingLabels) return imageUrl
  const rooms = read.rooms.filter(r => r.confidence >= 0.85)
  if (!rooms.length) return imageUrl
  const buffer = await fetchStorageBuffer(imageUrl)
  const meta = await sharp(buffer).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height || !originalWidth || !originalHeight) return imageUrl
  const sourceAspect = originalWidth / originalHeight
  if (Math.abs(width / height - sourceAspect) / sourceAspect > 0.02) return imageUrl

  const size = Math.max(13, Math.min(28, Math.round(width / 95)))
  const markup = rooms.map(room =>
    `<text x="${Math.round(room.x * width)}" y="${Math.round(room.y * height)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="600" fill="#202124" stroke="#ffffff" stroke-width="${Math.max(2, Math.round(size / 6))}" paint-order="stroke" letter-spacing="0.02em">${xmlEscape(room.name)}</text>`
  ).join('')
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${markup}</svg>`)
  const output = await sharp(buffer).composite([{ input: svg }]).png().toBuffer()
  return uploadToStorage(output, 'image/png', userId, 'apresentar')
}
