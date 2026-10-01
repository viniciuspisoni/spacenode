export interface JobResponse {
  jobId?: string; status?: string; url?: string; inputUrl?: string;
  previewUrl?: string; beforePreviewUrl?: string;
  outputWidth?: number; outputHeight?: number; outputBytes?: number;
  effectiveFactor?: number; sourceKind?: string; nodesCharged?: number;
  error?: string; inputDimensions?: { width: number; height: number }; modeId?: string;
}
export const PENDING_UPSCALE = 'spacenode-upscale-pending'

/** Read-only: uma conexão interrompida não reenvia o pedido nem o débito. */
export async function waitForUpscaleJob(id: string, cancelled: () => boolean = () => false): Promise<JobResponse | null> {
  const deadline = Date.now() + 330_000
  while (!cancelled() && Date.now() < deadline) {
    const response = await fetch('/api/upscale?jobId=' + encodeURIComponent(id), { cache: 'no-store' }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as JobResponse | null : null
    if (response?.ok && data && response.status !== 202) return data
    if (response?.status === 401 || response?.status === 404) {
      throw new Error('Não foi possível recuperar esta geração. Confira o histórico antes de tentar novamente.')
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  if (cancelled()) return null
  throw new Error('Não foi possível confirmar o resultado. Consulte o histórico antes de gerar novamente.')
}
