// Origem declarada de um pedido ao /api/generate (plugin SketchUp 1.9.0+).
//
// O plugin se identifica no corpo (`client: { kind: 'sketchup', version }`) e,
// como reserva, no User-Agent ("SPACENODE SketchUp/x.y.z"). O servidor só
// REGISTRA isto (telemetria, config_snapshot.client): nenhum ramo de geração
// depende do kind — o que muda o condicionamento é o edge map nativo, não a
// origem declarada. O corpo tem precedência porque proxies reescrevem o UA.
//
// CLIENT-SAFE: sem imports de servidor.

export type ClientKind = 'sketchup' | 'web' | 'unknown'
export type ClientInfo = { kind: ClientKind; version: string | null }

const VERSION_RE = /^\d+\.\d+\.\d+$/
const UA_RE = /^SPACENODE SketchUp\/(\d+\.\d+\.\d+)/

export function detectClient(userAgent: string | null | undefined, raw: unknown): ClientInfo {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const kind: ClientKind | null = obj?.kind === 'sketchup' || obj?.kind === 'web' ? obj.kind : null
  const version = typeof obj?.version === 'string' && VERSION_RE.test(obj.version) ? obj.version : null
  if (kind) return { kind, version }
  const m = (userAgent ?? '').match(UA_RE)
  if (m) return { kind: 'sketchup', version: m[1] }
  return { kind: 'unknown', version: null }
}
