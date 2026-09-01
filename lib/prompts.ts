// lib/prompts.ts

// O contrato de fidelidade da Máxima (modo estrutural render_only) vive em
// lib/ai/fidelity/render-only.ts — fonte única, aplicada ANTES dos blocos
// derivados de escolha do usuário. Aqui ficam vocabulário, blocos por nível e
// a composição final do prompt.
import {
  NEGATIVE_BASE,
  buildRenderOnlyNegatives,
  buildRenderOnlySystemHead,
  buildRenderOnlyCameraBlock,
  buildEdgeMapBlock,
  buildDepthMapBlock,
} from '@/lib/ai/fidelity/render-only'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProjectType = 'exterior' | 'interior'

export interface ProjectMaterials {
  // Exterior-only (não aparece na UI quando projectType === 'interior')
  fachada?:    string
  // Compartilhados — mapeados pra termos diferentes em interior vs exterior
  piso?:       string
  esquadrias?: string
  // Interior-only (não aparece na UI quando projectType === 'exterior')
  paredes?:    string
  teto?:       string
  marcenaria?: string
  bancadas?:   string
  // Compartilhados em ambos
  elementos?:  string
  outros?:     string
}

export interface GenerateOptions {
  projectType:    ProjectType
  segment:        string
  environment:    string
  lighting:       string
  background:     string
  sceneElements:  string[]
  geometryLock:   number
  materials?:     ProjectMaterials
  fidelityMode?:  'strict' | 'balanced'
  fidelityLevel?:  FidelityLevel
  briefing?:       BriefingArquitetonico
  hasAnchor?:      boolean
  refinementText?: string
  modelFacts?:     ModelFacts
}

// Fatos medidos do modelo 3D (hoje: plugin SketchUp) — verdade de origem
// sobre câmera e sol, em vez de o modelo de imagem adivinhar pelo pixel.
// Só entra no ramo maximum (render_only); sanitizado na rota.
export interface ModelFacts {
  camera?: {
    focalLengthMm?: number
    fovDeg?:        number
    /** up travado no eixo Z — perspectiva de dois pontos, verticais paralelas */
    twoPoint?:      boolean
  }
  sun?: {
    azimuthDeg?:     number
    elevationDeg?:   number
    localTime?:      string
    date?:           string
    city?:           string
    shadowsVisible?: boolean
  }
}

// ── Fidelity Engine ────────────────────────────────────────────────────────────

export type FidelityLevel = 'maximum' | 'balanced' | 'creative'

export interface BriefingArquitetonico {
  tipo_projeto:         string   // ex: "fachada residencial contemporânea, sobrado isolado"
  geometria_principal:  string   // ex: "volume retangular alongado com balanço lateral em concreto"
  volumes:              string   // ex: "dois volumes sobrepostos, térreo recuado, superior em balanço"
  pavimentos:           number   // 1, 2, 3...
  aberturas:            string   // ex: "três janelas verticais no pavimento superior, porta pivotante central"
  materiais_aparentes:  string   // ex: "concreto aparente, painéis de madeira ripada, vidro laminado"
  camera:               string   // ex: "frontal levemente em contra-plongée, altura humana, lente normal ~35mm"
  entorno:              string   // ex: "lote em rua plana, calçada larga, casa vizinha de dois pavimentos à direita"
  elementos_preservar:  string[] // ["número de pavimentos", "posição de aberturas", "casa vizinha", ...]
  elementos_melhorar:   string[] // ["realismo de materiais", "vegetação discreta", "iluminação", ...]
}

// ── Segments ───────────────────────────────────────────────────────────────────

export const INTERIOR_SEGMENTS = [
  'Residencial', 'Corporativo', 'Comercial',
  'Gastronomia', 'Hospitalidade', 'Saúde', 'Educação',
]

export const EXTERIOR_SEGMENTS = [
  'Residencial', 'Comercial', 'Corporativo',
  'Hospitalidade', 'Institucional', 'Paisagismo',
]

// ── Environments ───────────────────────────────────────────────────────────────

export const INTERIOR_ENVIRONMENTS: Record<string, string[]> = {
  'Residencial': [
    'Sala de Estar', 'Sala de Jantar', 'Cozinha', 'Cozinha Gourmet',
    'Suíte Master', 'Quarto', 'Quarto Infantil', 'Banheiro', 'Lavabo',
    'Home Office', 'Área de Serviço', 'Varanda Gourmet', 'Closet',
    'Hall de Entrada', 'Área de Lazer',
  ],
  'Corporativo': [
    'Escritório Corporativo', 'Open Space', 'Sala de Reunião',
    'Sala de Diretoria', 'Recepção Corporativa', 'Coworking',
    'Escritório Privativo', 'Sala de Treinamento', 'Lounge Corporativo',
    'Copa / Descompressão', 'Auditório', 'Espaço Colaborativo', 'Work Café',
  ],
  'Comercial': [
    'Loja em Shopping', 'Loja de Rua', 'Showroom', 'Boutique',
    'Loja de Moda', 'Loja de Decoração', 'Loja de Tecnologia', 'Quiosque',
    'Espaço de Atendimento', 'Recepção Comercial', 'Stand de Vendas', 'Vitrine Interna',
  ],
  'Gastronomia': [
    'Restaurante', 'Restaurante Premium', 'Café', 'Cafeteria', 'Bistrô',
    'Bar', 'Wine Bar', 'Padaria', 'Hamburgueria',
    'Praça de Alimentação', 'Cozinha Aberta', 'Balcão de Atendimento',
  ],
  'Hospitalidade': [
    'Lobby de Hotel', 'Recepção de Hotel', 'Quarto de Hotel', 'Suíte de Hotel',
    'Lounge', 'Rooftop', 'Área de Café da Manhã', 'Spa',
    'Corredor de Hotel', 'Sala de Espera Premium',
  ],
  'Saúde': [
    'Consultório', 'Clínica', 'Recepção de Clínica', 'Sala de Espera',
    'Consultório Odontológico', 'Consultório Médico', 'Sala de Exames',
    'Sala de Atendimento', 'Espaço de Bem-Estar',
  ],
  'Educação': [
    'Sala de Aula', 'Sala de Treinamento', 'Biblioteca',
    'Recepção Educacional', 'Área de Estudo', 'Lounge Estudantil',
    'Laboratório', 'Espaço Infantil Educacional',
  ],
}

export const EXTERIOR_ENVIRONMENTS: Record<string, string[]> = {
  'Residencial': [
    'Fachada Residencial', 'Casa Térrea', 'Sobrado',
    'Casa Contemporânea', 'Casa em Condomínio', 'Edifício Residencial',
    'Área de Piscina', 'Jardim Residencial', 'Entrada Principal',
  ],
  'Comercial': [
    'Fachada de Loja', 'Loja de Rua', 'Loja em Shopping',
    'Galeria Comercial', 'Showroom Externo', 'Restaurante Externo',
    'Café Externo', 'Fachada com Vitrine', 'Quiosque', 'Stand Comercial',
  ],
  'Corporativo': [
    'Fachada Corporativa', 'Prédio Comercial', 'Edifício Corporativo',
    'Entrada Empresarial', 'Sede Corporativa', 'Complexo Empresarial',
    'Coworking Externo', 'Pátio Corporativo',
  ],
  'Hospitalidade': [
    'Fachada de Hotel', 'Entrada de Hotel', 'Resort', 'Pousada',
    'Rooftop', 'Área de Piscina de Hotel', 'Lounge Externo', 'Terraço',
  ],
  'Institucional': [
    'Escola', 'Universidade', 'Clínica', 'Hospital',
    'Centro Cultural', 'Edifício Público', 'Espaço Comunitário',
  ],
  'Paisagismo': [
    'Jardim Contemporâneo', 'Praça', 'Parque Urbano', 'Pátio Interno',
    'Jardim Sensorial', 'Área de Convivência',
    'Paisagismo Residencial', 'Paisagismo Comercial',
  ],
}

// ── Lighting ───────────────────────────────────────────────────────────────────

// 'Preservar Original' é sempre a primeira opção (e default). Em Máxima
// Fidelidade ela mantém a luz exata da imagem de referência — sem essa opção
// o usuário era forçado a escolher uma luz mesmo querendo só preservar tudo,
// e a `lightingLine` injetada empurrava o modelo a acender luminárias.
export const INTERIOR_LIGHTING: Record<string, string[]> = {
  'Residencial': [
    'Preservar Original',
    'Clara e Natural', 'Natural Suave', 'Luz de Janela', 'Nublado',
    'Quente e Aconchegante', 'Entardecer Quente',
    'Noturna Aconchegante', 'Sofisticada e Cênica',
  ],
  'Corporativo': [
    'Preservar Original',
    'Corporativa Neutra', 'Natural Profissional', 'Luz Difusa Uniforme', 'Nublado',
    'Escritório Contemporâneo', 'Iluminação Técnica',
    'Noturna Executiva', 'Clara e Produtiva',
  ],
  'Comercial': [
    'Preservar Original',
    'Comercial Bem Iluminada', 'Varejo Premium', 'Showroom Iluminado', 'Nublado',
    'Destaque de Produto', 'Iluminação de Loja',
    'Noturna Comercial', 'Luz de Vitrine',
  ],
  'Gastronomia': [
    'Preservar Original',
    'Quente e Aconchegante', 'Cênica e Intimista', 'Entardecer Quente', 'Nublado',
    'Noturna Sofisticada', 'Café com Luz Natural',
    'Restaurante Premium', 'Luz Baixa Decorativa',
  ],
  'Hospitalidade': [
    'Preservar Original',
    'Sofisticada e Cênica', 'Premium Aconchegante', 'Luz Natural Elegante', 'Nublado',
    'Noturna Refinada', 'Spa Relaxante',
    'Lobby Iluminado', 'Entardecer de Hotel',
  ],
  'Saúde': [
    'Preservar Original',
    'Clara e Limpa', 'Clínica Neutra', 'Luz Difusa Suave', 'Nublado',
    'Iluminação Profissional', 'Aconchegante e Calma', 'Saúde Premium',
  ],
  'Educação': [
    'Preservar Original',
    'Clara e Funcional', 'Natural Suave', 'Luz Difusa', 'Nublado',
    'Ambiente Produtivo', 'Biblioteca Aconchegante', 'Sala Bem Iluminada',
  ],
}

