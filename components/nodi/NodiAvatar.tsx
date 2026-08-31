// ── Nodi — a marca do assistente ──────────────────────────────────────────────
//
// Personagem geométrico próprio do Nodi: quatro nós conectados em losango
// (ciclo fechado = diálogo), irmão do "N" da constelação oficial — mesma
// gramática (nós r=3, traço 1.5, monocromático), arranjo próprio. O logotipo
// oficial (ConstellationN/Logo) segue intocado; este símbolo é só do Nodi.
//
// Estados animados (discretos, definidos em globals.css · seção "Nodi"):
//   idle      — respiração sutil do nó superior
//   thinking  — pulso sequencial percorrendo o ciclo (análise/espera)
//   success   — nó superior acende em verde funcional (único acento)
//   error     — símbolo esmaecido, sem movimento (o painel comunica o erro)
//   muted     — linhas tracejadas: conexão indisponível
//
// prefers-reduced-motion desliga tudo (também no CSS).

export type NodiAvatarState = 'idle' | 'thinking' | 'success' | 'error' | 'muted'

interface NodiAvatarProps {
  size?: number
  state?: NodiAvatarState
  /** Rótulo acessível; omitido = decorativo (aria-hidden). */
  title?: string
}

export default function NodiAvatar({ size = 24, state = 'idle', title }: NodiAvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={`spn-nodi-avatar spn-nodi-avatar--${state}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      shapeRendering="geometricPrecision"
    >
      <g
        className="spn-nodi-avatar__links"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <line x1="32" y1="13" x2="51" y2="32" />
        <line x1="51" y1="32" x2="32" y2="51" />
        <line x1="32" y1="51" x2="13" y2="32" />
        <line x1="13" y1="32" x2="32" y2="13" />
      </g>
      {/* Ordem dos nós = sentido do pulso "thinking": topo → direita → base → esquerda */}
      <g className="spn-nodi-avatar__nodes" fill="currentColor">
        <circle className="spn-nodi-avatar__node spn-nodi-avatar__node--lead" cx="32" cy="13" r="3" />
        <circle className="spn-nodi-avatar__node" cx="51" cy="32" r="3" />
        <circle className="spn-nodi-avatar__node" cx="32" cy="51" r="3" />
        <circle className="spn-nodi-avatar__node" cx="13" cy="32" r="3" />
      </g>
    </svg>
  )
}
