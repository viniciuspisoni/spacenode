// ── Módulo Apresentar ────────────────────────────────────────────────────────
//
// Fonte de verdade do módulo de apresentação de projetos.
// Define as 3 ferramentas (Planta Humanizada, Isométrica, Prancha IA),
// presets visuais, engine Fal.ai e tabela de custos em nodes.
//
// Quando adicionar novo preset, trocar engine ou liberar a Prancha IA,
// edita só este arquivo. UI, API e histórico leem daqui.

import type { EngineId, Resolution } from '@/lib/engines'

// ── Tool types ───────────────────────────────────────────────────────────────

export type ApresentarToolId = 'humanized_plan' | 'isometric' | 'presentation_board' | 'moodboard'

export type ApresentarStatus = 'novo' | 'beta' | 'em-breve'

export interface ApresentarTool {
  id:          ApresentarToolId
  slug:        string                  // segmento da URL
  name:        string
  shortDesc:   string                  // card / hub
  longDesc:    string                  // dentro da ferramenta
  status:      ApresentarStatus
  available:   boolean                 // se já pode ser usada
  nodes:       number | null           // null = sem custo definido
  ctaLabel:    string
  // ── Integração Fal.ai (null para ferramentas ainda não disponíveis) ──────
  engine:      EngineId   | null       // 'vega' | 'pulsar' | 'quasar'
  resolution:  Resolution | null       // 'hd' | '2k' | '4k'
}

export const APRESENTAR_TOOLS: Record<ApresentarToolId, ApresentarTool> = {
  humanized_plan: {
    id:         'humanized_plan',
    slug:       'planta-humanizada',
    name:       'Planta Humanizada',
    shortDesc:  'Transforme plantas técnicas em plantas humanizadas prontas para apresentar ao cliente.',
    longDesc:   'Humaniza uma planta baixa técnica com mobiliário, vegetação, texturas e nomes de ambientes — preservando paredes, aberturas e proporções.',
    status:     'novo',
    available:  true,
    nodes:      20, // Vega (nano-banana-pro) @ 2K
    ctaLabel:   'Gerar planta humanizada',
    engine:     'vega',
    resolution: '2k',
  },
  isometric: {
    id:         'isometric',
    slug:       'isometricas',
    name:       'Isométricas',
    shortDesc:  'Crie vistas isométricas e axonométricas premium a partir de screenshots ou modelos base.',
    longDesc:   'Transforma uma imagem, screenshot ou vista de modelo 3D em uma vista isométrica/axonométrica premium para apresentação de projeto.',
    status:     'novo',
    available:  true,
    nodes:      20, // Vega (nano-banana-pro) @ 2K
    ctaLabel:   'Gerar isométrica',
    engine:     'vega',
    resolution: '2k',
  },
  presentation_board: {
    id:         'presentation_board',
    slug:       'prancha',
    name:       'Prancha IA',
    shortDesc:  'Monte apresentações, pranchas e carrosséis automaticamente com as imagens do seu projeto.',
    longDesc:   'Selecione imagens do seu histórico e a IA escreve título, captions e fechamento — pronto para Instagram, com a identidade do seu estúdio.',
    status:     'beta',
    available:  true,
    nodes:      6,        // Custo do passo de IA (Claude via Fal); renderização é local
    ctaLabel:   'Montar carrossel',
    engine:     null,     // Não usa engine de imagem — usa Claude (text-LLM)
    resolution: null,
  },
  moodboard: {
    id:         'moodboard',
    slug:       'moodboard',
    name:       'Moodboard',
    shortDesc:  'Gere paletas, materiais e conceitos visuais prontos para apresentar a direção do projeto.',
    longDesc:   'Envie uma imagem de referência — a IA extrai paleta de cores, sugere materiais e escreve um conceito editorial. Disponível em portrait, quadrado e A3 paisagem.',
    status:     'novo',
    available:  true,
    nodes:      8,        // Claude Vision via Fal (análise + paleta + materiais + texto). Render é local.
    ctaLabel:   'Gerar moodboard',
    engine:     null,     // Não usa engine de imagem — usa Claude Vision (text+vision LLM)
    resolution: null,
  },
}

export const APRESENTAR_TOOL_ORDER: ApresentarToolId[] = [
  'humanized_plan',
  'isometric',
  'presentation_board',
  'moodboard',
]

// ── Planta Humanizada · presets ──────────────────────────────────────────────

export type HumanizedPlanProjectType = 'apartamento' | 'casa' | 'comercial' | 'corporativo' | 'paisagismo'
export type HumanizedPlanStyle       = 'clean_tecnico' | 'imobiliario_premium' | 'editorial_minimalista' | 'aquarelado' | 'contemporaneo'
export type HumanizedPlanLevel       = 'leve' | 'equilibrado' | 'completo'

