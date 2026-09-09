// ── Módulos do atelier (CRIAR / APRESENTAR) ───────────────────────────────────
//
// Fonte única de verdade para os módulos exibidos na sidebar e no dashboard.
// Desativar um módulo aqui (enabled: false) some com ele da navegação e do
// dashboard sem remover a rota, o componente ou o código por trás — a
// ferramenta continua acessível por URL direta.
//
// Para reativar "Apresentar", basta virar `enabled: true` nos itens da
// seção 'apresentar' (a seção só aparece na sidebar quando tem pelo menos
// um item habilitado).

export type ModuleSection = 'criar' | 'apresentar'

export interface SidebarModule {
  id:      string
  label:   string
  href:    string
  section: ModuleSection
  iconKey: 'generate' | 'spaces' | 'retocar' | 'enhance' | 'video' | 'finalizar' | 'estudar' | 'humanizedPlan' | 'blocos3d' | 'isometric' | 'board' | 'moodboard'
  enabled: boolean
  beta?:   boolean
  /** Some só da sidebar, sem desabilitar o módulo — dashboard, Nodi e LPs continuam vendo. */
  hideInSidebar?: boolean
}

export const SIDEBAR_MODULES: SidebarModule[] = [
  { id: 'renderizar',       label: 'Renderizar',       href: '/app/generate',                     section: 'criar',      iconKey: 'generate',      enabled: true },
  // Spaces de volta ao CRIAR por feedback de beta (Muda): "não fica muito
  // claro que é uma ferramenta dali". Nomenclatura da UI: "Space(s)".
  { id: 'spaces',           label: 'Spaces',           href: '/app/spaces/new',                    section: 'criar',      iconKey: 'spaces',        enabled: true },
  { id: 'editar',           label: 'Editar',           href: '/app/editar',                        section: 'criar',      iconKey: 'retocar',       enabled: true },
  { id: 'ampliar',          label: 'Ampliar',          href: '/app/upscale',                       section: 'criar',      iconKey: 'enhance',       enabled: true },
  { id: 'animar',           label: 'Animar',           href: '/app/video',                         section: 'criar',      iconKey: 'video',         enabled: true },
  { id: 'finalizar',        label: 'Finalizar',        href: '/app/finalizar',                     section: 'criar',      iconKey: 'finalizar',     enabled: true },
  { id: 'estudar',          label: 'Estudar',          href: '/app/estudar',                       section: 'criar',      iconKey: 'estudar',       enabled: true, beta: true },
  { id: 'planta_humanizada',label: 'Planta humanizada',href: '/app/apresentar/planta-humanizada',  section: 'criar',      iconKey: 'humanizedPlan', enabled: true },
  { id: 'blocos_3d',        label: 'Blocos 3D',        href: '/app/blocos-3d',                     section: 'criar',      iconKey: 'blocos3d',      enabled: true, beta: true },

  { id: 'isometricas',      label: 'Isométricas',      href: '/app/apresentar/isometricas',        section: 'apresentar', iconKey: 'isometric',     enabled: false },
  { id: 'prancha_ia',       label: 'Prancha IA',       href: '/app/apresentar/prancha',            section: 'apresentar', iconKey: 'board',         enabled: false },
  { id: 'moodboard',        label: 'Moodboard',        href: '/app/apresentar/moodboard',          section: 'apresentar', iconKey: 'moodboard',     enabled: false },
]

export function getEnabledModules(section?: ModuleSection): SidebarModule[] {
  return SIDEBAR_MODULES.filter((m) => m.enabled && (section ? m.section === section : true))
}

/** Módulos exibidos na sidebar — habilitados e sem hideInSidebar. */
export function getSidebarModules(section?: ModuleSection): SidebarModule[] {
  return getEnabledModules(section).filter((m) => !m.hideInSidebar)
}
