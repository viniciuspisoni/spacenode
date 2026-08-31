// lib/marketing/catalog.ts
//
// Vocabulários editoriais para os selects do painel. Fontes:
// docs/marketing/content-pillars.md (12 pilares) e content-formats.md.
// A cópia canônica lida por máquina vive em marketing.brand_rules
// (content_pillars / approved_formats); este arquivo é a versão estática para
// UI — mudou lá, refletir aqui.

export const PILLARS = [
  { slug: 'antes-e-depois',              label: 'Antes e depois' },
  { slug: 'fidelidade-geometrica',       label: 'Fidelidade geométrica' },
  { slug: 'coerencia-entre-angulos',     label: 'Coerência entre ângulos' },
  { slug: 'produtividade',               label: 'Produtividade para arquitetos' },
  { slug: 'tutoriais-rapidos',           label: 'Tutoriais rápidos' },
  { slug: 'demonstracao-de-ferramentas', label: 'Demonstração de ferramentas' },
  { slug: 'bastidores',                  label: 'Bastidores do desenvolvimento' },
  { slug: 'erros-comuns',                label: 'Erros comuns em imagens de IA' },
  { slug: 'estudos-de-caso',             label: 'Estudos de caso' },
  { slug: 'educativo-apresentacao',      label: 'Apresentação de projetos (educativo)' },
  { slug: 'tradicional-vs-spacenode',    label: 'Tradicional vs. SpaceNode' },
  { slug: 'novidades',                   label: 'Novidades do produto' },
] as const

export const FORMATS = [
  { slug: 'post_estatico',         label: 'Post estático' },
  { slug: 'antes_depois',          label: 'Antes e depois' },
  { slug: 'carrossel_educativo',   label: 'Carrossel educativo' },
  { slug: 'carrossel_estudo_caso', label: 'Carrossel de estudo de caso' },
  { slug: 'tres_angulos',          label: 'Três ângulos do mesmo projeto' },
  { slug: 'tutorial_carrossel',    label: 'Tutorial em carrossel' },
  { slug: 'reel_demonstrativo',    label: 'Reel demonstrativo' },
  { slug: 'reel_produto',          label: 'Reel de produto' },
  { slug: 'video_anuncio',         label: 'Vídeo curto para anúncio' },
  { slug: 'story',                 label: 'Story' },
  { slug: 'lancamento',            label: 'Lançamento' },
  { slug: 'prova_social',          label: 'Prova social' },
  { slug: 'remarketing',           label: 'Remarketing' },
] as const

export const PLATFORMS = [
  { slug: 'instagram', label: 'Instagram' },
  { slug: 'meta_ads',  label: 'Meta Ads (futuro)' },
  { slug: 'youtube',   label: 'YouTube' },
  { slug: 'site',      label: 'Site' },
  { slug: 'other',     label: 'Outra' },
] as const

export const APPROVED_CTAS = [
  'Renderize seu projeto',
  'Teste com um projeto real',
  'Comece agora',
  'Veja no seu próprio projeto',
  'Comece grátis',
] as const

export function pillarLabel(slug: string | null | undefined): string {
  if (!slug) return 'sem pilar'
  return PILLARS.find(p => p.slug === slug)?.label ?? slug
}

export function formatLabel(slug: string | null | undefined): string {
  if (!slug) return 'sem formato'
  return FORMATS.find(f => f.slug === slug)?.label ?? slug
}
