import test from 'node:test'
import assert from 'node:assert/strict'
import { directInput, uploadTripoImage, submitTripo, getTripoTask, TRIPO_MODEL } from './tripo-direct.mjs'

test('single e multiview mantêm parâmetros e posições', () => {
  assert.deepEqual(directInput(['front']), {
    input: 'front', model: TRIPO_MODEL, texture: true, pbr: true,
    texture_quality: 'detailed', geometry_quality: 'standard',
    texture_alignment: 'original_image', auto_size: true,
  })
  assert.deepEqual(directInput(['front', 'left', 'back', 'right']).inputs,
    [{ front: 'front', left: 'left', back: 'back', right: 'right' }])
  assert.throws(() => directInput([]), /1 a 4 vistas/)
})

test('upload, submissão e consulta usam os endpoints e identificadores da API direta', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    const data = url.endsWith('/files') ? { file_token: 'file_123' }
      : url.endsWith('/tasks/task_123') ? { status: 'success', credits_consumed: 40, output: { model_url: 'https://cdn.tripo3d.ai/model.glb' } }
        : { task_id: 'task_123' }
    return Response.json({ code: 0, data })
  }
  assert.equal(await uploadTripoImage('key', Buffer.from('image'), 'front.jpg', 'image/jpeg'), 'file_123')
  assert.equal(await submitTripo('key', ['file_123', 'file_456']), 'task_123')
  assert.equal((await getTripoTask('key', 'task_123')).credits_consumed, 40)
  assert.deepEqual(calls.map(x => new URL(x.url).pathname),
    ['/v3/files', '/v3/generation/multiview-to-model', '/v3/tasks/task_123'])
  assert.equal(calls[0].options.body.get('file').name, 'front.jpg')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer key')
  assert.deepEqual(JSON.parse(calls[1].options.body).inputs, [{ front: 'file_123', left: 'file_456' }])
})

test('falha de API não é tratada como tarefa aceita', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => Response.json({ code: 1004, message: 'invalid input' })
  await assert.rejects(submitTripo('key', ['file_123']), /invalid input/)
})
