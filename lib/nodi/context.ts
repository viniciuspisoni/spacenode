// ── Serviço de contexto do Nodi ───────────────────────────────────────────────
//
// Deriva "onde o usuário está" a partir do pathname. Puro e client-safe: a
// mesma função roda no painel (pra saudação/sugestões imediatas) e no servidor
// (pra sugestões e boost de relevância da base de conhecimento).
//
// Fonte de módulos: lib/nav/modules-config (única fonte da navegação). Áreas
// fixas fora do registry (Histórico, Conta…) entram aqui com id próprio.

import { SIDEBAR_MODULES } from '@/lib/nav/modules-config'
import type { NodiContext } from './types'

interface FixedArea {
  id: string
  label: string
  href: string
  exact?: boolean
}

// Ordem importa: prefixos mais específicos primeiro (ex.: /app/spaces/new
// antes de /app/spaces). O dashboard é exact-only pra não engolir tudo.
const FIXED_AREAS: FixedArea[] = [
  { id: 'historico',  label: 'Histórico',  href: '/app/history' },
  { id: 'planos',     label: 'Planos',     href: '/app/billing' },
  { id: 'conta',      label: 'Conta',      href: '/app/conta' },
  { id: 'equipe',     label: 'Equipe',     href: '/app/equipe' },
  { id: 'identidade', label: 'Identidade', href: '/app/settings/identity' },
  { id: 'editar',     label: 'Editar',     href: '/app/editar-v3' },
  { id: 'dashboard',  label: 'Dashboard',  href: '/app', exact: true },
]

const SPACES_ROUTE = /^\/app\/spaces\/([^/]+)(?:\/vistas\/([^/]+))?/

/** Deriva o contexto de página do Nodi a partir do pathname atual. */
export function deriveNodiContext(pathname: string): NodiContext {
  const route = pathname.split('?')[0].split('#')[0]

  // Projeto/vista abertos (rotas /app/spaces/[spaceId]/…). "new" e "new/…"
  // são o fluxo de criação, não um projeto existente.
  let projectId: string | null = null
  let vistaId: string | null = null
  const spaceMatch = route.match(SPACES_ROUTE)
  if (spaceMatch && spaceMatch[1] !== 'new') {
    projectId = spaceMatch[1]
    vistaId = spaceMatch[2] ?? null
  }

  // Módulos do registry — prefixo mais longo vence (spaces/new antes de spaces).
  const byLongestHref = [...SIDEBAR_MODULES].sort((a, b) => b.href.length - a.href.length)
  for (const m of byLongestHref) {
    if (route === m.href || route.startsWith(m.href + '/')) {
      return { route, moduleId: m.id, moduleLabel: m.label, projectId, vistaId }
    }
  }

  // Qualquer /app/spaces/… restante ainda é o módulo Spaces (o registry só
  // aponta pro fluxo de criação /app/spaces/new).
  if (route.startsWith('/app/spaces')) {
    const spaces = SIDEBAR_MODULES.find(m => m.id === 'spaces')
    return { route, moduleId: 'spaces', moduleLabel: spaces?.label ?? 'Spaces', projectId, vistaId }
  }

  for (const area of FIXED_AREAS) {
    const hit = area.exact ? route === area.href : route === area.href || route.startsWith(area.href + '/')
    if (hit) {
      return { route, moduleId: area.id, moduleLabel: area.label, projectId, vistaId }
    }
  }

  return { route, moduleId: null, moduleLabel: null, projectId, vistaId }
}

/** Navegador + SO legíveis a partir do user-agent (pro chamado). Best-effort. */
export function describeUserAgent(ua: string): { browser: string; os: string } {
  let browser = 'desconhecido'
  if (/edg\//i.test(ua)) browser = 'Edge'
  else if (/opr\//i.test(ua)) browser = 'Opera'
  else if (/chrome\//i.test(ua)) browser = 'Chrome'
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = 'Safari'
  else if (/firefox\//i.test(ua)) browser = 'Firefox'

  let os = 'desconhecido'
  if (/windows nt/i.test(ua)) os = 'Windows'
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS'
  else if (/mac os x/i.test(ua)) os = 'macOS'
  else if (/android/i.test(ua)) os = 'Android'
  else if (/linux/i.test(ua)) os = 'Linux'

  return { browser, os }
}
