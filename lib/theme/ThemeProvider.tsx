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

const preference = createBrowserPreference<ThemePreference>({
  key: STORAGE_KEY,
  fallback: 'system',
  parse: raw => raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null,
  apply: value => applyToDocument(resolve(value)),
})

function subscribeSystem(listener: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const onChange = () => {
    if (preference.getSnapshot() === 'system') applyToDocument(resolve('system'))
    listener()
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const serverPrefersLight = () => false

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR stays stable; React reads browser preferences after hydration without
  // resetting the class already applied by the inline anti-flash script.
  const theme = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getServerSnapshot)
  const prefersLight = useSyncExternalStore(subscribeSystem, systemPrefersLight, serverPrefersLight)
  const resolvedTheme: ResolvedTheme = theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme

  useEffect(() => {
    if (preference.hasPreference()) return
    const revision = preference.getRevision()
    let cancelled = false
    // Sem preferência local (device novo): adota a do perfil, se logado.
    // getSession é local (sem rede); o select só roda com sessão ativa.
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
          if (!cancelled) preference.adoptRemote(remote, revision)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  const setTheme = useCallback((pref: ThemePreference) => {
    preference.set(pref)

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