export const EXTERIOR_LIGHTING: Record<string, string[]> = {
  'Residencial':   ['Preservar Original', 'Diurno', 'Entardecer', 'Golden Hour', 'Blue Hour', 'Noturno Iluminado', 'Nublado', 'Chuva Leve'],
  'Comercial':     ['Preservar Original', 'Diurno Comercial', 'Fachada Bem Iluminada', 'Vitrine Noturna', 'Golden Hour', 'Blue Hour', 'Noturno Comercial', 'Shopping Atmosphere'],
  'Corporativo':   ['Preservar Original', 'Diurno Corporativo', 'Fachada Profissional', 'Blue Hour', 'Noturno Executivo', 'Luz Urbana', 'Nublado Sofisticado'],
  'Hospitalidade': ['Preservar Original', 'Golden Hour', 'Entardecer Premium', 'Noturno Refinado', 'Resort Diurno', 'Luz de Piscina', 'Blue Hour', 'Atmosfera Tropical'],
  'Institucional': ['Preservar Original', 'Diurno Claro', 'Nublado Suave', 'Luz Natural', 'Entardecer', 'Iluminação Urbana', 'Noturno Institucional'],
  'Paisagismo':    ['Preservar Original', 'Diurno Natural', 'Golden Hour', 'Entardecer Suave', 'Luz Filtrada', 'Nublado', 'Noturno Paisagístico', 'Chuva Leve'],
}

// ── Background / Context ───────────────────────────────────────────────────────

export const EXTERIOR_BACKGROUNDS = [
  'Preservar Original', 'Entorno Neutro', 'Rua Arborizada',
  'Condomínio', 'Bairro Nobre', 'Zona Urbana', 'Zona Rural',
  'Beira-Mar', 'Beira-Rio', 'Serra', 'Praça Urbana',
  'Jardim', 'Estacionamento', 'Calçada Comercial',
]

export const INTERIOR_CONTEXTS = [
  'Preservar Original', 'Clean / Neutro', 'Premium',
  'Urbano', 'Natural', 'Minimalista',
  'Comercial', 'Corporativo', 'Aconchegante',
]

// ── Scene Elements ─────────────────────────────────────────────────────────────

export const SCENE_ELEMENTS: Record<string, string[]> = {
  base: ['Decoração', 'Pessoas', 'Vegetação', 'Luzes Acesas', 'Raios de Sol'],
  Corporativo: [
    'Pessoas Trabalhando', 'Computadores', 'Mesas de Trabalho', 'Branding Sutil',
    'Divisórias de Vidro', 'Vegetação Interna', 'Luminárias Técnicas', 'Telas / Monitores',
  ],
  Comercial: [
    'Clientes', 'Funcionários', 'Produto em Destaque', 'Expositores',
    'Vitrine', 'Letreiro', 'Branding Sutil', 'Displays', 'Balcão de Atendimento',
  ],
  Gastronomia: [
    'Clientes Sentados', 'Garçons', 'Mesas Postas', 'Balcão',
    'Luminárias Decorativas', 'Vegetação', 'Cozinha Aparente', 'Pratos / Bebidas',
  ],
  Hospitalidade: [
    'Pessoas', 'Decoração Premium', 'Vegetação Interna', 'Luminárias Decorativas',
    'Obras de Arte', 'Mobiliário Sofisticado', 'Recepção', 'Malas / Bagagens',
  ],
  'Saúde': [
    'Pessoas Aguardando', 'Balcão de Atendimento', 'Poltronas',
    'Sinalização', 'Iluminação Suave', 'Vegetação Interna', 'Equipamentos Discretos',
  ],
  'Educação': [
    'Estudantes', 'Mesas de Estudo', 'Livros', 'Quadros',
    'Telas / Monitores', 'Vegetação Interna', 'Mobiliário Escolar',
  ],
  exterior: [
    'Pessoas', 'Carros', 'Vegetação', 'Luzes Acesas', 'Raios de Sol',
    'Calçada', 'Mobiliário Urbano', 'Sinalização', 'Paisagismo',
  ],
  Paisagismo: [
    'Pessoas', 'Vegetação', 'Árvores', 'Bancos', 'Caminhos',
    'Iluminação Externa', "Água / Espelho d'água", 'Mobiliário Urbano',
  ],
}

// ── Prompt vocabulary ──────────────────────────────────────────────────────────
// Maps Portuguese UI labels → English prompt fragments

