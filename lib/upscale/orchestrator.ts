// Orchestrator — recebe uma intenção do usuário (UpscaleRunRequest) e
// executa o pipeline correspondente, com fallback silencioso quando o
// provider primário falha.
//
// Em v1 cada modo é um único step. A estrutura já suporta N steps em
// sequência (ex: denoise → upscale) para um lançamento futuro:
// basta estender PIPELINE_BY_MODE e a tipagem.
//
// Política de fallback:
//   - "Alta Fidelidade" (Topaz) cai para Clarity conservador se falhar.
//     O fallback é registrado em steps[].fallbackOf e a rota o expõe na
//     resposta (fallbackUsed) — a UI avisa o usuário que o resultado veio
//     de um provider generativo, não do preservador do modo.
//   - Demais modos NÃO têm fallback (failures sobem como erro).
//
// O orchestrator NÃO toca nodes — débito/refund é responsabilidade da
// rota. Ele apenas retorna o que aconteceu para a rota persistir +
// decidir refund.

import { callTopaz }             from './providers/topaz'
import { callClarity }           from './providers/clarity'
import { callNafnetDenoise, callNafnetDeblur } from './providers/nafnet'
import { callPhotoRestoration } from './providers/photo-restoration'
import {
  scaleToFactor,
  UpscalePipelineError,
  type ModeId,
  type ProviderCall,
  type ProviderId,
  type StepLog,
  type UpscaleRunRequest,
  type UpscaleRunResult,
} from './types'

// ── Configuração de pipeline por modo ────────────────────────────────────────
// Em v1 cada modo é um único step. Para introduzir multi-step (ex: denoise
// seguido de upscale) basta acrescentar mais entradas no array.

interface StepDescriptor {
  provider: ProviderId
  /** Provider de fallback caso o primário falhe. null = sem fallback. */
  fallback: ProviderId | null
}

const PIPELINE_BY_MODE: Record<ModeId, StepDescriptor[]> = {
  fidelity: [{ provider: 'topaz',             fallback: 'clarity' }],
  recover:  [{ provider: 'clarity',           fallback: null      }],
  denoise:  [{ provider: 'nafnet-denoise',    fallback: null      }],
  deblur:   [{ provider: 'nafnet-deblur',     fallback: null      }],
  restore:  [{ provider: 'photo-restoration', fallback: null      }],
  smart:    [{ provider: 'clarity',           fallback: null      }],
}

const PROVIDER_REGISTRY: Record<ProviderId, ProviderCall> = {
  'topaz':             callTopaz,
  'clarity':           callClarity,
  'nafnet-denoise':    callNafnetDenoise,
  'nafnet-deblur':     callNafnetDeblur,
  'photo-restoration': callPhotoRestoration,
}

// ── Executor ────────────────────────────────────────────────────────────────

export async function runUpscalePipeline(
  req: UpscaleRunRequest,
): Promise<UpscaleRunResult> {
  const pipeline = PIPELINE_BY_MODE[req.modeId]
  const scaleFac = scaleToFactor(req.scale)
  const steps:   StepLog[] = []

  let currentUrl = req.imageUrl
  const t0       = Date.now()

  for (const stepDef of pipeline) {
    const primary = await runProvider(stepDef.provider, currentUrl, scaleFac, null)
    steps.push(primary)

    if (primary.status === 'completed') {
      currentUrl = (primary as StepLog & { outputUrl?: string }).outputUrl ?? currentUrl
      continue
    }

    // Step falhou. Tenta fallback silencioso se configurado.
    if (stepDef.fallback) {
      console.warn(
        '[upscale] %s falhou — caindo para %s (silencioso). Motivo: %s',
        stepDef.provider, stepDef.fallback, primary.error,
      )
      const fb = await runProvider(stepDef.fallback, currentUrl, scaleFac, stepDef.provider)
      steps.push(fb)
      if (fb.status === 'completed') {
        currentUrl = (fb as StepLog & { outputUrl?: string }).outputUrl ?? currentUrl
        continue
      }
    }

    // Sem fallback ou fallback também falhou — pipeline para aqui.
    throw new UpscalePipelineError(
      `step ${stepDef.provider} failed and no successful fallback`,
      steps,
    )
  }

  return {
    outputUrl:        currentUrl,
    steps,
    totalDurationMs:  Date.now() - t0,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function runProvider(
  provider:    ProviderId,
  imageUrl:    string,
  scale:       number,
  fallbackOf:  ProviderId | null,
): Promise<StepLog & { outputUrl?: string }> {
  const call = PROVIDER_REGISTRY[provider]
  try {
    const out = await call({ imageUrl, scale })
    return {
      provider,
      endpoint:    out.endpoint,
      params:      out.rawParams,
      requestId:   out.requestId,
      durationMs:  out.durationMs,
      status:      'completed',
      error:       null,
      fallbackOf,
      outputUrl:   out.imageUrl,
    }
  } catch (err) {
    const e = err as Error
    return {
      provider,
      endpoint:    '',
      params:      {},
      requestId:   null,
      durationMs:  0,
      status:      'failed',
      error:       e?.message ?? 'unknown error',
      fallbackOf,
    }
  }
}

// Útil para a UI montar o label do histórico — devolve o provider FINAL que
// efetivamente produziu o output.
export function finalProvider(result: UpscaleRunResult): ProviderId | null {
  for (let i = result.steps.length - 1; i >= 0; i--) {
    if (result.steps[i].status === 'completed') return result.steps[i].provider
  }
  return null
}
