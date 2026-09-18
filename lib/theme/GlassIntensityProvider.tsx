'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'

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

function readStoredIntensity(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null) return null
    const n = Number(v)
    return Number.isFinite(n) ? clamp(n) : null
  } catch {
    return null
  }
}

/** Mesmo mecanismo do tema: propriedade custom em <html>, lida por TODO
 *  token --glass-* via calc() — nenhum componente aplica isto sozinho. */
function applyToDocument(value: number) {
  document.documentElement.style.setProperty('--glass-intensity', String(value))
}

export function GlassIntensityProvider({ children }: { children: ReactNode }) {
  // O script anti-flash do layout já aplicou o valor salvo antes do
  // primeiro paint; o estado converge no mount, sem flash perceptível
  // (a variação de intensidade é sutil — não é o corte claro/escuro).
  const [glassIntensity, setGlassIntensityState] = useState<number>(DEFAULT_INTENSITY)

  useEffect(() => {
    const stored = readStoredIntensity()
    if (stored !== null) {
      setGlassIntensityState(stored)
      applyToDocument(stored)
      return
    }

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
          const clamped = clamp(remote)
          localStorage.setItem(STORAGE_KEY, String(clamped))
          setGlassIntensityState(clamped)
          applyToDocument(clamped)
        }
      } catch {}
    })()
  }, [])

  // Sincroniza entre abas.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const stored = readStoredIntensity()
      if (stored === null) return
      setGlassIntensityState(stored)
      applyToDocument(stored)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setGlassIntensity = useCallback((value: number) => {
    const clamped = clamp(value)
    setGlassIntensityState(clamped)
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped))
    } catch {}
    applyToDocument(clamped)

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
