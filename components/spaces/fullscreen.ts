/**
 * Os overlays de tela cheia do Spaces (Retocar, lightbox da Vista Mestre,
 * SynapticLoading) não são folha: eles TOMAM a tela em vez de subir sobre
 * ela. Mas o véu deles era um valor diferente em cada arquivo — 0,74 / 0,92 /
 * 0,96 de preto com blur de 6, 10, 18 e 20px, nenhum com o fallback de
 * acessibilidade.
 *
 * Aqui o véu é um só: `.spn-overlay` (que já traz o borrão e degrada em
 * `prefers-reduced-transparency`) com o token forte, promovido de absolute
 * para fixed. O que sobra de inline é só geometria e o token — nada de
 * `backdropFilter`, nada de rgba literal.
 */
export const FULLSCREEN_OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--color-scrim-strong)',
}

/**
 * Variante para overlay que é uma TELA (cabeçalho + corpo), não um palco
 * centrado: `.spn-overlay` centraliza tudo, e aqui o conteúdo precisa
 * esticar. A cor volta a herdar do app para os dois temas continuarem
 * valendo dentro do overlay.
 */
export const FULLSCREEN_SCREEN: React.CSSProperties = {
  ...FULLSCREEN_OVERLAY,
  alignItems: 'stretch',
  justifyContent: 'flex-start',
  color: 'inherit',
  textAlign: 'left',
  gap: 0,
}