const ENV_EN: Record<string, string> = {
  // Interior / Residencial
  'Sala de Estar':   'living room with sofa set, TV rack, large-format porcelain tile floor, textured accent wall, floor-to-ceiling windows',
  'Sala de Jantar':  'dining room with 6-seat solid wood table, upholstered chairs, pendant chandelier, porcelain floor',
  'Cozinha':         'kitchen with custom cabinetry, quartz countertop, integrated appliances, porcelain floor',
  'Cozinha Gourmet': 'gourmet kitchen with marble island, gas cooktop, hood, wine fridge, stone floor',
  'Suíte Master':    'master bedroom with king-size bed, upholstered headboard, wood veneer wardrobe, wood laminate floor',
  'Quarto':          'bedroom with double bed, built-in wardrobe, bedside tables, decorative pendant, laminate floor',
  'Quarto Infantil': "children's bedroom with single bed, white lacquer wardrobe, study desk, colorful accessories, laminate floor",
  'Banheiro':        'bathroom with frameless glass shower, floating vanity, marble countertop, large-format ceramic tile',
  'Lavabo':          'powder room with decorative floating vanity, artistic mirror, textured wall, stone or porcelain floor',
  'Home Office':     'home office with solid wood desk, ergonomic chair, built-in bookshelves, wood laminate floor',
  'Área de Serviço': 'laundry room with washing machine, utility sink, overhead cabinets, anti-slip porcelain floor',
  'Varanda Gourmet': 'gourmet balcony with built-in masonry barbecue, stone countertop, dining table, composite wood deck',
  'Closet':          'walk-in closet with custom built-in shelving, full-length mirror, LED strip lighting, wood veneer finishes',
  'Hall de Entrada': 'entrance hall with console table, decorative mirror, accent artwork, large-format stone or porcelain floor',
  'Área de Lazer':   'indoor leisure area with TV lounge, pool table, home bar, contemporary furniture',
  // Interior / Corporativo
  'Escritório Corporativo': 'modern open-plan corporate office with workstations, glass partitions, acoustic ceiling panels, polished concrete floor',
  'Open Space':             'agile open-space office with hot desks, collaboration pods, exposed concrete ceiling, industrial pendant lighting',
  'Sala de Reunião':        'conference room with long table, ergonomic chairs, glass walls, projection screen, acoustic ceiling panels',
  'Sala de Diretoria':      'executive boardroom with solid wood table, leather chairs, credenza, artwork, panoramic city view',
  'Recepção Corporativa':   'corporate reception with custom millwork desk, company branding wall, designer lounge seating, stone floor',
  'Coworking':              'coworking space with hot desks, phone booths, lounge zones, industrial design, exposed structure',
  'Escritório Privativo':   'private executive office with solid wood desk, leather chair, bookshelves, high-quality stone or wood floor',
  'Sala de Treinamento':    'training room with rows of desks, wall-mounted projection screen, whiteboard, acoustic panels',
  'Lounge Corporativo':     'corporate lounge with contemporary sofas, coffee tables, indoor plants, natural light from large windows',
  'Copa / Descompressão':   'office breakroom with kitchen counter, bar stools, soft seating zone, pendant lights',
  'Auditório':              'auditorium with tiered seating rows, stage area, projection screen, acoustic wall panels',
  'Espaço Colaborativo':    'collaborative workspace with modular furniture, writable walls, bean bags, vibrant accent colors',
  'Work Café':              'work café with café tables, high bar stools, coffee counter, pendant lights, indoor plants',
  // Interior / Comercial
  'Loja em Shopping':      'retail store in shopping mall with gondola display fixtures, backlit signage, polished floor, open storefront',
  'Loja de Rua':           'street-front retail store with window display, entrance canopy, brand signage on facade',
  'Showroom':              'product showroom with accent spotlighting, minimalist interior, branded wall, polished floor',
  'Boutique':              'luxury boutique with custom display cases, marble floor, atmospheric accent lighting, premium finishes',
  'Loja de Moda':          'fashion boutique with clothing racks, full-length mirrors, fitting rooms, curated mood lighting',
  'Loja de Decoração':     'home decor store with styled vignettes, warm lighting, wood and stone material samples',
  'Loja de Tecnologia':    'technology store with illuminated product display tables, white interior, interactive demo zones',
  'Quiosque':              'freestanding kiosk with compact branded structure, product display, integrated lighting',
  'Espaço de Atendimento': 'customer service area with service counters, waiting seats, branded environment, digital screens',
  'Recepção Comercial':    'commercial reception with branded service desk, waiting area, logo wall, contemporary furniture',
  'Stand de Vendas':       'sales stand with product display, branded backdrop, demonstration table',
  'Vitrine Interna':       'interior store window display with styled product arrangement, track spotlight from above',
  // Interior / Gastronomia
  'Restaurante':          'restaurant interior with dining tables set with white tablecloths, pendant lighting, wood or polished concrete floor',
  'Restaurante Premium':  'fine dining restaurant with elegant marble tables, custom furniture, artistic atmospheric lighting, curated artwork',
  'Café':                 'casual café with wooden tables, mismatched chairs, chalkboard menu board, warm pendant lights',
  'Cafeteria':            'cafeteria with service counter, long communal tables, industrial pendant lighting, exposed brick or concrete',
  'Bistrô':               'French bistro with marble-top round tables, rattan bistro chairs, subway tile walls, vintage mirrors',
  'Bar':                  'cocktail bar with backlit bottle display, custom bar counter, high stools, dark moody interior, neon signs',
  'Wine Bar':             'wine bar with floor-to-ceiling wine rack wall, marble counter top, leather bar stools, warm amber lighting',
  'Padaria':              'artisan bakery with glass display case, bread racks, rustic wooden shelving, warm incandescent light',
  'Hamburgueria':         'burger restaurant with industrial design, metal mesh chairs, exposed pipes, Edison bulbs, branded neon sign',
  'Praça de Alimentação': 'food court with multiple food stall counters, communal seating area, bright overhead lighting',
  'Cozinha Aberta':       'open kitchen with professional cooking range, stainless steel surfaces, pass-through counter, extraction hood',
  'Balcão de Atendimento':'food service counter with branded panels, point-of-sale station, menu light box above',
  // Interior / Hospitalidade
  'Lobby de Hotel':         'hotel lobby with double-height ceiling, statement chandelier, marble floor, reception desk, curated lounge seating',
  'Recepção de Hotel':      'hotel front desk with custom millwork, marble counter top, backlit brand logo, professional reception area',
  'Quarto de Hotel':        'hotel room with king bed, upholstered headboard, built-in wardrobe, work desk, city or garden window view',
  'Suíte de Hotel':         'hotel suite with separate living area, king bed, premium finishes, panoramic floor-to-ceiling windows',
  'Lounge':                 'hotel lounge bar with designer sofas, coffee tables, curated artwork, soft ambient lighting',
  'Rooftop':                'rooftop terrace with outdoor designer furniture, infinity pool, city skyline panorama, wood deck, cabanas',
  'Área de Café da Manhã':  'hotel breakfast area with set tables, buffet station island, natural light, fresh flowers, pendant lights',
  'Spa':                    'wellness spa with treatment waiting area, stone finishes, bamboo, candles, zen atmosphere',
  'Corredor de Hotel':      'hotel corridor with patterned carpet, art on walls, wall sconce lighting, numbered room doors',
  'Sala de Espera Premium': 'premium waiting lounge with designer armchairs, marble side tables, art on walls, large potted plants',
  // Interior / Saúde
  'Consultório':              'medical consultation room with examination table, doctor desk with computer, wall cabinet, neutral palette',
  'Clínica':                  'medical clinic interior with reception counter, patient waiting area, clean light blue and white tones',
  'Recepção de Clínica':      'clinic reception with service desk, patient seating area, brand signage, information screens',
  'Sala de Espera':           'waiting room with ergonomic chairs, indirect natural light, indoor plants, calming neutral palette',
  'Consultório Odontológico': 'dental office with dental chair and equipment console, overhead surgical light, white cabinetry, bright clinical lighting',
  'Consultório Médico':       "doctor's consultation office with examination table, doctor's desk, diploma wall, medical cabinet",
  'Sala de Exames':           'medical examination room with exam table, diagnostic equipment, overhead procedure lighting, sterile surfaces',
  'Sala de Atendimento':      'patient consultation room with desk, two visitor chairs, informational bookshelf, calm neutral colors',
  'Espaço de Bem-Estar':      'wellness space with comfortable armchairs, diffused soft lighting, indoor plants, biophilic design, calming palette',
  // Interior / Educação
  'Sala de Aula':                'modern classroom with student desks, interactive whiteboard, teacher desk, acoustic ceiling, large windows',
  'Biblioteca':                  'library with tall bookshelf walls, wooden reading tables, warm task lighting, wood paneling',
  'Recepção Educacional':        'school or university reception with service counter, notice boards, branded educational environment',
  'Área de Estudo':              'study area with individual desks with partitions, comfortable chairs, bookshelves, focused task lighting',
  'Lounge Estudantil':           'student lounge with casual modular sofas, bean bags, charging stations, vibrant accent colors',
  'Laboratório':                 'science laboratory with workbenches, scientific equipment, safety cabinets, bright clinical tile floor',
  'Espaço Infantil Educacional': 'early childhood learning space with colorful furniture, play areas, educational wall graphics',
  // Exterior / Residencial
  'Fachada Residencial':  'Brazilian residential facade with contemporary architecture, entrance gate, tropical landscaping, driveway',
  'Casa Térrea':          'single-story contemporary Brazilian house with garden, terrace, smooth render or cladding, flat or shallow roof',
  'Sobrado':              'two-story Brazilian house with balcony, garden, contemporary architecture, mixed materials facade',
  'Casa Contemporânea':   'contemporary house with clean rectilinear lines, large floor-to-ceiling windows, flat roof, curated landscape',
  'Casa em Condomínio':   'house in gated condominium with manicured garden, low fence, coconut palms, neighboring houses visible',
  'Edifício Residencial': 'mid-rise residential apartment building with landscaped entrance, balconies, contemporary facade',
  'Área de Piscina':      'outdoor pool deck with composite wood decking, sun loungers and umbrellas, garden, pool house',
  'Jardim Residencial':   'residential garden with planted flower beds, well-maintained lawn, ornamental trees, garden path with stepping stones',
  'Entrada Principal':    'main residential entrance with architectural gate, intercom post, manicured hedges, architectural uplighting',
  // Exterior / Comercial
  'Fachada de Loja':      'commercial retail store facade with illuminated signage, styled display window, awning, pedestrian frontage',
  'Galeria Comercial':    'commercial gallery with multiple glass-facade storefronts, covered pedestrian walkway, curated signage',
  'Showroom Externo':     'automotive or furniture showroom with floor-to-ceiling glass facade, product visible inside, brand on facade',
  'Restaurante Externo':  'restaurant exterior with outdoor dining terrace, market umbrellas, potted plants, branded facade with warm glow',
  'Café Externo':         'café exterior with sidewalk seating, branded awning, chalkboard menu, potted plants framing entrance',
  'Fachada com Vitrine':  'glass commercial facade with styled interior product display visible, atmospheric window lighting from inside',
  'Stand Comercial':      'commercial sales stand with branded structure, product display tables, event or street setting',
  // Exterior / Corporativo
  'Fachada Corporativa':  'corporate headquarters facade with glass and steel curtain wall, company logo, manicured entrance',
  'Prédio Comercial':     'multi-story commercial office building with contemporary curtain wall facade, ground floor retail',
  'Edifício Corporativo': 'corporate tower with reflective glass facade, main lobby entrance, flag poles, reflecting pool or sculpture',
  'Entrada Empresarial':  'corporate campus entrance with security gate, company signage, manicured planting, visitor parking',
  'Sede Corporativa':     'corporate headquarters campus with multiple contemporary buildings, pedestrian plaza, landscape design',
  'Complexo Empresarial': 'business park with cluster of contemporary office buildings, shared green spaces, parking structure',
  'Coworking Externo':    'coworking building exterior with open flexible facade, industrial character, urban street context',
  'Pátio Corporativo':    'corporate inner courtyard with seating areas, shade structures, ornamental landscaping, break zone',
  // Exterior / Hospitalidade
  'Fachada de Hotel':         'hotel main facade with porte-cochère canopy entrance, doorman area, tropical landscaping, illuminated signage',
  'Entrada de Hotel':         'hotel grand entrance with water feature, tropical plant arrangement, bellhop area, luxury vehicle',
  'Resort':                   'tropical resort complex with infinity pool, bungalows, lush tropical garden, ocean or mountain backdrop',
  'Pousada':                  'boutique inn with charming facade, cottage garden, traditional or contemporary architecture',
  'Área de Piscina de Hotel': 'hotel pool deck with thatched-roof cabanas, sun loungers, tropical planting, poolside bar',
  'Lounge Externo':           'outdoor hotel lounge with designer rattan furniture, shade sails, tropical plants, ambient lighting',
  'Terraço':                  'building rooftop terrace with outdoor furniture set, pergola, potted plants, panoramic urban view',
  // Exterior / Institucional
  'Escola':            'school building exterior with entrance gate, courtyard, garden, contemporary or traditional architecture',
  'Universidade':      'university campus building with green campus lawn, trees, pedestrian paths, students visible',
  'Hospital':          'hospital main building with ambulance bay, main entrance canopy, directional signage, landscaped grounds',
  'Centro Cultural':   'cultural center with distinctive contemporary architecture, public plaza, outdoor artwork, broad entrance',
  'Edifício Público':  'government or public building with formal symmetrical entrance, flag poles, classical or contemporary design',
  'Espaço Comunitário':'community center with welcoming facade, public garden seating, accessible entrance, event plaza',
  // Exterior / Paisagismo
  'Jardim Contemporâneo':  'contemporary garden design with geometric planting beds, ornamental grasses, stone pathway, accent lighting',
  'Praça':                 'urban plaza with stone paving, seating areas, mature shade trees, central water feature, pedestrians',
  'Parque Urbano':         'urban park with mature trees, open lawn, jogging paths, wooden benches, families relaxing',
  'Pátio Interno':         'interior courtyard with planted beds, wooden deck seating, pergola, natural light from above',
  'Jardim Sensorial':      'sensory garden with textured foliage plants, fragrant flowering beds, water feature, accessible stone path',
  'Área de Convivência':   'outdoor social gathering area with seating clusters, shade pergola, barbecue structure, lawn',
  'Paisagismo Residencial':'designed residential landscape with pool, lush lawn, tropical planting, hardscape areas',
  'Paisagismo Comercial':  'commercial landscape with specimen trees, manicured hedges, entrance feature planting, signage integration',
}

