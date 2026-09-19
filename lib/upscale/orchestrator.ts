// Orchestrator — recebe uma intenção do usuário (UpscaleRunRequest) e
// executa o pipeline correspondente, com fallback silencioso quando o
// provider primário falha.
//
// Em v1 cada modo é um único step. A estrutura já suporta N steps em
// sequência (ex: denoise → upscale) para um lançamento futuro:
// basta estender PIPELINE_BY_MODE e a tipagem.
//
// Política de fallback:
//   - Os modos que AMPLIAM (Topaz) caem para o Clarity conservador se falharem.
//     O fallback é registrado em steps[].fallbackOf e a rota o expõe na
//     resposta (fallbackUsed) — a UI avisa o usuário que o resultado veio
//     de um provider generativo, não do preservador do modo.
//   - Os modos que só limpam (NAFNet/restauração) NÃO têm fallback: não existe
//     segundo motor equivalente, e cair num que amplia mudaria o pedido.
//
// O orchestrator NÃO toca nodes — débito/refund é responsabilidade da
// rota. Ele apenas retorna o que aconteceu para a rota persistir +
// decidir refund.

import { callTopaz }             from './providers/topaz'
import { callClarity }           from './providers/clarity'
import { callNafnetDenoise, callNafnetDeblur } from './providers/nafnet'
import { callPhotoRestoration } from './providers/photo-restoration'
import {
  effectiveFactor,
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
  /** Overrides de param do provider primário (ver providers/topaz.ts). */
  params?: Record<string, unknown>
}

// Os três modos que AMPLIAM passaram a usar o mesmo motor de precisão (Topaz
// High Fidelity V2) — antes, dois deles entravam direto no Clarity, que é
// difusão e reconstrói geometria quando falta informação (medições em
// MEDICOES.md). O que muda entre eles é o tratamento de artefato de
// compressão, não o motor:
//
//   - fidelity: fonte boa. Topaz decide sozinho quanto limpar (param omitido).
//   - recover:  fonte sabidamente comprimida — fix_compression explícito.
//   - smart:    refino discreto, mesma política do fidelity.
//
// Os modos da aba Aprimorar que NÃO ampliam seguem nos modelos especializados
// (NAFNet/photo-restoration): eles operam na resolução original e o Topaz não
// os substitui.
const PIPELINE_BY_MODE: Record<ModeId, StepDescriptor[]> = {
  fidelity: [{ provider: 'topaz',             fallback: 'clarity' }],
  recover:  [{ provider: 'topaz',             fallback: 'clarity', params: { fix_compression: 0.6 } }],
  denoise:  [{ provider: 'nafnet-denoise',    fallback: null      }],
  deblur:   [{ provider: 'nafnet-deblur',     fallback: null      }],
  restore:  [{ provider: 'photo-restoration', fallback: null      }],
  smart:    [{ provider: 'topaz',             fallback: 'clarity' }],
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
  // Fator EFETIVO: o que o motor entrega. Mandar o nominal (8) fazia o Topaz
  // clampar calado e o Clarity rejeitar o request inteiro.
  const scaleFac = effectiveFactor(req.scale)
  const steps:   StepLog[] = []

  // Megapixels de saída decidem o formato (PNG até o teto, JPEG acima) — quem
  // sabe as dimensões de entrada é a rota, não o provider.
  const outputMegapixels = req.inputDimensions
    ? (req.inputDimensions.width * req.inputDimensions.height * scaleFac * scaleFac) / 1_000_000
    : undefined

  let currentUrl = req.imageUrl
  const t0       = Date.now()

  for (const stepDef of pipeline) {
    const params = { ...stepDef.params, ...(outputMegapixels ? { outputMegapixels } : {}) }
    const primary = await runProvider(stepDef.provider, currentUrl, scaleFac, null, params)
    steps.push(primary)

    if (primary.status === 'completed') {
      currentUrl = (primary as StepLog & { outputUrl?: string }).outputUrl ?? currentUrl
      continue
    }

    // Step falhou. Tenta fallback se configurado. O fallback NÃO herda os
    // overrides do primário: eles são params do Topaz e o Clarity não os
    // conhece — um campo desconhecido derrubaria também a segunda tentativa.
    if (stepDef.fallback) {
      console.warn(
        '[upscale] %s falhou — caindo para %s. Motivo: %s',
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
  params?:     Record<string, unknown>,
): Promise<StepLog & { outputUrl?: string }> {
  const call = PROVIDER_REGISTRY[provider]
  try {
    const out = await call({ imageUrl, scale, params })
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