export interface HumanizedPlanOptions {
  addFurniture:     boolean
  addVegetation:    boolean
  applyFloorTextures: boolean
  addSoftShadows:   boolean
  preserveLines:    boolean
  addRoomLabels:    boolean
}

export const HUMANIZED_PLAN_PROJECT_TYPES: { id: HumanizedPlanProjectType; label: string }[] = [
  { id: 'apartamento', label: 'Apartamento' },
  { id: 'casa',        label: 'Casa'        },
  { id: 'comercial',   label: 'Comercial'   },
  { id: 'corporativo', label: 'Corporativo' },
  { id: 'paisagismo',  label: 'Paisagismo'  },
]

export const HUMANIZED_PLAN_STYLES: { id: HumanizedPlanStyle; label: string; desc: string }[] = [
  { id: 'clean_tecnico',        label: 'Clean técnico',         desc: 'Linhas limpas, paleta neutra, traço técnico humanizado.'        },
  { id: 'imobiliario_premium',  label: 'Imobiliário premium',   desc: 'Materialidade rica, ideal para venda e portfólio.'              },
  { id: 'editorial_minimalista',label: 'Editorial minimalista', desc: 'Linguagem de revista, tipografia delicada, paleta refinada.'    },
  { id: 'aquarelado',           label: 'Aquarelado',            desc: 'Aquarela suave, charme artístico para apresentações leves.'     },
  { id: 'contemporaneo',        label: 'Contemporâneo',         desc: 'Atual, sofisticado, equilíbrio entre técnica e apresentação.'  },
]

export const HUMANIZED_PLAN_LEVELS: { id: HumanizedPlanLevel; label: string; desc: string }[] = [
  { id: 'leve',         label: 'Leve',         desc: 'Toque mínimo. Mantém o traço técnico, adiciona apenas o essencial.' },
  { id: 'equilibrado',  label: 'Equilibrado',  desc: 'Mistura ideal entre técnica e ambientação para clientes.'           },
  { id: 'completo',     label: 'Completo',     desc: 'Humanização total — mobiliário, vegetação, sombras e texturas.'     },
]

export const HUMANIZED_PLAN_DEFAULT_OPTIONS: HumanizedPlanOptions = {
  addFurniture:       true,
  addVegetation:      true,
  applyFloorTextures: true,
  addSoftShadows:     true,
  preserveLines:      true,
  addRoomLabels:      true,
}

// ── Isométricas · presets ────────────────────────────────────────────────────

export type IsometricOrigin = 'sketchup' | 'revit' | 'planta' | 'conceitual' | 'outro'
export type IsometricType   = 'maquete_branca' | 'mobiliada' | 'realista' | 'corte' | 'explodida' | 'diagrama_volumetrico'
export type IsometricStyle  = 'premium_clean' | 'editorial' | 'concurso' | 'incorporadora' | 'minimalista'

export const ISOMETRIC_ORIGINS: { id: IsometricOrigin; label: string }[] = [
  { id: 'sketchup',   label: 'Screenshot do SketchUp' },
  { id: 'revit',      label: 'Screenshot do Revit'    },
  { id: 'planta',     label: 'Planta baixa'           },
  { id: 'conceitual', label: 'Modelo conceitual'      },
  { id: 'outro',      label: 'Outro'                  },
]

export const ISOMETRIC_TYPES: { id: IsometricType; label: string; desc: string }[] = [
  { id: 'maquete_branca',       label: 'Maquete branca',        desc: 'Volumes em branco, sem materiais. Ideal para volumetria.'     },
  { id: 'mobiliada',            label: 'Isométrica mobiliada',  desc: 'Mobiliário e ambientação, leitura completa do projeto.'      },
  { id: 'realista',             label: 'Isométrica realista',   desc: 'Materiais, iluminação e texturas — apresentação premium.'    },
  { id: 'corte',                label: 'Corte isométrico',      desc: 'Vista em corte para mostrar interior do projeto.'            },
  { id: 'explodida',            label: 'Vista explodida',       desc: 'Camadas separadas, ótimo para concursos e diagramação.'      },
  { id: 'diagrama_volumetrico', label: 'Diagrama volumétrico',  desc: 'Esquema de massas e relações, linguagem conceitual.'         },
]