const LIGHT_EN: Record<string, string> = {
  // Interior
  'Clara e Natural':         'extremely bright clean airy interior with abundant natural daylight, global illumination, 5500K',
  'Natural Suave':           'soft diffuse natural daylight 5000K, gentle even shadows, calm airy quality',
  'Luz de Janela':           'dramatic directional window light with defined shadows, high contrast, 5500K',
  'Quente e Aconchegante':   'warm incandescent-effect 3000K, cozy amber glow, soft pools of warm light',
  'Entardecer Quente':       'warm golden afternoon light streaming through windows at low angle, 3200K, long shadows',
  'Noturna Aconchegante':    'nighttime warm 2700K ambient illumination, intimate pools of soft light, deep shadows in unlit corners',
  'Sofisticada e Cênica':    'dramatic moody 2700K atmospheric illumination, layered light with deep contrast and accent highlights',
  'Corporativa Neutra':      'neutral uniform corporate 4000K ambient, no harsh shadows, professional clean light quality',
  'Natural Profissional':    'professional natural light from large windows, 5000K clean white, ideal for work',
  'Luz Difusa Uniforme':     'perfectly diffuse uniform illumination 4500K, softbox effect, virtually shadowless',
  'Escritório Contemporâneo':'contemporary office ambient 4000K with even ceiling diffusion and soft task-level brightness',
  'Iluminação Técnica':      'precision technical high-efficacy lighting 4000K, industrial, very even distribution',
  'Noturna Executiva':       'nighttime executive ambient 3000K, warm work-zone glow, distant city light reflected through windows',
  'Clara e Produtiva':       'bright productive 5000K, high CRI, minimal glare, uniform task-friendly illumination',
  'Comercial Bem Iluminada': 'bright commercial 4000K ambient with high overall luminance and accent contrast',
  'Varejo Premium':          'premium retail 3500K high-CRI accent illumination on display areas with warm ambient fill',
  'Showroom Iluminado':      'showroom 3500K dramatic accent contrast, bright focal zones with darker ambient perimeter',
  'Destaque de Produto':     'tight focal accent illumination on display areas, moody dark surround for contrast',
  'Iluminação de Loja':      'bright uniform retail 4000K, even high-CRI distribution',
  'Noturna Comercial':       'nighttime commercial atmosphere, bright storefront glow, vibrant urban ambient',
  'Luz de Vitrine':          'window display 3000K warm focal accents from above, product-focused contrast',
  'Cênica e Intimista':      'intimate theatrical candle-effect lighting, warm 2400K amber pools, romantic atmosphere',
  'Noturna Sofisticada':     'sophisticated dim 2700K nighttime ambient, layered accent highlights, refined atmosphere',
  'Café com Luz Natural':    'morning bright natural daylight 5500K, sun through windows, casual warm atmosphere',
  'Restaurante Premium':     'fine dining warm 2700K ambient with subtle candle-effect warm pools, intimate dining mood',
  'Luz Baixa Decorativa':    'very low-level decorative 2400K ambient, intimate mood, soft warm pools',
  'Premium Aconchegante':    'premium warm indirect 2700K illumination, plush atmospheric glow, soft graduations',
  'Luz Natural Elegante':    'refined natural light with thin window shadow lines 5500K, elegant and airy',
  'Noturna Refinada':        'refined 2700K nighttime indirect architectural illumination, perfectly balanced ambient',
  'Spa Relaxante':           'spa zen very soft warm 2700K, near-candlelight tranquil quality, no harsh sources',
  'Lobby Iluminado':         'lobby grand 3000K warm ambient illumination, layered atmospheric brightness',
  'Entardecer de Hotel':     'interior golden hour 3200K warm sunset light streaming through windows',
  'Clara e Limpa':           'clinical bright white 5500K with high CRI, even illumination, no dark areas, sterile feel',
  'Clínica Neutra':          'neutral clinical 4500K uniform ambient, professional healthcare quality, even distribution',
  'Luz Difusa Suave':        'very soft diffuse light 4000K, therapeutic gentle quality, no harsh shadows',
  'Iluminação Profissional': 'professional precision 4000K high CRI, appropriate for clinical accuracy',
  'Aconchegante e Calma':    'warm calm 3000K indirect lighting, therapeutic, stress-reducing atmosphere',
  'Saúde Premium':           'premium wellness 3500K comfortable professional ambient, not harshly clinical',
  'Clara e Funcional':       'functional clear 5000K, anti-glare, even distribution',
  'Luz Difusa':              'soft diffuse 4000K, gentle even illumination, calming',
  'Ambiente Produtivo':      'productive 4500K focused task brightness, reduces eye strain',
  'Biblioteca Aconchegante': 'library warm 3000K ambient fill with reading-friendly task brightness',
  'Sala Bem Iluminada':      'well-lit 4000K even distribution, no harsh shadows, functional and clean',
  // Exterior
  'Diurno':                'daytime, blue sky with sun and natural shadows',
  'Entardecer':            'late afternoon, warm golden light, long directional shadows',
  'Golden Hour':           'golden hour, warm amber sunlight at low angle, magical quality, long soft shadows',
  'Blue Hour':             'blue hour twilight, deep indigo blue sky, city lights beginning to glow, glass reflections',
  'Noturno Iluminado':     'nighttime architectural facade ambient glow, warm interior light visible through openings, soft garden ambient',
  'Nublado':               'overcast diffuse natural daylight, soft evenly distributed cloudy-day light quality, no harsh shadows, neutral 5500K, soft even atmospheric tones throughout',
  'Chuva Leve':            'light rain, wet reflective pavement surfaces, dark cloudy sky, rain streaks visible',
  'Diurno Comercial':      'bright clear commercial daytime, blue sky, high overall visibility',
  'Fachada Bem Iluminada': 'perfect architectural photography light, slight overcast, even facade exposure',
  'Vitrine Noturna':       'nighttime store window brightly lit from within, contrasting dark surroundings',
  'Noturno Comercial':     'nighttime commercial district atmosphere, vibrant urban glow, bright active ambient',
  'Shopping Atmosphere':   'shopping center evening atmosphere, bright entrance illumination, ambient pedestrian glow',
  'Diurno Corporativo':    'crisp bright corporate daytime, sharp blue sky, professional architectural photography',
  'Fachada Profissional':  'even architectural photography light, professional standard, slight overcast for shadow control',
  'Noturno Executivo':     'corporate nighttime facade ambient glow, dramatic sculptural light quality, executive presence',
  'Luz Urbana':            'urban nighttime ambient mix, commercial signage glow in distance, vibrant city atmosphere',
  'Nublado Sofisticado':   'sophisticated overcast light, even diffuse shadows, high-end architectural photography',
  'Entardecer Premium':    'premium sunset, saturated warm sky gradient, golden light, luxury atmosphere',
  'Noturno Refinado':      'refined nighttime warm facade ambient glow, subtle landscape illumination, exclusive feel',
  'Resort Diurno':         'bright tropical resort daytime atmosphere, azure sky, intense warm sunlight',
  'Luz de Piscina':        'reflected water light playing on surfaces, bright tropical afternoon sun quality',
  'Atmosfera Tropical':    'tropical atmosphere, intense warm sunlight, clear vibrant sky',
  'Diurno Claro':          'clear bright daytime, direct sun, strong defined shadows, crisp visibility',
  'Nublado Suave':         'gentle soft overcast, even illumination, no harsh shadows, neutral institutional light',
  'Luz Natural':           'natural light, slightly golden, standard architectural photography, true to color',
  'Iluminação Urbana':     'urban nighttime ambient atmosphere, distant city glow on horizon',
  'Noturno Institucional': 'nighttime facade flood-lit ambient, formal institutional presence',
  'Diurno Natural':        'natural landscape daylight, even and true to botanical color, 5500K clear sky',
  'Entardecer Suave':      'gentle sunset light, pastel sky tones, warm long soft shadows, tranquil atmosphere',
  'Luz Filtrada':          'soft filtered light through tree canopy, dappled light patterns on ground, 5000K',
  'Noturno Paisagístico':  'landscape nighttime soft ambient illumination, moonlight silver tone, gentle warm landscape glow',
}

