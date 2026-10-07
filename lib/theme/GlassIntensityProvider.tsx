'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { createBrowserPreference } from './browser-preference'

const STORAGE_KEY = 'glassIntensity'
/** Metade da régua — a receita de vidro que já está em produção hoje
 *  (ver app/globals.css, ":205"). Quem nunca abre o controle vive aqui. */
const DEFAULT_INTENSITY = 0.5

type GlassContextValue = {
  /** 0 = mais opaco, 1 = mais transparente. */
  glassIntensity: number
  setGlassIntensity: (value: number) => void
}

const GlassContext = createContext<GlassContextValue | null>(null)

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Mesmo mecanismo do tema: propriedade custom em <html>, lida por TODO
 *  token --glass-* via calc() — nenhum componente aplica isto sozinho. */
function applyToDocument(value: number) {
  document.documentElement.style.setProperty('--glass-intensity', String(value))
}

const preference = createBrowserPreference<number>({
  key: STORAGE_KEY,
  fallback: DEFAULT_INTENSITY,
  parse: raw => {
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? clamp(value) : null
  },
  apply: applyToDocument,
})

export function GlassIntensityProvider({ children }: { children: ReactNode }) {
  const glassIntensity = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getServerSnapshot)

  useEffect(() => {
    if (preference.hasPreference()) return
    const revision = preference.getRevision()
    let cancelled = false

    // Sem preferência local (device novo): adota a do perfil, se logado.
    void (async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase
          .from('profiles')
          .select('glass_intensity')
          .eq('id', session.user.id)
          .single()
        const remote = data?.glass_intensity
        if (typeof remote === 'number' && Number.isFinite(remote)) {
          if (!cancelled) preference.adoptRemote(clamp(remote), revision)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  const setGlassIntensity = useCallback((value: number) => {
    const clamped = clamp(value)
    if (!Number.isFinite(value)) return
    preference.set(clamped)

    // Persistência no perfil (cross-device) — fire-and-forget; a coluna
    // pode não existir ainda (migration não aplicada) ou o usuário pode
    // estar deslogado, ambos não-fatais (mesmo padrão do theme_preference).
    void (async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        await supabase
          .from('profiles')
          .update({ glass_intensity: clamped })
          .eq('id', user.id)
      } catch {}
    })()
  }, [])

  return (
    <GlassContext.Provider value={{ glassIntensity, setGlassIntensity }}>
      {children}
    </GlassContext.Provider>
  )
}

export function useGlassIntensity(): GlassContextValue {
  const ctx = useContext(GlassContext)
  if (!ctx) throw new Error('useGlassIntensity deve ser usado dentro de <GlassIntensityProvider>')
  return ctx
}
