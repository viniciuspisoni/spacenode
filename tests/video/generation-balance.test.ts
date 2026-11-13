import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVideoGeneration } from '@/app/app/video/_hooks/useVideoGeneration'
import { initialAnimateState } from '@/app/app/video/_hooks/useAnimateState'

vi.mock('@/lib/storage/direct-upload-client', () => ({
  uploadDirect: vi.fn(async () => ({ key: 'test/source.jpg' })),
}))

async function runGeneration(balance: { totalBalance?: number; credits?: number }) {
  const state = { ...initialAnimateState(2500), imageFile: new File(['test'], 'source.jpg', { type: 'image/jpeg' }) }
  const dispatch = vi.fn()
  let generate: (() => Promise<void>) | undefined
  function Harness() {
    generate = useVideoGeneration(state, dispatch, 300).generate
    return null
  }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ url: 'https://video.invalid/result.mp4', inputUrl: 'https://image.invalid/source.jpg', ...balance })))
  renderToStaticMarkup(createElement(Harness))
  await generate!()
  return dispatch.mock.calls.find(([action]) => action.type === 'generationSuccess')?.[0]
}

describe('saldo após a geração', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('mantém os Nodes extras no saldo utilizável do painel', async () => {
    expect(await runGeneration({ totalBalance: 2200, credits: 200 }))
      .toMatchObject({ newCredits: 2200 })
  })

  it('respeita saldo total zero sem recuperar o saldo legado', async () => {
    expect(await runGeneration({ totalBalance: 0, credits: 200 }))
      .toMatchObject({ newCredits: 0 })
  })

  it('continua compatível com uma resposta antiga sem saldo total', async () => {
    expect(await runGeneration({ credits: 200 }))
      .toMatchObject({ newCredits: 200 })
  })
})
