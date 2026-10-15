/** Inspeção mínima do artefato antes de entregar e cobrar uma geração. */
export interface GlbInspection {
  meshes: number
  vertices: number
  triangles: number
  textures: number
}

export function inspectGlb(bytes: Uint8Array): GlbInspection {
  if (bytes.byteLength < 20) throw new Error('GLB vazio ou truncado')
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2 ||
      data.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('Cabeçalho GLB inválido')
  }
  const jsonLength = data.getUint32(12, true)
  const binOffset = jsonLength + 20
  if (data.getUint32(16, true) !== 0x4e4f534a || jsonLength < 2 ||
      jsonLength % 4 !== 0 || binOffset + 8 > bytes.byteLength) {
    throw new Error('JSON do GLB inválido')
  }
  const binLength = data.getUint32(binOffset, true)
  if (data.getUint32(binOffset + 4, true) !== 0x004e4942 ||
      binOffset + 8 + binLength !== bytes.byteLength) {
    throw new Error('Dados binários do GLB inválidos')
  }
  let gltf: Record<string, unknown>
  try {
    gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  } catch {
    throw new Error('JSON do GLB ilegível')
  }
  const asset = gltf.asset as { version?: string } | undefined
  const buffers = gltf.buffers as Array<{ byteLength?: number; uri?: string }> | undefined
  const meshes = gltf.meshes as Array<{ primitives?: Array<{ attributes?: { POSITION?: number }; indices?: number; mode?: number }> }> | undefined
  const accessors = gltf.accessors as Array<{ count?: number }> | undefined
  if (asset?.version !== '2.0' || !Array.isArray(meshes) || !Array.isArray(accessors) ||
      !Array.isArray(buffers) || buffers.length !== 1 || buffers[0].uri ||
      !Number.isSafeInteger(buffers[0].byteLength) ||
      (buffers[0].byteLength ?? 0) > binLength) {
    throw new Error('Estrutura glTF inválida')
  }
  let vertices = 0
  let triangles = 0
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue
      const positions = accessors[primitive.attributes?.POSITION ?? -1]?.count ?? 0
      if (!Number.isSafeInteger(positions) || positions <= 0) continue
      vertices += positions
      const indices = primitive.indices === undefined ? positions : (accessors[primitive.indices]?.count ?? 0)
      triangles += Math.floor(indices / 3)
    }
  }
  const textures = Array.isArray(gltf.textures) ? gltf.textures.length : 0
  if (!vertices || !triangles || !textures) throw new Error('Modelo sem geometria ou textura utilizável')
  return { meshes: meshes.length, vertices, triangles, textures }
}
