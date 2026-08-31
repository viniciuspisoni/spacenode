// Máquinas de status da mídia paga — a regra dura do sistema: campanha/anúncio
// NUNCA nasce ativo, e ativar gasto exige ação humana aprovada. Estes testes
// fixam as transições de lib/marketing/ads/workflow.ts.

import { describe, expect, it } from 'vitest'
import {
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  AD_STATUS_LABELS,
  AD_STATUSES,
  ALERT_STATUS_LABELS,
  ALERT_STATUSES,
  assertAdTransition,
  assertCampaignTransition,
  assertExperimentTransition,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  canTransitionAction,
  canTransitionAd,
  canTransitionCampaign,
  canTransitionExperiment,
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_STATUSES,
  isActionStatus,
  isAdStatus,
  isAlertStatus,
  isCampaignStatus,
  isExperimentStatus,
  nextAdStatuses,
  nextCampaignStatuses,
  nextExperimentStatuses,
  transitionRequiresApproval,
} from '@/lib/marketing/ads/workflow'

describe('máquina de campanha', () => {
  it('caminho feliz completo é válido', () => {
    expect(canTransitionCampaign('draft', 'pending_approval')).toBe(true)
    expect(canTransitionCampaign('pending_approval', 'approved')).toBe(true)
    expect(canTransitionCampaign('approved', 'published_paused')).toBe(true)
    expect(canTransitionCampaign('published_paused', 'active')).toBe(true)
    expect(canTransitionCampaign('active', 'paused')).toBe(true)
    expect(canTransitionCampaign('paused', 'active')).toBe(true)
    expect(canTransitionCampaign('active', 'completed')).toBe(true)
    expect(canTransitionCampaign('completed', 'archived')).toBe(true)
  })

  it('nunca nasce ativa nem pula etapas', () => {
    expect(canTransitionCampaign('draft', 'active')).toBe(false)
    expect(canTransitionCampaign('draft', 'published_paused')).toBe(false)
    expect(canTransitionCampaign('approved', 'active')).toBe(false)
    expect(canTransitionCampaign('active', 'draft')).toBe(false)
  })

  it('archived é terminal', () => {
    expect(nextCampaignStatuses('archived')).toHaveLength(0)
    for (const to of CAMPAIGN_STATUSES) {
      expect(canTransitionCampaign('archived', to)).toBe(false)
    }
  })

  it('assert lança mensagem PT-BR na transição inválida', () => {
    expect(() => assertCampaignTransition('draft', 'active')).toThrow('Transição de status inválida: draft → active')
    expect(() => assertCampaignTransition('draft', 'pending_approval')).not.toThrow()
  })
})

describe('máquina de anúncio', () => {
  it('caminho feliz completo é válido', () => {
    expect(canTransitionAd('draft', 'ready_for_review')).toBe(true)
    expect(canTransitionAd('ready_for_review', 'pending_approval')).toBe(true)
    expect(canTransitionAd('pending_approval', 'approved')).toBe(true)
    expect(canTransitionAd('approved', 'published_paused')).toBe(true)
    expect(canTransitionAd('published_paused', 'active')).toBe(true)
    expect(canTransitionAd('active', 'paused')).toBe(true)
    expect(canTransitionAd('paused', 'active')).toBe(true)
    expect(canTransitionAd('active', 'ended')).toBe(true)
    expect(canTransitionAd('ended', 'archived')).toBe(true)
  })

  it('revisão pode voltar a rascunho; ativo não pode', () => {
    expect(canTransitionAd('ready_for_review', 'draft')).toBe(true)
    expect(canTransitionAd('pending_approval', 'draft')).toBe(true)
    expect(canTransitionAd('active', 'draft')).toBe(false)
  })

  it('nunca nasce ativo; encerrado não volta ao ar', () => {
    expect(canTransitionAd('draft', 'active')).toBe(false)
    expect(canTransitionAd('ended', 'active')).toBe(false)
  })

  it('archived é terminal', () => {
    expect(nextAdStatuses('archived')).toHaveLength(0)
  })

  it('assert lança na transição inválida', () => {
    expect(() => assertAdTransition('draft', 'active')).toThrow('Transição de status inválida')
    expect(() => assertAdTransition('draft', 'ready_for_review')).not.toThrow()
  })
})

