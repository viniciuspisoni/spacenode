// Guardas do fluxo guiado de primeiro render (/app/comecar).
//
// O fluxo não expõe nenhuma configuração: ele deriva a taxonomia dos mesmos
// helpers de lib/prompts que o /app/generate usa, e fixa engine/resolução. Se
// um segmento for renomeado em lib/prompts ou o custo do Pulsar 2K passar do
// saldo de cadastro, o onboarding quebra silenciosamente — mandando taxonomia
// vazia pro prompt ou levando o usuário a um 402 no primeiro clique. Estes
// testes falham antes disso chegar em produção.

import { describe, it, expect } from 'vitest'
import { getSegments, getEnvironments, getLighting, getBackgrounds } from '@/lib/prompts'
import { getNodesCost, isValidCombination } from '@/lib/engines'

// Espelham as constantes de app/app/comecar/FirstRunClient.tsx.
const ENGINE      = 'pulsar' as const
const RESOLUTION  = '2k' as const
const SEGMENT     = 'Residencial'
const SIGNUP_NODES = 40 // profiles.credits default (migration 20260529000000)

describe('taxonomia default do primeiro render', () => {
  for (const projectType of ['exterior', 'interior'] as const) {
    describe(projectType, () => {
      it(`tem o segmento "${SEGMENT}"`, () => {
        expect(getSegments(projectType)).toContain(SEGMENT)
      })

      it('resolve um ambiente não vazio', () => {
        expect(getEnvironments(projectType, SEGMENT)[0]).toBeTruthy()
      })

      it('resolve uma iluminação não vazia', () => {
        expect(getLighting(projectType, SEGMENT)[0]).toBeTruthy()
      })

      it('resolve um contexto/entorno não vazio', () => {
        expect(getBackgrounds(projectType)[0]).toBeTruthy()
      })
    })
  }
})

describe('custo da primeira geração', () => {
  it('usa uma combinação engine × resolução válida', () => {
    expect(isValidCombination(ENGINE, RESOLUTION)).toBe(true)
  })

  it('cabe no saldo de cadastro com folga para uma segunda tentativa', () => {
    const cost = getNodesCost(ENGINE, RESOLUTION)
    expect(cost).toBeGreaterThan(0)
    expect(cost * 2).toBeLessThanOrEqual(SIGNUP_NODES)
  })
})
