// Cliente mínimo para comparar H3.1 direto sem alterar o provider da aplicação.
const BASE = 'https://openapi.tripo3d.ai/v3'
export const TRIPO_MODEL = 'v3.1-20260211'

async function request(path, key, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${key}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Tripo ${path}: HTTP ${response.status}`)
  const json = await response.json()
  if (json?.code !== 0 || !json.data) throw new Error(`Tripo ${path}: ${json?.message ?? `código ${json?.code}`}`)
  return json.data
}

export async function uploadTripoImage(key, bytes, filename, contentType) {
  const body = new FormData()
  body.append('file', new Blob([bytes], { type: contentType }), filename)
  const { file_token } = await request('/files', key, { method: 'POST', body })
  if (typeof file_token !== 'string' || !file_token) throw new Error('Tripo upload sem file_token')
  return file_token
}

export function directInput(tokens) {
  if (tokens.length < 1 || tokens.length > 4) throw new Error('Tripo requer 1 a 4 vistas')
  const fields = {
    model: TRIPO_MODEL, texture: true, pbr: true, texture_quality: 'detailed',
    geometry_quality: 'standard', texture_alignment: 'original_image', auto_size: true,
  }
  if (tokens.length === 1) return { input: tokens[0], ...fields }
  const names = ['front', 'left', 'back', 'right']
  return { inputs: [Object.fromEntries(tokens.map((token, i) => [names[i], token]))], ...fields }
}

export async function submitTripo(key, tokens) {
  const path = tokens.length > 1 ? '/generation/multiview-to-model' : '/generation/image-to-model'
  const { task_id } = await request(path, key, { method: 'POST', body: directInput(tokens) })
  if (typeof task_id !== 'string' || !task_id) throw new Error('Tripo submit sem task_id')
  return task_id
}

export async function getTripoTask(key, taskId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) throw new Error('task_id inválido')
  return request(`/tasks/${taskId}`, key)
}
