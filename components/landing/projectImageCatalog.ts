export type LandingProject = {
  id: string
  title: string
  author: string
  alt: string
  fullFrame?: boolean
}

// Pares da seleção aprovada para a landing. O crédito acompanha cada vista.
export const originalProjects = [
  { id: '142', title: 'Pátio com espelho d’água', author: 'muda arquitetura', alt: 'Pátio arborizado com volumes de concreto, espelho d’água e deck de madeira.' },
  { id: '183', title: 'Sala com painel de madeira', author: 'Bruna Plentz', alt: 'Living integrado com painel de madeira, poltrona caramelo e tapete azul.' },
  { id: '13', title: 'Fachada residencial', author: 'Natália Benchimol Maggi', alt: 'Fachada de dois pavimentos com volumes brancos, revestimento de pedra e jardim.' },
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

export const projectById = new Map<string, LandingProject>(
  [...originalProjects, ...reviewProjects].map(project => [project.id, project])
)

export function projectImages(project: LandingProject) {
  if (project.fullFrame) {
    return { base: `/proj-${project.id}-base.jpg`, render: `/proj-${project.id}-render.jpg` }
  }
  if (project.id === '183') {
    return { base: '/cliente-bruna-sala-painel-tv-183-base.jpg', render: '/cliente-bruna-sala-painel-tv-183-render.jpg' }
  }
  return { base: `/projetos-aprovados/${project.id}-base.webp`, render: `/projetos-aprovados/${project.id}.webp` }
}