export const ISOMETRIC_STYLES: { id: IsometricStyle; label: string; desc: string }[] = [
  { id: 'premium_clean',  label: 'Premium clean',     desc: 'Acabamento sofisticado, materiais nobres, leitura limpa.'    },
  { id: 'editorial',      label: 'Editorial arquitetura', desc: 'Linguagem de revista e publicação especializada.'         },
  { id: 'concurso',       label: 'Concurso',          desc: 'Estética de prancha de concurso, conceitual e elegante.'     },
  { id: 'incorporadora',  label: 'Incorporadora',     desc: 'Apelo comercial e de vendas, ambientação aspiracional.'      },
  { id: 'minimalista',    label: 'Minimalista',       desc: 'Reducionista, paleta restrita, foco na essência do projeto.' },
]

// ── Prancha IA · formatos ────────────────────────────────────────────────────

export type BoardFormatId =
  | 'instagram_carousel'   // MVP — 1080×1350 portrait
  | 'apresentacao_16_9'    // futuro — 1920×1080
  | 'prancha_a3'           // futuro — 297×420mm PDF
  | 'prancha_a1'           // futuro — 594×841mm PDF
  | 'pdf_cliente'          // futuro — A4 multi-página
  | 'moodboard'            // futuro — composição livre

export interface BoardFormat {
  id:        BoardFormatId
  label:     string
  desc:      string
  width:     number        // pixels do slide
  height:    number
  available: boolean
  badge?:    string
}

export const BOARD_FORMATS: BoardFormat[] = [
  { id: 'instagram_carousel', label: 'Carrossel Instagram',   desc: 'Sequência 4:5 (1080×1350) otimizada para feed.',          width: 1080, height: 1350, available: true,  badge: 'novo'    },
  { id: 'apresentacao_16_9',  label: 'Apresentação 16:9',     desc: 'Slides widescreen para reunião com o cliente.',           width: 1920, height: 1080, available: false, badge: 'em breve' },
  { id: 'prancha_a3',         label: 'Prancha A3',            desc: 'Layout horizontal A3 (297×420mm) imprimível.',            width: 1240, height: 1754, available: false, badge: 'em breve' },
  { id: 'prancha_a1',         label: 'Prancha A1',            desc: 'Prancha de concurso A1 (594×841mm) impressa.',            width: 2480, height: 3508, available: false, badge: 'em breve' },
  { id: 'pdf_cliente',        label: 'PDF para cliente',      desc: 'Documento A4 multipágina pronto para envio.',             width: 1240, height: 1754, available: false, badge: 'em breve' },
  { id: 'moodboard',          label: 'Moodboard',             desc: 'Composição visual com paleta, texturas e referências.',   width: 1620, height: 1080, available: false, badge: 'em breve' },
]

// ── Carrossel Instagram · presets ────────────────────────────────────────────

export type CarouselStyle = 'editorial' | 'minimalista' | 'premium' | 'studio_dark'

export const CAROUSEL_STYLES: { id: CarouselStyle; label: string; desc: string }[] = [
  { id: 'editorial',   label: 'Editorial',    desc: 'Tipografia serifada, alto contraste, sensação de revista de arquitetura.' },
  { id: 'minimalista', label: 'Minimalista',  desc: 'Sans-serif fina, paleta neutra, muito espaço em branco.'                  },
  { id: 'premium',     label: 'Premium',      desc: 'Acabamento sofisticado, dourado sutil, ideal para alto padrão.'           },
  { id: 'studio_dark', label: 'Studio Dark',  desc: 'Fundo escuro, texto claro, premium contemporâneo.'                        },
]

export type CarouselSlideRole = 'cover' | 'image' | 'closing'

export interface CarouselSlide {
  role:    CarouselSlideRole
  imageUrl?: string         // image / cover têm imagem; closing pode não ter
  title?:    string         // cover: nome do projeto; image: título curto da vista
  caption?:  string         // image: descrição da vista; closing: chamada
}

export interface CarouselGeneratedCopy {
  coverTitle:    string     // título principal da capa (até 4 palavras)
  coverSubtitle: string     // 1 linha de contexto
  captions:      string[]   // 1 caption por slide-imagem (até 60 chars cada)
  closingTitle:  string     // chamada do slide final (curta)
  closingBody:   string     // body do slide final (até 2 linhas)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getApresentarTool(id: ApresentarToolId): ApresentarTool {
  return APRESENTAR_TOOLS[id]
}

export function isApresentarToolId(value: unknown): value is ApresentarToolId {
  return value === 'humanized_plan'
      || value === 'isometric'
      || value === 'presentation_board'
      || value === 'moodboard'
}

// ── Moodboard · presets ──────────────────────────────────────────────────────

