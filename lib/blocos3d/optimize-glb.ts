import { NodeIO } from '@gltf-transform/core'
import { simplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { inspectGlb } from './inspect-glb'

const TARGET_TRIANGLES = 150_000

/** Cria uma cópia leve para cenas. O original nunca é modificado. */
export async function optimizeGlb(input: Uint8Array): Promise<Uint8Array | null> {
  const before = inspectGlb(input)
  if (before.triangles <= TARGET_TRIANGLES) return null

  // Extensões não registradas no NodeIO poderiam desaparecer na exportação.
  // Entregamos o original nesses casos, sem alterar material ou geometria.
  const jsonLength = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(12, true)
  const source = JSON.parse(new TextDecoder().decode(input.subarray(20, 20 + jsonLength))) as {
    extensionsUsed?: string[]
  }
  if (source.extensionsUsed?.length) return null

  const io = new NodeIO()
  const document = await io.readBinary(input)
  await MeshoptSimplifier.ready
  await document.transform(simplify({
    simplifier: MeshoptSimplifier,
    ratio: Math.max(0.01, TARGET_TRIANGLES / before.triangles),
    error: 0.005,
    lockBorder: true,
  }))

  const output = await io.writeBinary(document)
  const after = inspectGlb(output)
  if (after.triangles >= before.triangles || after.textures < before.textures ||
      output.byteLength >= input.byteLength) {
    return null
  }
  console.info('[blocos3d] GLB para cenas:', {
    originalTriangles: before.triangles,
    optimizedTriangles: after.triangles,
    originalBytes: input.byteLength,
    optimizedBytes: output.byteLength,
  })
  return output
}
