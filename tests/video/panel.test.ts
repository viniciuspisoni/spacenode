import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AnimatePanel from '@/app/app/video/_components/AnimatePanel'
import { initialAnimateState, resolveMotion, type AnimateState } from '@/app/app/video/_hooks/useAnimateState'
import { requireVideoModel, getNodeCost } from '@/lib/video/models'

function render(overrides: Partial<AnimateState> = {}, available = true) {
  const state = { ...initialAnimateState(2500), ...overrides }
  const model = requireVideoModel(state.modelId)
  return renderToStaticMarkup(createElement(AnimatePanel, {
    state, model, resolvedMotion: resolveMotion(state), dispatch: () => {},
    nodeCost: getNodeCost(model.id, state.duration),
    availableModelIds: available ? [model.id] : [], onGenerate: () => {},
  }))
}

describe('contrato do painel Animar', () => {
  it('não libera geração antes de carregar uma imagem', () => {
    expect(render()).toContain('disabled="">Envie uma imagem</button>')
  })

  it('libera geração com referência, saldo e integração disponível', () => {
    expect(render({ imageFile: {} as File })).toContain('class="spn-cta">Gerar vídeo</button>')
  })

  it('saldo insuficiente bloqueia geração e informa a diferença', () => {
    const panel = render({ imageFile: {} as File, credits: 299 })
    expect(panel).toContain('disabled="">Saldo insuficiente</button>')
    expect(panel).toContain('Faltam 1 Nodes.')
    expect(panel).toContain('Adicionar Nodes')
  })

  it('integração indisponível bloqueia a geração mesmo com saldo', () => {
    expect(render({ imageFile: {} as File }, false)).toContain('disabled="">Motor indisponível</button>')
  })

  it('durante a geração o motor, a duração e o botão ficam bloqueados', () => {
    const panel = render({ imageFile: {} as File, status: 'generating' })
    expect(panel).toContain('disabled="">Gerando vídeo…</button>')
    expect(panel).toMatch(/id="animate-variant"[^>]*disabled=""/)
    expect(panel).toMatch(/id="animate-duration"[^>]*disabled=""/)
  })
})
