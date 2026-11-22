export type LandingProject = {
  id: string
  title: string
  author: string
  alt: string
  fullFrame?: boolean
  images?: { render: string; base?: string }
  exterior?: boolean
}

// Pares da seleção aprovada para a landing. O crédito acompanha cada vista.
export const originalProjects: LandingProject[] = [
  { id: '142', exterior: true, title: 'Pátio com espelho d’água', author: 'muda arquitetura', alt: 'Pátio arborizado com volumes de concreto, espelho d’água e deck de madeira.' },
  { id: '183', title: 'Sala com painel de madeira', author: 'Bruna Plentz', alt: 'Living integrado com painel de madeira, poltrona caramelo e tapete azul.' },
  { id: '13', exterior: true, title: 'Fachada residencial', author: 'Natália Benchimol Maggi', alt: 'Fachada de dois pavimentos com volumes brancos, revestimento de pedra e jardim.' },
  { id: '345', title: 'Quarto com detalhes amarelos', author: 'Nathalia Costa', alt: 'Quarto com iluminação indireta, marcenaria escura e roupa de cama com detalhes amarelos.' },
  { id: '94', title: 'Cozinha com marcenaria', author: 'muda arquitetura', alt: 'Cozinha com armários de madeira, piso escuro e revestimento estampado.' },
  { id: '25', title: 'Escritório', author: 'Bruna Plentz', alt: 'Escritório com poltronas azuis e estante iluminada ao fundo.' },
  { id: '174', title: 'Cozinha com bancada de madeira', author: 'Natália Benchimol Maggi', alt: 'Cozinha com ilha de madeira, banquetas e armários superiores.' },
  { id: '100', title: 'Sala de estar', author: 'Nathalia Costa', alt: 'Sala clara com sofá, painel de madeira e mesa lateral.' },
  { id: '21', title: 'Sala de estar colorida', author: 'Bruna Plentz', alt: 'Sala com sofá azul e pintura em tom terracota acompanhando a área de jantar.' },
]

// Cada slug identifica o par registrado para landing em marketing/AUTORIZACOES.md.
export const reviewProjects: LandingProject[] = [
  { id: 'living-estante', title: 'Living com estante vinho', author: 'muda arquitetura', alt: 'Living com estante vinho, livros e violões junto à mesa de jantar.' },
  { id: 'cozinha-ilha', title: 'Cozinha com ilha clara', author: 'Nathalia Costa', alt: 'Cozinha integrada com marcenaria clara, ilha e iluminação nas prateleiras.' },
  { id: 'sala-estar', title: 'Sala com sofá vinho', author: 'muda arquitetura', alt: 'Sala com sofá vinho, parede clara e mesa de jantar ao fundo.' },
  { id: 'sala-jantar', title: 'Sala de jantar com cristaleira', author: 'Paula Miolla', alt: 'Vista da sala de jantar com painel de madeira, prateleiras e cristaleira iluminada.' },
  { id: 'entrada-corredor', title: 'Corredor com armário amarelo', author: 'muda arquitetura', alt: 'Corredor com piso terracota e armário envidraçado amarelo ao lado da passagem.' },
  { id: 'home-office', title: 'Home office junto à janela', author: 'Nathalia Costa', alt: 'Bancada de trabalho estreita sob prateleiras iluminadas, junto a uma janela.' },
  { id: 'cozinha-ceramica', title: 'Cozinha com cerâmica estampada', author: 'muda arquitetura', alt: 'Cozinha com cerâmica estampada, prateleiras abertas e janela sobre a pia.' },
  { id: 'living-jantar', title: 'Living integrado com sofá azul', author: 'Bruna Plentz', alt: 'Sala integrada com sofá azul e uma parede terracota curva junto à mesa de jantar.' },
].map(project => ({ ...project, fullFrame: true }))

// Existing demonstration renders from the landing and the two outdoor studies
// produced for the October image review. Only the latter use the preview route.
const newExteriors: LandingProject[] = [
  {
    id: 'deck-vale', title: 'Deck e piscina sobre o vale', author: 'Acervo SpaceNode',
    alt: 'Terraço coberto com mesa de madeira, piscina de borda infinita e montanhas ao fundo.',
    images: { render: '/close-vale.jpg' },
  },
  {
    id: 'casa-concreto-luz-dourada', title: 'Casa de concreto ao entardecer', author: 'Acervo SpaceNode',
    alt: 'Casa térrea de concreto e vidro com laje em balanço sobre um gramado, iluminada pelo sol baixo.',
    images: { render: '/demo-render.jpg', base: '/demo-sketch.jpg' },
  },
  {
    id: 'piscina-anoitecer', title: 'Piscina ao anoitecer', author: 'Estudo de luz da SpaceNode',
    alt: 'Vista do deck e da piscina em frente a uma casa térrea com grandes janelas acesas sob o céu azul do início da noite.',
    images: { render: '/review-assets/piscina-anoitecer-render.webp', base: '/review-assets/piscina-anoitecer-base.webp' },
  },
  {
    id: 'casa-dois-volumes', title: 'Dois volumes na encosta', author: 'Acervo SpaceNode',
    alt: 'Fachada residencial com dois volumes brancos envidraçados acima da garagem, entre árvores e rochas.',
    images: { render: '/gallery-casa-before.jpg', base: '/landing-editorial/casa-dois-volumes-base.webp' },
  },
  {
    id: 'casa-jardim', title: 'Casa térrea entre jardins', author: 'Modelo de John Luttropp · Render SpaceNode',
    alt: 'Casa térrea de pedra e vidro ao fundo de um gramado, com jardim junto às janelas e sombra de árvore.',
    images: { render: '/review-assets/casa-jardim-render.webp', base: '/review-assets/casa-jardim-base.webp' },
  },
  {
    id: 'fachada-tijolos', title: 'Fachada urbana de tijolos', author: 'Acervo SpaceNode',
    alt: 'Edifício comercial de tijolos vermelhos, vitrines altas e átrio de vidro voltados para a calçada.',
    images: { render: '/gallery-comercial-before.jpg', base: '/landing-editorial/fachada-urbana-base.webp' },
  },
]

export const exteriorProjects = [...newExteriors, ...originalProjects.filter(project => project.exterior)]
export const interiorProjects = [...reviewProjects, ...originalProjects.filter(project => !project.exterior)]

export const projectById = new Map<string, LandingProject>(
  [...originalProjects, ...reviewProjects, ...newExteriors].map(project => [project.id, project])
)

export function projectImages(project: LandingProject): { render: string; base?: string } {
  if (project.images) return project.images
  if (project.fullFrame) {
    return { base: `/proj-${project.id}-base.jpg`, render: `/proj-${project.id}-render.jpg` }
  }
  if (project.id === '183') {
    return { base: '/cliente-bruna-sala-painel-tv-183-base.jpg', render: '/cliente-bruna-sala-painel-tv-183-render.jpg' }
  }
  return { base: `/projetos-aprovados/${project.id}-base.webp`, render: `/projetos-aprovados/${project.id}.webp` }
}