export type MoodboardAmbient = 'sala' | 'cozinha' | 'quarto' | 'banheiro' | 'escritorio' | 'loja' | 'fachada' | 'gourmet'
export type MoodboardStyle   = 'contemporaneo' | 'minimalista' | 'organico' | 'industrial' | 'escandinavo' | 'classico' | 'japandi' | 'mediterraneo' | 'sofisticado_escuro'
export type MoodboardPalette = 'clara' | 'quente' | 'neutra' | 'escura' | 'natural' | 'colorida'
export type MoodboardLevel   = 'conceitual' | 'comercial' | 'premium'

export const MOODBOARD_AMBIENTS: { id: MoodboardAmbient; label: string }[] = [
  { id: 'sala',        label: 'Sala'         },
  { id: 'cozinha',     label: 'Cozinha'      },
  { id: 'quarto',      label: 'Quarto'       },
  { id: 'banheiro',    label: 'Banheiro'     },
  { id: 'escritorio',  label: 'Escritório'   },
  { id: 'loja',        label: 'Loja'         },
  { id: 'fachada',     label: 'Fachada'      },
  { id: 'gourmet',     label: 'Área gourmet' },
]

export const MOODBOARD_STYLES: { id: MoodboardStyle; label: string }[] = [
  { id: 'contemporaneo',      label: 'Contemporâneo'      },
  { id: 'minimalista',        label: 'Minimalista'        },
  { id: 'organico',           label: 'Orgânico'           },
  { id: 'industrial',         label: 'Industrial'         },
  { id: 'escandinavo',        label: 'Escandinavo'        },
  { id: 'classico',           label: 'Clássico'           },
  { id: 'japandi',            label: 'Japandi'            },
  { id: 'mediterraneo',       label: 'Mediterrâneo'       },
  { id: 'sofisticado_escuro', label: 'Sofisticado escuro' },
]

export const MOODBOARD_PALETTES: { id: MoodboardPalette; label: string }[] = [
  { id: 'clara',    label: 'Clara'    },
  { id: 'quente',   label: 'Quente'   },
  { id: 'neutra',   label: 'Neutra'   },
  { id: 'escura',   label: 'Escura'   },
  { id: 'natural',  label: 'Natural'  },
  { id: 'colorida', label: 'Colorida' },
]

export const MOODBOARD_LEVELS: { id: MoodboardLevel; label: string; desc: string }[] = [
  { id: 'conceitual', label: 'Conceitual', desc: 'Direção visual livre, ideal pra inspirar discussões iniciais.' },
  { id: 'comercial',  label: 'Comercial',  desc: 'Apresentação direta para cliente, foco em direção e materiais.' },
  { id: 'premium',    label: 'Premium',    desc: 'Pranchada editorial, refinada, pronta pra projetos de alto padrão.' },
]

export const MOODBOARD_MATERIAL_CATEGORIES = [
  'Madeira',
  'Pedra',
  'Tecido',
  'Pintura',
  'Metal',
  'Revestimento',
  'Iluminação',
] as const

export type MoodboardMaterialCategory = typeof MOODBOARD_MATERIAL_CATEGORIES[number]

export interface MoodboardMaterial {
  category: MoodboardMaterialCategory
  name:     string
  note?:    string
}

export interface MoodboardSwatch {
  hex:   string
  name:  string
}

export interface MoodboardResult {
  coverUrl:    string | null
  title:       string
  concept:     string
  palette:     MoodboardSwatch[]
  materials:   MoodboardMaterial[]
  tags:        string[]
}

// ── Moodboard · formatos de saída ────────────────────────────────────────────

export type MoodboardFormat = 'portrait' | 'square' | 'a3_landscape'

export interface MoodboardFormatSpec {
  id:     MoodboardFormat
  label:  string
  desc:   string
  width:  number
  height: number
}

export const MOODBOARD_FORMATS: MoodboardFormatSpec[] = [
  { id: 'portrait',     label: 'Portrait 4:5',   desc: '1080 × 1350 — Instagram feed.',           width: 1080, height: 1350 },
  { id: 'square',       label: 'Quadrado 1:1',   desc: '1080 × 1080 — feed clássico.',            width: 1080, height: 1080 },
  { id: 'a3_landscape', label: 'A3 paisagem',    desc: '3508 × 2480 — prancha de apresentação.',  width: 3508, height: 2480 },
]

// ── Tipo da entrada no histórico (futuro) ────────────────────────────────────
//
// Quando integrarmos com a tabela `renders` (ou nova tabela própria), cada
// geração de Apresentar gravará um snapshot do config nesta forma.

export interface ApresentarHistoryEntry {
  tool:         ApresentarToolId
  inputUrl:     string
  outputUrl:    string | null
  prompt:       string | null
  stylePreset:  string | null
  config:       Record<string, unknown>
  nodesCharged: number
  status:       'pending' | 'completed' | 'failed'
  createdAt:    string
}
