// ── Validação de schemas (sem dependência nova) ──────────────────────────────
//
// Validador minúsculo para: (a) argumentos que o MODELO passa às tools —
// nunca confiamos no que vem do LLM; (b) payloads do client nas rotas V2.
// Cobre o que os schemas das tools usam: string (enum/len), number (min/max),
// boolean, array de string e objeto raso de strings. Falhou → a tool devolve
// erro estruturado pro modelo corrigir (não derruba o loop).

export type FieldSpec =
  | { type: 'string'; required?: boolean; maxLen?: number; enum?: readonly string[]; pattern?: RegExp }
  | { type: 'number'; required?: boolean; min?: number; max?: number }
  | { type: 'boolean'; required?: boolean }
  | { type: 'string[]'; required?: boolean; maxItems?: number; maxLen?: number }
  | { type: 'record'; required?: boolean; maxKeys?: number; maxLen?: number }

export type ObjectSpec = Record<string, FieldSpec>

export interface ValidationResult<T> {
  ok: boolean
  value: T
  errors: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ID_SPEC: FieldSpec = { type: 'string', required: true, maxLen: 60, pattern: UUID_RE }

export function validateObject<T = Record<string, unknown>>(
  input: unknown,
  spec: ObjectSpec,
): ValidationResult<T> {
  const errors: string[] = []
  const out: Record<string, unknown> = {}
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  for (const [key, field] of Object.entries(spec)) {
    const raw = obj[key]
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) errors.push(`campo obrigatório ausente: ${key}`)
      continue
    }
    switch (field.type) {
      case 'string': {
        if (typeof raw !== 'string') { errors.push(`${key} deve ser string`); break }
        const v = raw.trim().slice(0, field.maxLen ?? 2000)
        if (field.enum && !field.enum.includes(v)) { errors.push(`${key} fora das opções: ${field.enum.join('|')}`); break }
        if (field.pattern && !field.pattern.test(v)) { errors.push(`${key} em formato inválido`); break }
        out[key] = v
        break
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(n)) { errors.push(`${key} deve ser número`); break }
        if (field.min !== undefined && n < field.min) { errors.push(`${key} < ${field.min}`); break }
        if (field.max !== undefined && n > field.max) { errors.push(`${key} > ${field.max}`); break }
        out[key] = n
        break
      }
      case 'boolean': {
        if (typeof raw !== 'boolean') { errors.push(`${key} deve ser boolean`); break }
        out[key] = raw
        break
      }
      case 'string[]': {
        if (!Array.isArray(raw)) { errors.push(`${key} deve ser lista`); break }
        out[key] = raw
          .slice(0, field.maxItems ?? 12)
          .filter((v): v is string => typeof v === 'string')
          .map(v => v.trim().slice(0, field.maxLen ?? 300))
          .filter(Boolean)
        break
      }
      case 'record': {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${key} deve ser objeto`); break }
        const rec: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, field.maxKeys ?? 12)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            rec[String(k).slice(0, 40)] = String(v).slice(0, field.maxLen ?? 200)
          }
        }
        out[key] = rec
        break
      }
    }
  }
  return { ok: errors.length === 0, value: out as T, errors }
}

/** Converte um ObjectSpec no JSON Schema que o Gemini recebe (parametersJsonSchema). */
export function specToJsonSchema(spec: ObjectSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(spec)) {
    if (field.required) required.push(key)
    switch (field.type) {
      case 'string':
        properties[key] = field.enum ? { type: 'string', enum: [...field.enum] } : { type: 'string' }
        break
      case 'number':
        properties[key] = { type: 'number' }
        break
      case 'boolean':
        properties[key] = { type: 'boolean' }
        break
      case 'string[]':
        properties[key] = { type: 'array', items: { type: 'string' } }
        break
      case 'record':
        properties[key] = { type: 'object', additionalProperties: { type: 'string' } }
        break
    }
  }
  const schema: Record<string, unknown> = { type: 'object', properties }
  if (required.length) schema.required = required
  return schema
}
