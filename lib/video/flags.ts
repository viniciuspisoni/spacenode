// Feature flags do módulo Animar. Lidas a partir de NEXT_PUBLIC_* para
// ficarem disponíveis no client e no server. Default OFF — qualquer
// integração com Google Flow ou Gemini Omni só liga via env explícita.
//
// NEXT_PUBLIC_ENABLE_GOOGLE_FLOW=1         libera o adapter googleFlow (ainda placeholder)
// NEXT_PUBLIC_ENABLE_GEMINI_OMNI=1         libera o adapter omni (ainda placeholder)
// NEXT_PUBLIC_ENABLE_AUTO_VIDEO_ANALYSIS=1 ativa análise automática da imagem
//                                          de referência via fidelity-engine

function flag(name: string): boolean {
  const v = process.env[name]
  return v === '1' || v === 'true'
}

export const VIDEO_FLAGS = {
  enableGoogleFlow:        flag('NEXT_PUBLIC_ENABLE_GOOGLE_FLOW'),
  enableGeminiOmni:        flag('NEXT_PUBLIC_ENABLE_GEMINI_OMNI'),
  enableAutoVideoAnalysis: flag('NEXT_PUBLIC_ENABLE_AUTO_VIDEO_ANALYSIS'),
} as const

export type VideoFlags = typeof VIDEO_FLAGS
