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

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

type ThemeContextValue = {
  /** Preferência escolhida pelo usuário (system | light | dark) */
  theme: ThemePreference
  /** Tema efetivamente aplicado depois de resolver "system" */
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {}
  return 'system'
}

function systemPrefersLight(): boolean {
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return systemPrefersLight() ? 'light' : 'dark'
}

function applyToDocument(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('light', resolved === 'light')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 'dark' como default de SSR — o script inline do layout já aplicou a classe
  // correta antes da hidratação, então não há flash; o estado converge no mount.
  const [theme, setThemeState] = useState<ThemePreference>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')

  useEffect(() => {
    const pref = readStoredPreference()
    setThemeState(pref)
    setResolvedTheme(resolve(pref))

    // Sem preferência local (device novo): adota a do perfil, se logado.
    // getSession é local (sem rede); o select só roda com sessão ativa.
    if (localStorage.getItem(STORAGE_KEY) !== null) return
    void (async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase
          .from('profiles')
          .select('theme_preference')
          .eq('id', session.user.id)
          .single()
        const remote = data?.theme_preference
        if (remote === 'light' || remote === 'dark' || remote === 'system') {
          localStorage.setItem(STORAGE_KEY, remote)
          setThemeState(remote)
          const next = resolve(remote)
          setResolvedTheme(next)
          applyToDocument(next)
        }
      } catch {}
    })()
  }, [])

  // Segue mudanças do SO enquanto a preferência for "system"
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      const next = resolve('system')
      setResolvedTheme(next)
      applyToDocument(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // Sincroniza entre abas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const pref = readStoredPreference()
      setThemeState(pref)
      const next = resolve(pref)
      setResolvedTheme(next)
      applyToDocument(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref)
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch {}
    const next = resolve(pref)
    setResolvedTheme(next)
    applyToDocument(next)

    // Persistência no perfil (cross-device) — fire-and-forget; a coluna pode
    // não existir ou o usuário pode estar deslogado, ambos são não-fatais.
    void (async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        await supabase
          .from('profiles')
          .update({ theme_preference: pref })
          .eq('id', user.id)
      } catch {}
    })()
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}
