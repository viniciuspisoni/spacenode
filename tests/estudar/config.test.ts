// Config do Estudar — custos e knobs SEM valor hardcoded fora daqui:
// defaults no código + override por env (padrão getRenderFidelityConfig).

import { afterEach, describe, expect, it } from 'vitest'
import {
  ESTUDAR_DEFAULT_REFINE_NODES,
  ESTUDAR_DEFAULT_STUDY_NODES,
  getEstudarConfig,
} from '@/lib/estudar/config'

const ENV_KEYS = [
  'ESTUDAR_STUDY_NODES',
  'ESTUDAR_REFINE_NODES',
  'ESTUDAR_RESOLUTION',
  'ESTUDAR_TIMEOUT_MS',
  'ESTUDAR_IMAGE_ENDPOINT',
]

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe('getEstudarConfig', () => {
  it('defaults sem env: 45/10 nodes, 2K, 180s, NB2', () => {
    const c = getEstudarConfig()
    expect(c.studyNodes).toBe(ESTUDAR_DEFAULT_STUDY_NODES)
    expect(c.refineNodes).toBe(ESTUDAR_DEFAULT_REFINE_NODES)
    expect(c.studyNodes).toBe(45)
    expect(c.refineNodes).toBe(10)
    expect(c.resolution).toBe('2K')
    expect(c.timeoutMs).toBe(180_000)
    expect(c.imageEndpoint).toBe('fal-ai/nano-banana-2/edit')
  })

  it('envs válidas sobrescrevem custos e knobs', () => {
    process.env.ESTUDAR_STUDY_NODES = '60'
    process.env.ESTUDAR_REFINE_NODES = '15'
    process.env.ESTUDAR_RESOLUTION = '4k'
    process.env.ESTUDAR_TIMEOUT_MS = '240000'
    process.env.ESTUDAR_IMAGE_ENDPOINT = 'fal-ai/nano-banana-pro/edit'
    const c = getEstudarConfig()
    expect(c.studyNodes).toBe(60)
    expect(c.refineNodes).toBe(15)
    expect(c.resolution).toBe('4K')
    expect(c.timeoutMs).toBe(240_000)
    expect(c.imageEndpoint).toBe('fal-ai/nano-banana-pro/edit')
  })

  it('valores inválidos caem no default (zero, negativo, lixo)', () => {
    process.env.ESTUDAR_STUDY_NODES = '0'
    process.env.ESTUDAR_REFINE_NODES = '-3'
    process.env.ESTUDAR_RESOLUTION = '8K'
    process.env.ESTUDAR_TIMEOUT_MS = 'abc'
    const c = getEstudarConfig()
    expect(c.studyNodes).toBe(ESTUDAR_DEFAULT_STUDY_NODES)
    expect(c.refineNodes).toBe(ESTUDAR_DEFAULT_REFINE_NODES)
    expect(c.resolution).toBe('2K')
    expect(c.timeoutMs).toBe(180_000)
  })

  it('custo fracionado é truncado pra inteiro', () => {
    process.env.ESTUDAR_STUDY_NODES = '45.9'
    expect(getEstudarConfig().studyNodes).toBe(45)
  })
})
