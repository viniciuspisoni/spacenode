import { describe, expect, it } from 'vitest'
import {
  BLOCOS3D_ENGINES, normalizeBlocos3DOptions, validViewSequence,
} from '@/lib/blocos3d/config'
import { BLOCOS3D_NODES, estimatedMargin } from '@/lib/blocos3d/pricing'
import { buildInput, extractOutputs, resolveFalEngineId } from '@/lib/blocos3d/fal'
import { inspectGlb } from '@/lib/blocos3d/inspect-glb'

describe('Blocos 3D V2: custo e roteamento', () => {
  it('usa o mesmo preço no client e no servidor e protege o piso legado', () => {
    expect(BLOCOS3D_ENGINES.standard.costInNodes).toBe(BLOCOS3D_NODES)
    expect(estimatedMargin(BLOCOS3D_NODES)).toBeGreaterThanOrEqual(0.8)
    expect(BLOCOS3D_NODES).toBe(190)
    expect(normalizeBlocos3DOptions({ quality: 'premium' })).toBeNull()
    expect(normalizeBlocos3DOptions({ quality: 'high' })).toBeNull()
  })

  it('usa H3.1 single/multiview com a textura detalhada orçada', () => {
    const engine = BLOCOS3D_ENGINES.standard
    const options = { quality: 'standard' as const }
    const one = { front: 'front-url' }
    const three = { front: 'front-url', left: 'left-url', back: 'back-url' }
    expect(resolveFalEngineId(engine, one)).toBe('tripo3d/h3.1/image-to-3d')
    expect(buildInput(resolveFalEngineId(engine, one), one, options)).toMatchObject({
      image_url: 'front-url', pbr: true, texture_quality: 'detailed',
      geometry_quality: 'standard', auto_size: true,
    })
    expect(resolveFalEngineId(engine, three)).toBe('tripo3d/h3.1/multiview-to-3d')
    expect(buildInput(resolveFalEngineId(engine, three), three, options)).toMatchObject({
      image_urls: ['front-url', 'left-url', 'back-url'], pbr: true,
      texture_quality: 'detailed', geometry_quality: 'standard',
    })
    expect(validViewSequence({ front: 'a', back: 'b' })).toBe(false)
    expect(validViewSequence(three)).toBe(true)
  })

  it('prefere o GLB PBR quando a resposta também tem um mesh básico', () => {
    const output = extractOutputs({
      model_mesh: { url: 'https://v3.fal.media/basic.glb' },
      model_urls: { pbr_model: { url: 'https://v3.fal.media/pbr.glb' } },
      rendered_image: { url: 'https://v3.fal.media/preview.png' },
    })
    expect(output.modelUrls.glb).toBe('https://v3.fal.media/pbr.glb')
    expect(output.thumbnailUrl).toBe('https://v3.fal.media/preview.png')
  })
})

function glbFor(gltf: Record<string, unknown>): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(gltf))
  const padded = Math.ceil(raw.length / 4) * 4
  const bytes = new Uint8Array(28 + padded)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, padded, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.set(raw, 20)
  bytes.fill(0x20, 20 + raw.length)
  view.setUint32(20 + padded, 0, true)
  view.setUint32(24 + padded, 0x004e4942, true)
  return bytes
}

describe('inspeção do GLB antes da entrega', () => {
  const valid = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 9 }, { count: 9 }],
    textures: [{}],
  }

  it('aceita geometria texturizada e recusa arquivo truncado', () => {
    expect(inspectGlb(glbFor(valid))).toMatchObject({ meshes: 1, triangles: 3, textures: 1 })
    expect(() => inspectGlb(new Uint8Array(10))).toThrow()
  })

  it('recusa modelo sem textura, que não corresponde à saída cobrada', () => {
    expect(() => inspectGlb(glbFor({ ...valid, textures: [] }))).toThrow(/textura/)
  })
})
