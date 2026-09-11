// Medidas do ambiente no bloco MODEL FACTS.
//
// O plugin está DENTRO do modelo e mede por raytest o que a imagem não conta:
// pé-direito e largura parede a parede. Sem isso o motor escolhe a escala que
// quiser — é o que faz um render inventar pé-direito de 4 m numa sala de 2,70.
//
// Estes testes fixam três coisas: a medida chega ao prompt com o número certo,
// ela NÃO aparece quando o plugin não mediu (vista externa, raio sem acerto),
// e o texto diz que a medida foi tirada no ponto da câmera — porque foi.

import { describe, expect, it } from 'vitest'
import { PRESERVE, buildFidelityPrompt, type GenerateOptions } from '@/lib/prompts'

const base: GenerateOptions = {
  projectType:   'interior',
  segment:       PRESERVE,
  environment:   PRESERVE,
  lighting:      PRESERVE,
  background:    PRESERVE,
  sceneElements: [],
  geometryLock:  85,
  materials:     undefined,
  fidelityMode:  'strict',
  fidelityLevel: 'maximum',
}

describe('MODEL FACTS · medidas do ambiente', () => {
  it('leva pé-direito e largura pro prompt, com o número medido', () => {
    const prompt = buildFidelityPrompt({
      ...base,
      modelFacts: { room: { ceilingM: 2.7, widthM: 4.25 } },
    })
    expect(prompt).toContain('floor-to-ceiling height 2.7 m')
    expect(prompt).toContain('about 4.25 m wall to wall')
    // O fato é honesto sobre onde foi medido.
    expect(prompt).toContain('measured in the 3D model at the camera position')
  })

  it('sem medida, nenhuma linha de ambiente entra', () => {
    const prompt = buildFidelityPrompt({ ...base, modelFacts: { camera: { focalLengthMm: 35 } } })
    expect(prompt).not.toContain('floor-to-ceiling')
    expect(prompt).not.toContain('wall to wall')
  })

  it('mede só o pé-direito quando a largura não passou no gate do plugin', () => {
    const prompt = buildFidelityPrompt({ ...base, modelFacts: { room: { ceilingM: 3 } } })
    expect(prompt).toContain('floor-to-ceiling height 3 m')
    expect(prompt).not.toContain('wall to wall')
  })

  it('proíbe esticar o espaço — é o erro que a medida existe pra evitar', () => {
    const prompt = buildFidelityPrompt({ ...base, modelFacts: { room: { ceilingM: 2.4 } } })
    expect(prompt).toContain('never stretch the space')
  })
})
