/**
 * Ícones das linhas de ajuste.
 *
 * Mesmo sistema do plugin: grade 24, traço 1,5, pontas e junções redondas,
 * `currentColor`. Os quatro primeiros são cópia literal do painel v1
 * (`dialog.html:930-960`) — Cena, Luz, Fotografia e Saída precisam ser o
 * MESMO desenho nos dois produtos, senão o usuário que usa os dois vê duas
 * marcas. Os demais seguem a mesma grade.
 *
 * Regra herdada da toolbar (PR #185): a 16px cada elemento a mais vira
 * ruído. Nada de detalhe que não sobreviva a esse tamanho.
 */

const PATHS: Record<string, React.ReactNode> = {
  /* Cubo — cena, projeto, espaço. */
  scene: <>
    <path d="M3 16.5V7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5Z" />
    <path d="M3 7.5l9 4.5 9-4.5M12 12v9" />
  </>,
  /* Sol — luz e atmosfera. */
  light: <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
  </>,
  /* Câmera — enquadramento, lente, proporção. */
  photo: <>
    <path d="M3 8.5h3l1.5-2.5h9L18 8.5h3v10H3v-10Z" />
    <circle cx="12" cy="13" r="3.4" />
  </>,
  /* Faísca — saída, motor, qualidade. */
  output: <>
    <path d="M12 3.2l1.9 4.4 4.4 1.9-4.4 1.9L12 15.8l-1.9-4.4L5.7 9.5l4.4-1.9L12 3.2Z" />
    <path d="M18 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" />
  </>,
  /* Amostras sobrepostas — materiais e acabamentos. */
  materials: <>
    <rect x="3.2" y="3.2" width="9" height="9" rx="2.2" />
    <path d="M15.4 6.6h3.4a2 2 0 0 1 2 2v3.4" />
    <path d="M6.6 15.4v3.4a2 2 0 0 0 2 2h3.4" />
    <circle cx="17.2" cy="17.2" r="3.6" />
  </>,
  /* Trilho de câmera — movimento. */
  motion: <>
    <path d="M3.5 17.5h17" />
    <circle cx="7" cy="19.5" r="1.6" />
    <circle cx="17" cy="19.5" r="1.6" />
    <path d="M5.5 13.5V7a1.5 1.5 0 0 1 1.5-1.5h5.5L14 8h4.5v5.5Z" />
  </>,
  /* Molduras — formato e proporção. */
  format: <>
    <rect x="2.8" y="6" width="12.4" height="12" rx="2" />
    <path d="M18.2 8.5h1a2 2 0 0 1 2 2v3" />
    <path d="M18.2 4.5h1" />
  </>,
  /* Pena — direção criativa, texto livre. */
  direction: <>
    <path d="M4 20c3.5-8 8-11.5 15.5-16-1 7-3.5 12-7.5 14.5-2.6 1.6-5.3 1.9-8 1.5Z" />
    <path d="M8.5 15.5c2-2.5 4.5-4.5 7.5-6" />
  </>,
  /* Alvo — precisão, fidelidade. */
  precision: <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6" />
  </>,
  /* Laço — área selecionada. */
  area: <>
    <path d="M4 8.5C4 5.5 7.6 3.5 12 3.5s8 2 8 5-3.6 5-8 5c-1.2 0-2.4-.15-3.4-.42" />
    <path d="M8.6 13.08C6 14 4 15.7 4 17.4" />
    <circle cx="4" cy="19.4" r="1.9" />
  </>,
  /* Régua — escala, ampliação. */
  scale: <>
    <rect x="2.8" y="8.4" width="18.4" height="7.2" rx="2" />
    <path d="M7 8.4v3M11 8.4v4.4M15 8.4v3M19 8.4v4.4" />
  </>,
}

export type RowIconName = keyof typeof PATHS

/** SVG de 24×24 pronto para o slot `icon` de `SettingRow`. */
export function RowIcon({ name }: { name: RowIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
      {PATHS[name]}
    </svg>
  )
}

export default RowIcon
