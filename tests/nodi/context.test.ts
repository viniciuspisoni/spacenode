// Serviço de contexto: rota → módulo/projeto/vista. É o que faz o Nodi saber
// "onde" o usuário está — regressão aqui degrada saudação, sugestões e boost.

import { describe, expect, it } from 'vitest'
import { deriveNodiContext, describeUserAgent } from '@/lib/nodi/context'

describe('deriveNodiContext', () => {
  it('mapeia módulos do registry', () => {
    expect(deriveNodiContext('/app/generate').moduleId).toBe('renderizar')
    expect(deriveNodiContext('/app/video').moduleId).toBe('animar')
    expect(deriveNodiContext('/app/upscale').moduleId).toBe('ampliar')
    expect(deriveNodiContext('/app/finalizar').moduleId).toBe('finalizar')
    expect(deriveNodiContext('/app/apresentar/planta-humanizada').moduleId).toBe('planta_humanizada')
  })

  it('editar cobre /app/editar e /app/editar-v3', () => {
    expect(deriveNodiContext('/app/editar').moduleId).toBe('editar')
    expect(deriveNodiContext('/app/editar-v3').moduleId).toBe('editar')
  })

  it('spaces/new é fluxo de criação, sem projectId', () => {
    const ctx = deriveNodiContext('/app/spaces/new')
    expect(ctx.moduleId).toBe('spaces')
    expect(ctx.projectId).toBeNull()
  })

  it('projeto e vista abertos são extraídos da rota', () => {
    const ctx = deriveNodiContext('/app/spaces/abc-123/vistas/def-456')
    expect(ctx.moduleId).toBe('spaces')
    expect(ctx.projectId).toBe('abc-123')
    expect(ctx.vistaId).toBe('def-456')
  })

  it('áreas fixas: histórico, planos, dashboard (exact)', () => {
    expect(deriveNodiContext('/app/history').moduleId).toBe('historico')
    expect(deriveNodiContext('/app/billing').moduleId).toBe('planos')
    expect(deriveNodiContext('/app').moduleId).toBe('dashboard')
    // dashboard é exact: não pode engolir rotas desconhecidas de /app/*
    expect(deriveNodiContext('/app/qualquer-coisa').moduleId).toBeNull()
  })

  it('ignora query e hash', () => {
    expect(deriveNodiContext('/app/history?tab=edits#x').moduleId).toBe('historico')
  })
})

describe('describeUserAgent', () => {
  it('detecta Chrome no Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    expect(describeUserAgent(ua)).toEqual({ browser: 'Chrome', os: 'Windows' })
  })

  it('detecta Safari no iOS', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    expect(describeUserAgent(ua)).toEqual({ browser: 'Safari', os: 'iOS' })
  })

  it('não explode com UA vazio', () => {
    expect(describeUserAgent('')).toEqual({ browser: 'desconhecido', os: 'desconhecido' })
  })
})