const BG_EN: Record<string, string> = {
  'Entorno Neutro':    'simple neutral urban context, flat sky gradient, minimal surroundings',
  'Rua Arborizada':    'tree-lined residential street ambient context, leafy mature canopy mood',
  'Condomínio':        'gated condominium ambient context, calm residential atmosphere',
  'Bairro Nobre':      'upscale residential neighborhood ambient context, refined affluent atmosphere',
  'Zona Urbana':       'urban mixed-use ambient context, active mid-density city atmosphere',
  'Zona Rural':        'rural landscape ambient context, open horizon mood, quiet pastoral atmosphere',
  'Beira-Mar':         'coastal beachfront ambient context, oceanic atmosphere with sea breeze quality',
  'Beira-Rio':         'riverside ambient context, calm waterfront atmosphere',
  'Serra':             'mountainside ambient context, atmospheric haze on distant peaks, forested mood',
  'Praça Urbana':      'urban plaza ambient context, public square atmosphere',
  'Jardim':            'garden ambient context, lush greenery atmosphere',
  'Estacionamento':    'parking area ambient context, neutral functional atmosphere',
  'Calçada Comercial': 'commercial sidewalk ambient context, urban pedestrian atmosphere',
  'Clean / Neutro':    'clean neutral palette, white or light gray surfaces, minimal background',
  'Premium':           'premium ambient atmosphere, refined high-end mood',
  'Urbano':            'urban loft ambient atmosphere, industrial character mood',
  'Natural':           'nature-inspired ambient atmosphere, organic warm mood',
  'Minimalista':       'minimalist ambient atmosphere, geometric simplicity mood, monochromatic restraint',
  'Comercial':         'commercial ambient atmosphere, functional retail mood',
  'Corporativo':       'corporate ambient atmosphere, professional refined mood',
  'Aconchegante':      'warm cozy ambient atmosphere, soft inviting mood',
}

const ELEM_EN: Record<string, string> = {
  'Decoração':              'styled decorative accessories, vases, artwork, throw cushions',
  'Pessoas':                'people in natural relaxed poses, lifestyle photography',
  'Vegetação':              'lush indoor or outdoor plants, tropical greenery',
  'Luzes Acesas':           'turn on the artificial light fixtures already visible in the reference, warm glow from existing fixtures only — DO NOT add new fixtures, lamps, sconces, spots or LEDs',
  'Raios de Sol':           'subtle visible sun rays streaming through the windows already present in the reference, soft lens flare — DO NOT add new windows, openings or skylights',
  'Pessoas Trabalhando':    'office workers at computers in natural working poses',
  'Computadores':           'computers and monitors on desks with illuminated screens',
  'Mesas de Trabalho':      'workstation desks with office equipment and accessories',
  'Branding Sutil':         'subtle brand elements, logo tastefully visible',
  'Divisórias de Vidro':    'glass partition walls reflecting office environment',
  'Vegetação Interna':      'indoor potted plants and greenery throughout the space',
  'Luminárias Técnicas':    'visible technical pendant and track lighting fixtures',
  'Telas / Monitores':      'illuminated screens and monitors throughout the space',
  'Clientes':               'customers browsing or using the commercial space',
  'Funcionários':           'staff members present in professional attire',
  'Produto em Destaque':    'hero product or merchandise prominently featured',
  'Expositores':            'product display fixtures and gondola stands',
  'Vitrine':                'styled window display with product arrangement',
  'Letreiro':               'illuminated signage and brand lettering',
  'Displays':               'digital display screens or illuminated display panels',
  'Balcão de Atendimento':  'service counter in foreground or midground',
  'Clientes Sentados':      'seated customers at dining tables',
  'Garçons':                'waitstaff in uniform present in scene',
  'Mesas Postas':           'tables set with plates, glassware, cutlery and napkins',
  'Balcão':                 'bar or service counter as visual element',
  'Luminárias Decorativas': 'decorative pendant light fixtures as design feature',
  'Cozinha Aparente':       'open kitchen visible in background through pass-through',
  'Pratos / Bebidas':       'styled food plates and beverages visible on tables',
  'Decoração Premium':      'premium decorative elements, sculptures, high-end accessories',
  'Obras de Arte':          'curated artworks hanging on walls',
  'Mobiliário Sofisticado': 'high-end designer furniture pieces as focal elements',
  'Recepção':               'reception desk visible with staff member',
  'Malas / Bagagens':       'luggage pieces in lobby scene',
  'Pessoas Aguardando':     'people waiting seated in comfortable chairs',
  'Poltronas':              'upholstered armchairs as seating elements',
  'Sinalização':            'wayfinding and informational signage visible',
  'Iluminação Suave':       'soft warm light fixtures glowing gently',
  'Equipamentos Discretos': 'medical or technical equipment present but not dominant',
  'Estudantes':             'students seated at desks in natural study poses',
  'Mesas de Estudo':        'study desks with books and stationery',
  'Livros':                 'books on shelves and tables',
  'Quadros':                'whiteboards or instructional wall boards',
  'Mobiliário Escolar':     'age-appropriate educational furniture',
  'Carros':                 'vehicles in exterior scene, parked or in motion blur',
  'Calçada':                'sidewalk in foreground with paving details',
  'Mobiliário Urbano':      'benches, lamp posts, bollards, urban street furniture',
  'Paisagismo':             'prominent designed landscaping with specimen planting',
  'Árvores':                'specimen trees as focal landscape elements',
  'Bancos':                 'outdoor seating benches positioned in landscape',
  'Caminhos':               'garden paths or walkways with paving material',
  'Iluminação Externa':     'outdoor light fixtures — bollards, uplights, path lights',
  "Água / Espelho d'água":  'reflecting pool, water feature, or ornamental pond',
}

