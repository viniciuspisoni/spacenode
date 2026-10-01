import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import proxy from '@/proxy'

describe('rotas descontinuadas de Spaces e Vistas', () => {
  it.each([
    ['POST', '/api/spaces'],
    ['POST', '/api/spaces/from-render'],
    ['POST', '/api/spaces/legacy/generate'],
    ['PATCH', '/api/spaces/legacy'],
    ['POST', '/api/vistas/legacy/upscale'],
  ])('bloqueia %s %s antes de gerar ou cobrar', async (method, path) => {
    const response = await proxy(new NextRequest(`https://spacenode.app${path}`, { method }))
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'Spaces e Vistas foram descontinuados.' })
  })
})
