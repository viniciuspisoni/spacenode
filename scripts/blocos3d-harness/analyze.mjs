import { readFile } from 'node:fs/promises'
import { NodeIO } from '@gltf-transform/core'
import { getBounds } from '@gltf-transform/functions'
import sharp from 'sharp'

/** Inspeção técnica auxiliar do benchmark; não substitui avaliação visual. */
export async function analyzeGlb(path) {
  const bytes = new Uint8Array(await readFile(path))
  const doc = await new NodeIO().readBinary(bytes)
  const root = doc.getRoot()
  const scenes = root.listScenes()
  const bounds = scenes.map(getBounds).filter(b => b.min.every(Number.isFinite) && b.max.every(Number.isFinite))
  const min = [0, 1, 2].map(i => Math.min(...bounds.map(b => b.min[i])))
  const max = [0, 1, 2].map(i => Math.max(...bounds.map(b => b.max[i])))
  const size = min.map((value, i) => Number((max[i] - value).toFixed(3)))
  const materials = root.listMaterials()
  const pbr = materials.filter(m => m.getBaseColorTexture() &&
    (m.getNormalTexture() || m.getMetallicRoughnessTexture())).length
  const textures = await Promise.all(root.listTextures().map(async texture => {
    const image = texture.getImage()
    if (!image) return { width: 0, height: 0, bytes: 0 }
    const metadata = await sharp(image).metadata()
    return { width: metadata.width ?? 0, height: metadata.height ?? 0, bytes: image.byteLength }
  }))
  const flags = []
  if (!bounds.length || size.some(s => !Number.isFinite(s) || s <= 0)) flags.push('dimensões ausentes')
  if (!pbr) flags.push('sem mapas PBR vinculados')
  if (textures.some(t => Math.max(t.width, t.height) > 4096)) flags.push('textura acima de 4K')
  return { sizeMeters: size, materials: materials.length, pbrMaterials: pbr,
    maxTextureSide: Math.max(0, ...textures.map(t => Math.max(t.width, t.height))),
    textureBytes: textures.reduce((total, t) => total + t.bytes, 0), flags }
}
