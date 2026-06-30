// Set de ícones da sidebar — desenhados sob regras únicas para acabamento
// consistente: viewBox 24×24, stroke 1.5, terminações/junções arredondadas,
// sem preenchimentos, peso óptico equivalente. Metáforas sóbrias.

type IconProps = { size?: number }

const SVG = ({ size = 18, children }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    shapeRendering="geometricPrecision"
  >
    {children}
  </svg>
)

// ── PROJETOS ──────────────────────────────────────────────
export const IconProjects = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h3.8a1.5 1.5 0 0 1 1.06.44L10.6 8H19.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5z" />
  </SVG>
)

export const IconDashboard = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </SVG>
)

export const IconHistory = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M3.2 12a8.8 8.8 0 1 0 2.7-6.3" />
    <path d="M3 4.5V8h3.5" />
    <path d="M12 7.8v4.4l3 1.9" />
  </SVG>
)

// ── CRIAR ─────────────────────────────────────────────────
export const IconGenerate = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.6" />
    <circle cx="8.4" cy="8.4" r="1.5" />
    <path d="M21 14.5l-4.6-4-7.4 7" />
  </SVG>
)

export const IconSpaces = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="8" y="3" width="13" height="13" rx="2.2" />
    <path d="M16 21H5.2A2.2 2.2 0 0 1 3 18.8V8" />
  </SVG>
)

export const IconRetocar = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M12.5 20H21" />
    <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.2 18.8l-4 1 1-4L16.4 3.6z" />
  </SVG>
)

export const IconEnhance = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M8 3.5H4.5a1 1 0 0 0-1 1V8" />
    <path d="M16 3.5h3.5a1 1 0 0 1 1 1V8" />
    <path d="M20.5 16v3.5a1 1 0 0 1-1 1H16" />
    <path d="M3.5 16v3.5a1 1 0 0 0 1 1H8" />
    <path d="M9.5 12h5M12 9.5v5" />
  </SVG>
)

export const IconVideo = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="2.5" y="5.5" width="13.5" height="13" rx="2.4" />
    <path d="M16 10l5.5-3.2v10.4L16 14" />
  </SVG>
)

export const IconFinalizar = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.6" />
    <path d="M8 12.2l2.8 2.8L16.5 9" />
  </SVG>
)

// ── APRESENTAR ────────────────────────────────────────────
export const IconHumanizedPlan = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.2" />
    <path d="M3 10h6.5M9.5 3v7M9.5 14v7M14 14h7" />
  </SVG>
)

export const IconIsometric = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M12 2.6l8.6 4.95v8.9L12 21.4l-8.6-4.95v-8.9L12 2.6z" />
    <path d="M3.4 7.55L12 12.5l8.6-4.95M12 12.5v8.9" />
  </SVG>
)

export const IconBoard = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.2" />
    <rect x="6" y="6" width="6.5" height="5" rx="1" />
    <path d="M15 6.4h3M15 9.4h3M6 14.5h12M6 17.5h8" />
  </SVG>
)

export const IconMoodboard = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.2" />
    <rect x="6.4" y="6.4" width="4.6" height="4.6" rx="1" />
    <rect x="13" y="6.4" width="4.6" height="4.6" rx="1" />
    <rect x="6.4" y="13" width="4.6" height="4.6" rx="1" />
    <rect x="13" y="13" width="4.6" height="4.6" rx="1" />
  </SVG>
)

// ── ESCRITÓRIO ────────────────────────────────────────────
export const IconTeam = (p: IconProps = {}) => (
  <SVG {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.6 19.4c0-3 2.4-5.2 5.4-5.2s5.4 2.2 5.4 5.2" />
    <path d="M16 5.5a3.2 3.2 0 0 1 0 5M17.6 19.4c0-2.4-1-4.3-2.6-5.1" />
  </SVG>
)

export const IconIdentity = (p: IconProps = {}) => (
  <SVG {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.4" />
    <circle cx="8" cy="11" r="2.1" />
    <path d="M4.7 16.2c.5-1.5 1.8-2.3 3.3-2.3s2.8.8 3.3 2.3" />
    <path d="M14.5 9.5h4M14.5 12.5h4M14.5 15.3h2.5" />
  </SVG>
)

export const IconAccount = (p: IconProps = {}) => (
  <SVG {...p}>
    <circle cx="12" cy="8" r="3.7" />
    <path d="M4.8 20c0-3.8 3.2-6.6 7.2-6.6s7.2 2.8 7.2 6.6" />
  </SVG>
)

export const IconPlans = (p: IconProps = {}) => (
  <SVG {...p}>
    <path d="M12 2.8l9 4.4-9 4.4-9-4.4 9-4.4z" />
    <path d="M3 12l9 4.4 9-4.4" />
    <path d="M3 16.4l9 4.4 9-4.4" />
  </SVG>
)