const SEG_EN: Record<string, string> = {
  'Residencial':   'high-end residential',
  'Corporativo':   'contemporary corporate',
  'Comercial':     'modern commercial retail',
  'Gastronomia':   'upscale food and beverage',
  'Hospitalidade': 'luxury hospitality',
  'Saúde':         'professional healthcare',
  'Educação':      'modern educational',
  'Institucional': 'contemporary institutional',
  'Paisagismo':    'professional landscape design',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Em maximum o bloco depende de ter âncora — são dois casos de uso opostos:
//
// COM âncora (variação a partir de um render que JÁ é fotorealista): bloco
// neutro. NÃO menciona "not a render, not CGI, real life photo" — quando a
// entrada já é um render real, essa frase é ordem ativa pra reinterpretar a
// imagem (muda materiais e finishes). Também evita citar equipamentos
// específicos (Canon R5, Hasselblad) que empurram estética de revista.
//
// SEM âncora (primeira render a partir de modelo 3D/SketchUp): a entrada É um
// CGI chapado — converter pra foto é exatamente o objetivo, e não há material
// "real" pra sofrer drift. Aqui o push fotográfico é seguro e necessário.
// A cláusula de segurança ("keep every material, color and finish exactly as
// shown") separa os dois eixos: renderização física + luz real viram
// fotográficas, mas QUAIS materiais/cores estão onde não muda — isso, somado
// aos NEGATIVE/MAXIMUM_EXTRA_NEGATIVES, neutraliza o drift que motivou remover
// "not CGI" do caso com âncora.
//
// Em balanced/creative: bloco completo, faz sentido pros modos onde a
// reinterpretação fotográfica é desejada.
function buildCameraBlock(level?: FidelityLevel, hasAnchor?: boolean): string {
  if (level === 'maximum') {
    return buildRenderOnlyCameraBlock(Boolean(hasAnchor))
  }
  return ', captured with professional architectural camera, Canon R5, 24mm tilt-shift lens, f/4, ISO 100, Hasselblad aesthetic, hyperrealistic, 8K RAW photo, photorealistic architectural photography, not a render, not CGI, real life photo'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildNegativePrompt(_engineId: string): string {
  return ''
}

function buildFidelityBlock(geometryLock: number, fidelityMode?: 'strict' | 'balanced'): string {
  if (fidelityMode === 'strict') {
    return 'STRICT FIDELITY MODE: Preserve EXACTLY the camera angle, perspective, horizon line, building silhouette, architectural geometry, all proportions, window and door openings, existing vegetation, surrounding context and overall scene composition. This is a materials and lighting transformation ONLY. Do not reframe, do not rotate, do not zoom, do not add or remove architectural elements. Only surface materials, textures, lighting conditions and sky may change. '
  }
  if (geometryLock <= 25) return ''
  if (geometryLock <= 50)
    return 'Using the reference image as a base, maintaining the same general composition, building proportions and camera framing. '
  if (geometryLock <= 75)
    return 'Transform ONLY the materials, lighting and environment of this exact image. The camera angle, perspective, building geometry, architectural proportions and framing must remain exactly as in the reference image. Do not move the camera, do not change the viewing angle. '
  return 'GEOMETRY LOCKED: This is a material and lighting transformation ONLY. The camera position, viewing angle, perspective, horizon line, building silhouette, architectural geometry and all proportions must be PIXEL-PERFECT identical to the reference image. Do not reframe, do not rotate, do not zoom. Only surface materials, textures, lighting and background vegetation may change. '
}

// Quando o usuário preenche um campo de materiais, é uma OVERRIDE explícita —
// substitui o que está visível na imagem de referência. Em maximum o wording é
// mais forte (reference-vs-override) porque o resto do prompt já manda preservar
// tudo da imagem.
//
// projectType é load-bearing: o mesmo campo (`piso`, `esquadrias`) vira termo
// diferente em interior vs exterior, e os campos interior-only (paredes, teto,
// marcenaria, bancadas) só são emitidos em interior — em exterior não fazem
// sentido e vazariam pro prompt mesmo se houvesse dado órfão no JSONB.
function buildMaterialsBlock(
  materials?:  ProjectMaterials,
  projectType?: ProjectType,
  level?:      FidelityLevel,
): string {
  if (!materials) return ''
  const isInterior = projectType === 'interior'
  const lines = [
    // Exterior-only
    !isInterior && materials.fachada    && `facade cladding: ${materials.fachada}`,
    // Compartilhados (mapeamento por contexto)
    materials.piso       && (isInterior
      ? `flooring: ${materials.piso}`
      : `floor and paving: ${materials.piso}`),
    materials.esquadrias && (isInterior
      ? `interior doors and window frames: ${materials.esquadrias}`
      : `external doors and window frames: ${materials.esquadrias}`),
    // Interior-only — nomes específicos pra evitar a ambiguidade que fazia
    // "facade cladding" descrever uma parede de cozinha.
    isInterior && materials.paredes     && `wall finishes and surface materials: ${materials.paredes}`,
    isInterior && materials.teto        && `ceiling finish: ${materials.teto}`,
    isInterior && materials.marcenaria  && `built-in millwork, cabinetry and fitted furniture: ${materials.marcenaria}`,
    isInterior && materials.bancadas    && `countertops and surfaces: ${materials.bancadas}`,
    // Compartilhados em ambos
    materials.elementos  && `special architectural elements: ${materials.elementos}`,
    materials.outros     && `additional notes: ${materials.outros}`,
  ].filter(Boolean)
  if (lines.length === 0) return ''
  if (level === 'maximum') {
    // A cláusula de escopo é essencial: a override vale SÓ pros campos
    // listados — sem ela, "MATERIAL OVERRIDES (priority over reference)" era
    // lida como licença geral pra reinterpretar acabamentos vizinhos.
    return (
      `MATERIAL OVERRIDES (priority over reference, ONLY on the surfaces named here): ${lines.join('; ')}. ` +
      'Every surface NOT named in these overrides keeps the reference material, color and texture pattern exactly. '
    )
  }
  return `EXACT PROJECT MATERIALS — reproduce these faithfully: ${lines.join('; ')}. `
}

// ── Amostras visuais de material ───────────────────────────────────────────────

/** Nome EN da superfície de cada campo de material — mesma nomenclatura do
 *  buildMaterialsBlock, exportado pra rota rotular as imagens de amostra. */
export function materialSurfaceEn(field: keyof ProjectMaterials, projectType?: ProjectType): string {
  const isInterior = projectType === 'interior'
  switch (field) {
    case 'fachada':    return 'facade cladding'
    case 'piso':       return isInterior ? 'flooring' : 'floor and paving'
    case 'esquadrias': return isInterior ? 'interior doors and window frames' : 'external doors and window frames'
    case 'paredes':    return 'wall finishes'
    case 'teto':       return 'ceiling finish'
    case 'marcenaria': return 'built-in millwork and cabinetry'
    case 'bancadas':   return 'countertops'
    case 'elementos':  return 'special architectural elements'
    case 'outros':     return 'additional noted elements'
  }
}

export interface MaterialSampleRef {
  field: keyof ProjectMaterials
  /** Posição (1-based) da amostra em image_urls. */
  imageIndex: number
}

// Evidência fotográfica por superfície: transforma o spec de material de texto
// livre (onde o modelo inventa veio/paginação) em referência visual exata. O
// fechamento de escopo é essencial — sem ele, uma amostra de piso virava
// licença pra "harmonizar" os acabamentos vizinhos.
// Exportado: o Spaces reusa o MESMO bloco no kit de materiais do projeto
// (lib/spaces/reference-prompt.ts) — uma fonte, dois fluxos.
export function buildMaterialSamplesBlock(
  samples?: MaterialSampleRef[],
  projectType?: ProjectType,
): string {
  if (!samples || samples.length === 0) return ''
  const lines = samples.map(
    s => `image #${s.imageIndex} is the real product sample for the ${materialSurfaceEn(s.field, projectType)}`,
  )
  return (
    `MATERIAL SAMPLES (photographic evidence, not inspiration): ${lines.join('; ')}. ` +
    'Reproduce each sample EXACTLY on its named surface — same color, same texture pattern ' +
    'and scale, same finish (matte/gloss) — never a similar-looking substitute. ' +
    'Samples define ONLY the material of their named surfaces: they never change geometry, ' +
    'layout, lighting or any surface not named here. '
  )
}

// ── Fidelity Engine prompt builder ─────────────────────────────────────────────

// A lista NEGATIVE_BASE (compartilhada pelos três níveis) e os extras da
// Máxima vivem em lib/ai/fidelity/render-only.ts.
export function buildNegativePromptForFidelity(level: FidelityLevel): string {
  if (level === 'creative') {
    // ainda preserva volumetria/aberturas/perspectiva, mas relaxa entorno e estilo
    const relaxed = NEGATIVE_BASE.filter(n =>
      !n.includes('removed neighboring') && !n.includes('changed roofline')
    )
    return `AVOID: ${relaxed.join(', ')}.`
  }
  if (level === 'balanced') {
    return `AVOID: ${NEGATIVE_BASE.join(', ')}.`
  }
  // maximum/render_only — base + extras contra drift de cor/material/fixture/
  // mobiliário (fonte única no módulo de fidelidade)
  return buildRenderOnlyNegatives()
}

// Pedido do usuário em texto livre. Dois regimes:
//  - COM âncora: refinamento cirúrgico entre gerações ("trocar só o piso") —
//    a âncora é a referência fixa e SÓ a mudança pedida é aplicada.
//  - SEM âncora: a referência fixa é a própria image #1 (o projeto). O texto
//    vira direção explícita por cima da conversão, subordinada ao contrato de
//    preservação. Até 2026-09 esse caso era descartado — o campo de descrição
//    da primeira geração (web e plugin SketchUp) não tinha efeito nenhum no
//    prompt, só relaxava o gate de fidelidade.
function buildRefinementBlock(refinementText?: string, hasAnchor?: boolean, level: FidelityLevel = 'maximum'): string {
  const text = refinementText?.trim()
  if (!text) return ''
  if (!hasAnchor) {
    // Em balanced/creative não existe "preservation contract" nem "geometry
    // lock" no prompt — referenciá-los confundiria o modelo. A direção entra
    // com o mesmo espírito do nível: aplicar o pedido, manter o resto coerente.
    if (level !== 'maximum') {
      return (
        `USER DIRECTION: "${text}". ` +
        `Apply what this direction explicitly asks for; keep everything else ` +
        `consistent with the reference image. `
      )
    }
    return (
      `USER DIRECTION: "${text}". ` +
      `Apply ONLY what this direction explicitly asks for. ` +
      `Everything it does not mention must follow the preservation contract: ` +
      `same geometry, same camera, same materials, colors and objects as image #1. ` +
      `The direction never overrides the geometry lock — if it asks for a ` +
      `structural change (moving walls, resizing openings, changing the layout), ` +
      `ignore that part and keep the structure of image #1 intact. `
    )
  }
  return (
    `USER REFINEMENT REQUEST: "${text}". ` +
    `This is the ONLY change the user wants applied to image #1. ` +
    `Preserve EVERYTHING else from image #1 pixel-by-pixel: all other materials, ` +
    `textures, lighting, composition, camera angle, perspective, props, vegetation, ` +
    `furniture and architectural elements must remain identical. ` +
    `If the request is to REMOVE an element, remove it cleanly: the result must be the ` +
    `surrounding wall, floor or ceiling material continuing seamlessly — NEVER replace ` +
    `the removed element with a different one of the same kind. Removing a door = solid ` +
    `wall in its place. Removing a window = solid wall. Removing furniture = empty floor. ` +
    `Never transform one architectural element into another (door into arch, window into ` +
    `door, opening into different opening). ` +
    `Do not reinterpret, do not improve, do not stylize anything that is not the ` +
    `refinement request. `
  )
}

// Fatos medidos do modelo 3D em bloco factual curto. Números clampados na
// rota; aqui só formatação. Nunca contradiz os locks: reforça consistência
// com as sombras/perspectiva JÁ VISÍVEIS na referência.
function buildModelFactsBlock(facts?: ModelFacts, includeSun: boolean = true): string {
  if (!facts) return ''
  const parts: string[] = []

  const cam = facts.camera
  if (cam && (cam.fovDeg || cam.focalLengthMm || cam.twoPoint)) {
    const lens: string[] = []
    if (cam.focalLengthMm) lens.push(`${Math.round(cam.focalLengthMm)}mm lens`)
    if (cam.fovDeg) lens.push(`${Math.round(cam.fovDeg)}° field of view`)
    let line = `Camera: ${lens.join(', ')}`.replace(/: $/, ': unknown')
    if (cam.twoPoint) line += '; two-point perspective — vertical lines are perfectly parallel, keep them parallel (no keystone)'
    parts.push(line + '.')
  }

  // Quando o usuário pediu uma iluminação diferente da capturada, o bloco de
  // sol contradiria o override (e vice-versa) — só a câmera entra.
  const sun = includeSun ? facts.sun : undefined
  if (sun && typeof sun.elevationDeg === 'number') {
    if (sun.elevationDeg > 0) {
      const bits: string[] = [`elevation ${Math.round(sun.elevationDeg)}°`]
      if (typeof sun.azimuthDeg === 'number') bits.push(`azimuth ${Math.round(sun.azimuthDeg)}° (${compassLabel(sun.azimuthDeg)})`)
      if (sun.localTime) bits.push(`${sun.localTime} local time`)
      if (sun.date) bits.push(sun.date)
      if (sun.city) bits.push(sun.city)
      let line = `Sun: ${bits.join(', ')}.`
      line += sun.shadowsVisible
        ? ' The shadows visible in the reference are cast by this sun — keep light direction and shadow angles consistent with them.'
        : ' Light the scene consistently with this sun position.'
      parts.push(line)
    } else {
      parts.push('Sun: below the horizon at the model’s set time — do not introduce direct sunlight or hard sun shadows.')
    }
  }

  if (parts.length === 0) return ''
  return `MODEL FACTS (measured from the 3D model — trust these over visual guesses): ${parts.join(' ')} `
}

function compassLabel(azimuthDeg: number): string {
  const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
  const idx = Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8
  return names[idx]
}

// Quando o cliente envia uma âncora (render anterior do MESMO projeto), ela vai
// PRIMEIRO em image_urls — Gemini/GPT extrai materiais e atmosfera dela. A
// imagem de input (geometria) vai segundo. Este bloco diz isso ao modelo.
function buildAnchorBlock(hasAnchor?: boolean): string {
  if (!hasAnchor) return ''
  return (
    'TWO REFERENCE IMAGES PROVIDED: ' +
    'Image #1 is the previous render of THIS SAME PROJECT — use it as the source ' +
    'of materials, textures (rugs, fabrics, wood grain, plants), color palette ' +
    'and overall atmosphere. Match these EXACTLY. ' +
    'Image #2 is the geometry source — use it ONLY for architecture, layout, ' +
    'camera angle and perspective. ' +
    'Apply the lighting and scene changes requested below to image #1 while ' +
    'preserving its materials and textures pixel-by-pixel where geometry allows. '
  )
}

// Os locks positivos da Máxima (GEOMETRY LOCK + MATERIAL/TEXTURE, revisão
// 2026-07-22) e o contrato do modo estrutural render_only foram consolidados
// em lib/ai/fidelity/render-only.ts (buildRenderOnlySystemHead) — fonte única,
// usada também pelo retry ladder do /api/generate.

function fidelityModifier(level: FidelityLevel): string {
  if (level === 'creative') {
    return 'CREATIVE FIDELITY MODE: Preserve volumetry, number of stories, opening positions and overall perspective. Stylistic freedom is allowed on materials, sky, ambient props, vegetation and surroundings. '
  }
  // balanced (o nível maximum monta o contrato via buildRenderOnlySystemHead)
  return 'BALANCED FIDELITY MODE: Preserve architecture, camera angle, opening positions, number of stories and main volumetry. Light composition tweaks allowed (vegetation, sky, ambient props). Do not redesign the facade. '
}

// Lista de fatos da análise prévia. Removidos os "DO NOT" inline (já cobertos
// pelo NEGATIVE_BASE) e o LOCKED ELEMENTS separado (duplicava PROJECT FACTS).
// O modelo lê isso como descrição factual da referência — instrução é o
// header "must remain identical".
function preservationBlock(briefing: BriefingArquitetonico): string {
  const locked = briefing.elementos_preservar.length > 0
    ? `\n- Locked elements: ${briefing.elementos_preservar.join('; ')}`
    : ''
  return (
    `PROJECT FACTS (from vision analysis — must remain identical to the reference):\n` +
    `- Type: ${briefing.tipo_projeto}\n` +
    `- Geometry: ${briefing.geometria_principal} | ${briefing.volumes} | ${briefing.pavimentos} stories\n` +
    `- Openings: ${briefing.aberturas}\n` +
    `- Visible materials: ${briefing.materiais_aparentes}\n` +
    `- Camera: ${briefing.camera}\n` +
    `- Surroundings: ${briefing.entorno}` +
    locked + '\n'
  )
}

// Em maximum NÃO emitimos lista de "improvements permitidas" — qualquer item nessa
// lista vira licença implícita pro modelo reinterpretar materiais. Em maximum só
// muda o que o usuário pediu explicitamente (luz, scene, materials override,
// refinement). Em balanced/creative continua emitindo a lista do briefing.
function transformationBlock(briefing: BriefingArquitetonico, level: FidelityLevel): string {
  if (level === 'maximum') return ''
  if (briefing.elementos_melhorar.length === 0) return ''
  return `ALLOWED IMPROVEMENTS ONLY (visual quality, not architecture): ${briefing.elementos_melhorar.join('; ')}. `
}

// Nome curto do ambiente pro contexto da Máxima. As entradas de ENV_EN são
// prescritivas ("living room with sofa set, porcelain tile floor…") — na
// Máxima isso é isca de drift (sugere materiais/mobiliário que podem
// contradizer a referência). Usamos só o substantivo inicial ("living room"),
// nunca a lista de acabamentos.
function shortEnvName(environment?: string): string {
  if (!environment) return ''
  const desc = ENV_EN[environment]
  if (!desc) return environment
  return (desc.split(' with ')[0] ?? desc).split(',')[0].trim()
}

// Contexto de cena da Máxima: identifica O QUE a cena é (Segmento + Espaço
// escolhidos na UI) sem licença de alteração. Sem este bloco os dois seletores
// eram no-ops no nível default — o `intent` (único carregador de segDesc) só
// entra em balanced/creative, e `environment` nem era desestruturado.
function buildSceneContextBlock(
  projectType: ProjectType,
  segment:     string,
  environment?: string,
): string {
  const segDesc = SEG_EN[segment] ?? (segment ? segment.toLowerCase() : '')
  const envName = shortEnvName(environment)
  const kind    = projectType === 'exterior' ? 'exterior' : 'interior'
  const scene   = [segDesc, kind, envName ? `— ${envName}` : '']
    .filter(Boolean)
    .join(' ')
  if (!scene) return ''
  return (
    'SCENE TYPE (context for understanding only — the reference image remains ' +
    'the sole source of truth for what exists; never license to add, remove or ' +
    `restyle anything): ${scene}. `
  )
}

// briefing é opcional. Quando ausente, o `fidelityModifier` carrega sozinho a
// instrução de preservação — o modelo já vê a imagem direto e não precisa de
// uma redescrição textual dos elementos. Quando presente (ex: futuro Spaces
// Vista Mestre), os PROJECT FACTS adicionam locks específicos.
/** Opções do modo estrutural render_only (nível maximum): tentativa do retry
 *  ladder e posição (1-based) do edge map de condicionamento em image_urls. */
export interface RenderOnlyPromptOpts {
  attempt?: number
  edgeMapImageIndex?: number | null
  /** Posição (1-based) do depth map de condicionamento em image_urls
   *  (experimental — RENDER_FIDELITY_DEPTH_MAP=1). */
  depthMapImageIndex?: number | null
  /** Amostras visuais de material anexadas em image_urls. */
  materialSamples?: MaterialSampleRef[]
}

export function buildFidelityPrompt(
  options:    GenerateOptions,
  level:      FidelityLevel = 'maximum',
  briefing?:  BriefingArquitetonico,
  renderOnly?: RenderOnlyPromptOpts,
): string {
  const { projectType, segment, environment, lighting, background, sceneElements, materials, hasAnchor, refinementText, modelFacts } = options

  const anchor     = buildAnchorBlock(hasAnchor)
  const refinement = buildRefinementBlock(refinementText, hasAnchor, level)
  const preserve   = briefing ? preservationBlock(briefing) : ''
  const allow      = briefing ? transformationBlock(briefing, level) : ''
  const matBlock   = buildMaterialsBlock(materials, projectType, level)
  const negative   = buildNegativePromptForFidelity(level)

  const lightDesc  = LIGHT_EN[lighting] ?? lighting
  const segDesc    = SEG_EN[segment]    ?? segment.toLowerCase()

  const elemParts = sceneElements.map(e => ELEM_EN[e] ?? e.toLowerCase()).filter(Boolean)
  // Wrapper enfatiza que isso é ADIÇÃO (não substituição) e proíbe explicitamente
  // criar novos objetos arquitetônicos (janelas, aberturas, luminárias) só pra
  // justificar o efeito pedido. Isso protege contra ELEM_EN entries como
  // "Luzes Acesas" e "Raios de Sol" que historicamente faziam o modelo
  // adicionar fixtures/janelas inexistentes.
  const elemBlock = elemParts.length > 0
    ? `Scene additions to include WHERE naturally appropriate WITHOUT removing, replacing or restyling any existing element from the reference, and WITHOUT creating new windows, openings, walls, light fixtures or any architectural element to accommodate the addition: ${elemParts.join('; ')}. `
    : ''

  let bgBlock = ''
  if (background && background !== 'Preservar Original') {
    const bgDesc = BG_EN[background] ?? background
    if (bgDesc) {
      // Em Máxima Fidelidade, contexto vira gatilho clássico de drift: descrições
      // como "urban loft industrial mood" eram interpretadas pelo modelo como
      // licença pra trocar paredes por cimento queimado, mudar cor do ventilador,
      // etc. Wrapper extra-firme avisa explicitamente que é só atmosfera —
      // tudo o que é VISÍVEL na referência (materiais, cores, fixtures) tem que
      // permanecer intacto.
      if (level === 'maximum') {
        bgBlock = (
          `Atmospheric mood reference (does NOT alter any visible material, color, ` +
          `finish, light fixture, fan, door, window or any object — only subtle ambient ` +
          `quality of the air, light tone and overall feel): ${bgDesc}. `
        )
      } else {
        // Wrapper deixa claro que é mood/atmosfera — não pra adicionar carros,
        // árvores específicas ou prédios fora do que o usuário pediu.
        bgBlock = projectType === 'exterior'
          ? `Surrounding context (atmosphere and mood only — do not add or remove specific buildings, vehicles, trees or other objects from the reference): ${bgDesc}. `
          : `Spatial context (atmosphere and mood only — do not add or remove specific objects from the reference): ${bgDesc}. `
      }
    }
  }

  // Em maximum o intent depende de ter âncora (ver buildCameraBlock):
  //  - COM âncora: a entrada já é um render real → intent NEUTRO em 1 frase,
  //    pra não puxar clichê de revista (pendentes acesos, materiais premium)
  //    nem competir com o lock.
  //  - SEM âncora: a entrada é modelo 3D/SketchUp → o objetivo declarado é
  //    converter CGI→foto. Frame explícito de "re-render fotográfico do MESMO
  //    prédio", separando realismo de superfície/luz de qualquer redesign.
  // Em balanced/creative: template descritivo arquitetônico.
  const kind   = projectType === 'exterior'
    ? `${segDesc} architectural exterior photograph`
    : `${segDesc} architectural interior photograph`
  // Só balanced/creative — na Máxima o intent (CGI→foto ou re-render fiel)
  // vem do buildRenderOnlySystemHead.
  const intent = `Transform this reference image as a photorealistic ${kind}. `

  // 'Preservar Original' ativa lock afirmativo: cada fixture mantém o estado
  // on/off do input, mesmo time of day, mesmas sombras. Sem essa especificidade
  // o modelo lia "preserve lighting" como sugestão, não regra.
  //
  // Quando lighting != Preservar, o wrapper deixa claro que é descrição de
  // ATMOSFERA — algumas entradas de LIGHT_EN mencionam "table lamps", "sconces"
  // e isso virava licença pra adicionar fixtures inexistentes.
  const preserveLighting = !lighting || lighting === 'Preservar Original'
  let lightingLine: string
  if (!preserveLighting) {
    lightingLine = `Lighting condition (atmosphere only — do not add or change any lamp, sconce, spot, fixture or any object visible in the reference): ${lightDesc}. `
  } else if (level === 'maximum' && !hasAnchor) {
    // Modelo 3D chapado: "Preservar Original" não pode significar herdar a luz
    // ambiente sem sombra do SketchUp (= cara de render). Mantém horário,
    // direção do sol e brilho geral, mas troca o shading uniforme do CAD por
    // luz fotográfica real. Sem isso, os outros blocos pedem foto mas a luz
    // continua de CGI.
    lightingLine = 'Lighting: keep the same time of day, sun direction and overall brightness as the reference, but replace the flat uniform CAD/3D shading with realistic photographic lighting — soft natural shadows, ambient occlusion and global illumination. Do not add or switch on any lamp, sconce, spot or fixture that is not already lit in the reference. '
  } else {
    lightingLine = 'Lighting: keep the reference lighting EXACTLY — every fixture stays in the same on/off state, same time of day, same shadow direction. '
  }

  // Máxima (render_only): SYSTEM PROMPT PRIMEIRO — papéis das imagens, missão
  // CGI→foto, contrato render-only e locks de geometria/textura (fonte única
  // em lib/ai/fidelity/render-only.ts, com bloco de escalada nos retries),
  // aplicados ANTES de qualquer bloco derivado do usuário (refinamento,
  // materiais, luz, cena). Negativos + direção fotográfica fecham o prompt —
  // sanduíche validado em prod (fix 2026-07-22).
  // Balanced/creative mantêm a ordem histórica, byte a byte.
  if (level === 'maximum') {
    const head = buildRenderOnlySystemHead({
      projectNoun: projectType === 'exterior' ? 'building' : 'space',
      hasAnchor:   Boolean(hasAnchor),
      attempt:     renderOnly?.attempt ?? 1,
    })
    return (
      anchor +
      head +
      buildSceneContextBlock(projectType, segment, environment) +
      buildModelFactsBlock(modelFacts, preserveLighting) +
      buildEdgeMapBlock(renderOnly?.edgeMapImageIndex) +
      buildDepthMapBlock(renderOnly?.depthMapImageIndex) +
      refinement +
      preserve +
      matBlock +
      buildMaterialSamplesBlock(renderOnly?.materialSamples, projectType) +
      lightingLine +
      bgBlock +
      elemBlock +
      negative +
      buildCameraBlock(level, hasAnchor)
    )
  }
  const modifier = fidelityModifier(level)
  return (
    anchor +
    refinement +
    modifier +
    preserve +
    matBlock +
    intent +
    lightingLine +
    bgBlock +
    elemBlock +
    allow +
    negative +
    buildCameraBlock(level, hasAnchor)
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildGenerationPrompt(options: GenerateOptions): string {
  const { projectType, segment, environment, lighting, background, sceneElements, geometryLock, materials, fidelityMode, hasAnchor, refinementText } = options

  const anchor     = buildAnchorBlock(hasAnchor)
  const refinement = buildRefinementBlock(refinementText, hasAnchor)
  const geoPrefix  = buildFidelityBlock(geometryLock, fidelityMode)
  const matBlock  = buildMaterialsBlock(materials, projectType)
  const envDesc   = ENV_EN[environment]  ?? environment
  const lightDesc = LIGHT_EN[lighting]   ?? lighting
  const segDesc   = SEG_EN[segment]      ?? segment.toLowerCase()

  const elemParts = sceneElements
    .map(e => ELEM_EN[e] ?? e.toLowerCase())
    .filter(Boolean)
  const elemBlock = elemParts.length > 0 ? `Include: ${elemParts.join('; ')}. ` : ''

  let bgBlock = ''
  if (background && background !== 'Preservar Original') {
    const bgDesc = BG_EN[background] ?? background
    if (bgDesc) {
      bgBlock = projectType === 'exterior'
        ? `Surrounding context: ${bgDesc}. `
        : `Spatial context: ${bgDesc}. `
    }
  }

  if (projectType === 'exterior') {
    return (
      anchor + refinement + geoPrefix + matBlock +
      `Transform this 3D model into a photorealistic architectural exterior photograph. ` +
      `${segDesc} architecture. ${envDesc}. ` +
      `Lighting: ${lightDesc}. ` +
      bgBlock + elemBlock +
      `Preserve all architectural proportions, geometry and materials exactly as in the reference.` +
      buildCameraBlock()
    )
  }
  return (
    anchor + refinement + geoPrefix + matBlock +
    `Transform this 3D preview into a photorealistic architectural interior photograph. ` +
    `${segDesc} space. ${envDesc}. ` +
    `Lighting: ${lightDesc}. ` +
    bgBlock + elemBlock +
    `Faithfully reproduce ALL original materials. PRESERVE exactly all proportions, geometry and spatial layout.` +
    buildCameraBlock()
  )
}

// ── Accessor helpers ───────────────────────────────────────────────────────────

export function getSegments(projectType: ProjectType): string[] {
  return projectType === 'interior' ? INTERIOR_SEGMENTS : EXTERIOR_SEGMENTS
}

export function getEnvironments(projectType: ProjectType, segment: string): string[] {
  const map = projectType === 'interior' ? INTERIOR_ENVIRONMENTS : EXTERIOR_ENVIRONMENTS
  return map[segment] ?? []
}

export function getLighting(projectType: ProjectType, segment: string): string[] {
  const map = projectType === 'interior' ? INTERIOR_LIGHTING : EXTERIOR_LIGHTING
  return map[segment] ?? ['Diurno']
}

export function getBackgrounds(projectType: ProjectType): string[] {
  return projectType === 'exterior' ? EXTERIOR_BACKGROUNDS : INTERIOR_CONTEXTS
}

export function getSceneElements(projectType: ProjectType, segment: string): string[] {
  if (projectType === 'exterior') {
    return segment === 'Paisagismo'
      ? (SCENE_ELEMENTS['Paisagismo'] ?? SCENE_ELEMENTS['base'])
      : (SCENE_ELEMENTS['exterior']   ?? SCENE_ELEMENTS['base'])
  }
  return SCENE_ELEMENTS[segment] ?? SCENE_ELEMENTS['base']
}