describe('máquina de experimento', () => {
  it('planejado roda; rodando conclui em qualquer veredito', () => {
    expect(canTransitionExperiment('planned', 'running')).toBe(true)
    expect(canTransitionExperiment('running', 'validated')).toBe(true)
    expect(canTransitionExperiment('running', 'invalidated')).toBe(true)
    expect(canTransitionExperiment('running', 'inconclusive')).toBe(true)
    expect(canTransitionExperiment('running', 'abandoned')).toBe(true)
  })

  it('inconclusivo pode voltar a rodar (mais amostra) ou ser concluído', () => {
    expect(canTransitionExperiment('inconclusive', 'running')).toBe(true)
    expect(canTransitionExperiment('inconclusive', 'validated')).toBe(true)
    expect(canTransitionExperiment('inconclusive', 'invalidated')).toBe(true)
  })

  it('planejado não conclui sem rodar', () => {
    expect(canTransitionExperiment('planned', 'validated')).toBe(false)
    expect(canTransitionExperiment('planned', 'inconclusive')).toBe(false)
  })

  it('validated/invalidated/abandoned são terminais', () => {
    for (const from of ['validated', 'invalidated', 'abandoned'] as const) {
      expect(nextExperimentStatuses(from)).toHaveLength(0)
    }
  })

  it('assert lança na transição inválida', () => {
    expect(() => assertExperimentTransition('validated', 'running')).toThrow('Transição de status inválida')
  })
})

describe('máquina de ação de aprovação', () => {
  it('pendente decide; aprovada executa/falha/cancela', () => {
    expect(canTransitionAction('pending', 'approved')).toBe(true)
    expect(canTransitionAction('pending', 'rejected')).toBe(true)
    expect(canTransitionAction('pending', 'canceled')).toBe(true)
    expect(canTransitionAction('approved', 'executed')).toBe(true)
    expect(canTransitionAction('approved', 'failed')).toBe(true)
    expect(canTransitionAction('approved', 'canceled')).toBe(true)
  })

  it('falha pode ser re-solicitada; decisão não se desfaz', () => {
    expect(canTransitionAction('failed', 'pending')).toBe(true)
    expect(canTransitionAction('rejected', 'pending')).toBe(false)
    expect(canTransitionAction('executed', 'pending')).toBe(false)
    expect(canTransitionAction('canceled', 'pending')).toBe(false)
  })

  it('pendente não executa sem aprovação', () => {
    expect(canTransitionAction('pending', 'executed')).toBe(false)
  })
})

describe('transitionRequiresApproval — o sistema nunca ativa gasto sozinho', () => {
  it('exige aprovação exatamente nos dois pares que ligam veiculação', () => {
    expect(transitionRequiresApproval('published_paused', 'active')).toBe(true)
    expect(transitionRequiresApproval('paused', 'active')).toBe(true)
  })

  it('não exige aprovação fora deles (pausar é sempre permitido)', () => {
    expect(transitionRequiresApproval('active', 'paused')).toBe(false)
    expect(transitionRequiresApproval('approved', 'published_paused')).toBe(false)
    expect(transitionRequiresApproval('draft', 'pending_approval')).toBe(false)
  })
})

describe('guards de status', () => {
  it('aceitam os valores das máquinas e rejeitam lixo', () => {
    expect(isCampaignStatus('draft')).toBe(true)
    expect(isCampaignStatus('ready_for_review')).toBe(false)  // status de anúncio, não de campanha
    expect(isAdStatus('ready_for_review')).toBe(true)
    expect(isAdStatus('completed')).toBe(false)               // status de campanha, não de anúncio
    expect(isExperimentStatus('inconclusive')).toBe(true)
    expect(isExperimentStatus('running!')).toBe(false)
    expect(isActionStatus('executed')).toBe(true)
    expect(isActionStatus(null)).toBe(false)
    expect(isAlertStatus('acknowledged')).toBe(true)
    expect(isAlertStatus(42)).toBe(false)
  })
})

describe('labels PT-BR cobrem todos os status', () => {
  it('campanha', () => {
    for (const s of CAMPAIGN_STATUSES) expect(CAMPAIGN_STATUS_LABELS[s]).toBeTruthy()
  })
  it('anúncio', () => {
    for (const s of AD_STATUSES) expect(AD_STATUS_LABELS[s]).toBeTruthy()
  })
  it('experimento', () => {
    for (const s of EXPERIMENT_STATUSES) expect(EXPERIMENT_STATUS_LABELS[s]).toBeTruthy()
  })
  it('ação', () => {
    for (const s of ACTION_STATUSES) expect(ACTION_STATUS_LABELS[s]).toBeTruthy()
  })
  it('alerta', () => {
    for (const s of ALERT_STATUSES) expect(ALERT_STATUS_LABELS[s]).toBeTruthy()
  })
})
