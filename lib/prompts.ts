// lib/prompts.ts

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProjectType = 'exterior' | 'interior'

export interface ProjectMaterials {
  fachada?:    string
  piso?:       string
  esquadrias?: string
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
  fidelityLevel?: FidelityLevel
  briefing?:      BriefingArquitetonico
  hasAnchor?:     boolean
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

export const INTERIOR_LIGHTING: Record<string, string[]> = {
  'Residencial': [
    'Clara e Natural', 'Natural Suave', 'Luz de Janela',
    'Quente e Aconchegante', 'Entardecer Quente',
    'Noturna Aconchegante', 'Sofisticada e Cênica',
  ],
  'Corporativo': [
    'Corporativa Neutra', 'Natural Profissional', 'Luz Difusa Uniforme',
    'Escritório Contemporâneo', 'Iluminação Técnica',
    'Noturna Executiva', 'Clara e Produtiva',
  ],
  'Comercial': [
    'Comercial Bem Iluminada', 'Varejo Premium', 'Showroom Iluminado',
    'Destaque de Produto', 'Iluminação de Loja',
    'Noturna Comercial', 'Luz de Vitrine',
  ],
  'Gastronomia': [
    'Quente e Aconchegante', 'Cênica e Intimista', 'Entardecer Quente',
    'Noturna Sofisticada', 'Café com Luz Natural',
    'Restaurante Premium', 'Luz Baixa Decorativa',
  ],
  'Hospitalidade': [
    'Sofisticada e Cênica', 'Premium Aconchegante', 'Luz Natural Elegante',
    'Noturna Refinada', 'Spa Relaxante',
    'Lobby Iluminado', 'Entardecer de Hotel',
  ],
  'Saúde': [
    'Clara e Limpa', 'Clínica Neutra', 'Luz Difusa Suave',
    'Iluminação Profissional', 'Aconchegante e Calma', 'Saúde Premium',
  ],
  'Educação': [
    'Clara e Funcional', 'Natural Suave', 'Luz Difusa',
    'Ambiente Produtivo', 'Biblioteca Aconchegante', 'Sala Bem Iluminada',
  ],
}

export const EXTERIOR_LIGHTING: Record<string, string[]> = {
  'Residencial':   ['Diurno', 'Entardecer', 'Golden Hour', 'Blue Hour', 'Noturno Iluminado', 'Nublado', 'Chuva Leve'],
  'Comercial':     ['Diurno Comercial', 'Fachada Bem Iluminada', 'Vitrine Noturna', 'Golden Hour', 'Blue Hour', 'Noturno Comercial', 'Shopping Atmosphere'],
  'Corporativo':   ['Diurno Corporativo', 'Fachada Profissional', 'Blue Hour', 'Noturno Executivo', 'Luz Urbana', 'Nublado Sofisticado'],
  'Hospitalidade': ['Golden Hour', 'Entardecer Premium', 'Noturno Refinado', 'Resort Diurno', 'Luz de Piscina', 'Blue Hour', 'Atmosfera Tropical'],
  'Institucional': ['Diurno Claro', 'Nublado Suave', 'Luz Natural', 'Entardecer', 'Iluminação Urbana', 'Noturno Institucional'],
  'Paisagismo':    ['Diurno Natural', 'Golden Hour', 'Entardecer Suave', 'Luz Filtrada', 'Nublado', 'Noturno Paisagístico', 'Chuva Leve'],
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
  'Natural Suave':           'soft natural light filtering through translucent curtains, gentle diffuse shadows, 5000K',
  'Luz de Janela':           'dramatic directional window light with defined shadows, high contrast, 5500K',
  'Quente e Aconchegante':   'warm incandescent-effect lighting 3000K, cozy amber glow, table lamps and floor lamps',
  'Entardecer Quente':       'warm golden afternoon light streaming through windows at low angle, 3200K, long shadows',
  'Noturna Aconchegante':    'nighttime with warm 2700K LED fixtures, table lamps, wall sconces, intimate pools of light',
  'Sofisticada e Cênica':    'dramatic architectural lighting with accent spotlights, LED strips under millwork, 2700K moody atmosphere',
  'Corporativa Neutra':      'neutral uniform corporate LED panels 4000K, no harsh shadows, professional clean light',
  'Natural Profissional':    'professional natural light from large windows, 5000K clean white, ideal for work',
  'Luz Difusa Uniforme':     'perfectly diffuse uniform illumination 4500K, softbox effect, virtually shadowless',
  'Escritório Contemporâneo':'contemporary office with ambient LED grid ceiling, task lighting on desks, decorative accent',
  'Iluminação Técnica':      'precision technical high-efficacy lighting 4000K, industrial, very even distribution',
  'Noturna Executiva':       'nighttime executive office with warm 3000K task lighting, city lights through windows',
  'Clara e Produtiva':       'bright productive 5000K, high CRI, minimal glare, uniform task-friendly illumination',
  'Comercial Bem Iluminada': 'bright commercial interior 4000K with display spotlights, high overall luminance',
  'Varejo Premium':          'premium retail high-CRI spotlights on merchandise, warm ambient LED fill, 3500K',
  'Showroom Iluminado':      'showroom with dramatic accent track lighting spotting products, dark perimeter, 3500K',
  'Destaque de Produto':     'tight product spot lighting, moody dark surround for contrast, focused beams',
  'Iluminação de Loja':      'standard retail LED panel and spotlight combo, bright uniform, 4000K',
  'Noturna Comercial':       'nighttime commercial with bright storefront lighting, illuminated signage, street light glow',
  'Luz de Vitrine':          'window display spotlights from above, product-focused tight beams, 3000K warm glow',
  'Cênica e Intimista':      'intimate theatrical candle-effect lighting, warm 2400K amber pools, romantic atmosphere',
  'Noturna Sofisticada':     'sophisticated dimmable nighttime fixtures 2700K, ambient and decorative accent mix',
  'Café com Luz Natural':    'morning café light with bright natural sun through windows 5500K, casual warm atmosphere',
  'Restaurante Premium':     'fine dining warm 2700K ambient with candle supplement, accent spots on tables',
  'Luz Baixa Decorativa':    'very low-level decorative ambient lighting 2400K, pendant lights, intimate mood',
  'Premium Aconchegante':    'premium warm indirect lighting 2700K, valence LED strips, wall washers, plush atmosphere',
  'Luz Natural Elegante':    'refined natural light with thin window shadow lines 5500K, elegant and airy',
  'Noturna Refinada':        'refined nighttime with architectural indirect lighting 2700K, perfectly balanced ambient',
  'Spa Relaxante':           'spa zen lighting very soft warm 2700K, near candlelight, tranquil, no harsh sources',
  'Lobby Iluminado':         'hotel lobby grand chandelier lighting, warm ambient 3000K, statement light fixture',
  'Entardecer de Hotel':     'hotel interior golden hour with warm sunset light streaming through windows 3200K',
  'Clara e Limpa':           'clinical bright white 5500K with high CRI, even illumination, no dark areas, sterile feel',
  'Clínica Neutra':          'neutral clinical LED 4500K uniform ceiling panels, professional healthcare environment',
  'Luz Difusa Suave':        'very soft diffuse light 4000K, therapeutic gentle quality, no harsh shadows',
  'Iluminação Profissional': 'professional precision 4000K high CRI, appropriate for clinical accuracy',
  'Aconchegante e Calma':    'warm calm 3000K indirect lighting, therapeutic, stress-reducing atmosphere',
  'Saúde Premium':           'premium wellness lighting 3500K, comfortable professional, not harshly clinical',
  'Clara e Funcional':       'functional clear educational lighting 5000K, anti-glare, even distribution',
  'Luz Difusa':              'soft diffuse light 4000K, gentle even illumination, calming',
  'Ambiente Produtivo':      'productive task lighting 4500K, focused, reduces eye strain, clear and bright',
  'Biblioteca Aconchegante': 'library with warm task lamps on tables, ambient 3000K fill, reading-friendly',
  'Sala Bem Iluminada':      'well-lit room 4000K, even distribution, no harsh shadows, functional and clean',
  // Exterior
  'Diurno':                'daytime, blue sky with sun and natural shadows',
  'Entardecer':            'late afternoon, warm golden light, long directional shadows',
  'Golden Hour':           'golden hour, warm amber sunlight at low angle, magical quality, long soft shadows',
  'Blue Hour':             'blue hour twilight, deep indigo blue sky, city lights beginning to glow, glass reflections',
  'Noturno Iluminado':     'nighttime with architectural facade uplighting, illuminated windows, garden spotlights',
  'Nublado':               'overcast sky, perfectly diffuse soft light, no harsh shadows, dramatic cloud texture',
  'Chuva Leve':            'light rain, wet reflective pavement surfaces, dark cloudy sky, rain streaks visible',
  'Diurno Comercial':      'bright clear commercial daytime, blue sky, optimal visibility for signage and display',
  'Fachada Bem Iluminada': 'perfect architectural photography light, slight overcast, even facade exposure',
  'Vitrine Noturna':       'nighttime with brightly illuminated store window, neon or LED signs, street lights',
  'Noturno Comercial':     'nighttime commercial district, multiple light sources, vibrant urban glow, active street',
  'Shopping Atmosphere':   'shopping center exterior evening atmosphere, bright entrance canopy, ambient pedestrian lighting',
  'Diurno Corporativo':    'crisp bright corporate daytime, sharp blue sky, professional architectural photography',
  'Fachada Profissional':  'even architectural photography light, professional standard, slight overcast for shadow control',
  'Noturno Executivo':     'corporate nighttime with facade uplighting, dramatic sculptural quality, executive presence',
  'Luz Urbana':            'urban nighttime mix of street lights, commercial signage glow, vehicle light trails',
  'Nublado Sofisticado':   'sophisticated overcast light, even diffuse shadows, high-end architectural photography',
  'Entardecer Premium':    'premium sunset, saturated warm sky gradient, golden light, luxury atmosphere',
  'Noturno Refinado':      'refined nighttime with warm facade uplighting, subtle garden lighting, exclusive feel',
  'Resort Diurno':         'bright tropical resort daytime, azure sky, vivid tropical vegetation, blue pool water',
  'Luz de Piscina':        'pool area with reflected water light playing on surfaces, tropical afternoon sun',
  'Atmosfera Tropical':    'tropical atmosphere with intense warm sunlight, vibrant lush green vegetation, clear sky',
  'Diurno Claro':          'clear bright daytime, direct sun, strong defined shadows, crisp visibility',
  'Nublado Suave':         'gentle soft overcast, even illumination, no harsh shadows, neutral institutional light',
  'Luz Natural':           'natural light, slightly golden, standard architectural photography, true to color',
  'Iluminação Urbana':     'urban night with street lights, vehicle light trails, city glow on horizon',
  'Noturno Institucional': 'nighttime with facade flood lighting, flag pole lights, formal institutional presence',
  'Diurno Natural':        'natural landscape daylight, even and true to botanical color, 5500K clear sky',
  'Entardecer Suave':      'gentle sunset light, pastel sky tones, warm long soft shadows, tranquil atmosphere',
  'Luz Filtrada':          'soft filtered light through tree canopy, dappled light patterns on ground, 5000K',
  'Noturno Paisagístico':  'landscape at night with garden uplighting on trees and plants, moonlight silver tone',
}

const BG_EN: Record<string, string> = {
  'Entorno Neutro':    'simple neutral urban context, flat sky gradient, minimal surroundings',
  'Rua Arborizada':    'tree-lined residential street with large ipê and jacarandá trees, sidewalk, parked cars',
  'Condomínio':        'gated condominium with neighboring contemporary houses, manicured garden walls, coconut palms',
  'Bairro Nobre':      'upscale residential neighborhood with luxury mansions, centenary figueira trees, wide avenues',
  'Zona Urbana':       'urban commercial and residential environment, mid-rise buildings, active street',
  'Zona Rural':        'rural landscape with open fields, cerrado or pasture vegetation, horizon line',
  'Beira-Mar':         'coastal beachfront location with ocean visible, coconut palms, restinga vegetation',
  'Beira-Rio':         'riverside location with wide river visible, riparian vegetation, urban context',
  'Serra':             'mountainside hillside with dense Atlantic forest, light mist on peaks',
  'Praça Urbana':      'urban plaza with stone paving, benches, mature shade trees, pedestrians',
  'Jardim':            'garden setting with planted ornamental beds, green lawn, flowering trees',
  'Estacionamento':    'parking lot environment with asphalt surface, marked parking spaces, low-rise surroundings',
  'Calçada Comercial': 'commercial sidewalk with pedestrian traffic, neighboring retail stores, awnings',
  'Clean / Neutro':    'clean neutral palette, white or light gray surfaces, minimal background',
  'Premium':           'premium atmosphere, high-end materials visible in background, marble and brass accents',
  'Urbano':            'urban loft character with exposed elements, industrial touches in background',
  'Natural':           'nature-inspired background, wooden elements, plants, organic textures',
  'Minimalista':       'minimalist background, very few elements, geometric simplicity, monochromatic',
  'Comercial':         'commercial background with functional elements, shelving, display fixtures',
  'Corporativo':       'corporate professional background with branded elements, tech equipment',
  'Aconchegante':      'warm cozy background with soft textiles, throw pillows, indoor plants, warm light',
}

const ELEM_EN: Record<string, string> = {
  'Decoração':              'styled decorative accessories, vases, artwork, throw cushions',
  'Pessoas':                'people in natural relaxed poses, lifestyle photography',
  'Vegetação':              'lush indoor or outdoor plants, tropical greenery',
  'Luzes Acesas':           'all artificial lights illuminated, warm glowing fixtures',
  'Raios de Sol':           'visible sun rays streaming through windows, subtle lens flare',
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

function buildCameraBlock(): string {
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

function buildMaterialsBlock(materials?: ProjectMaterials): string {
  if (!materials) return ''
  const lines = [
    materials.fachada    && `facade cladding: ${materials.fachada}`,
    materials.piso       && `floor and paving: ${materials.piso}`,
    materials.esquadrias && `window frames and doors: ${materials.esquadrias}`,
    materials.elementos  && `special architectural elements: ${materials.elementos}`,
    materials.outros     && `additional notes: ${materials.outros}`,
  ].filter(Boolean)
  if (lines.length === 0) return ''
  return `EXACT PROJECT MATERIALS — reproduce these faithfully: ${lines.join('; ')}. `
}

// ── Fidelity Engine prompt builder ─────────────────────────────────────────────

const NEGATIVE_BASE = [
  'no facade redesign',
  'no architectural changes',
  'no added or removed floors',
  'no added or removed stories',
  'no repositioned doors or windows',
  'no resized openings',
  'no changed roofline',
  'no different camera angle',
  'no different perspective',
  'no warped proportions',
  'no removed neighboring buildings',
  'no fantasy elements',
  'no impossible geometry',
  'no surreal additions',
]

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
  // maximum
  return `STRICTLY AVOID: ${NEGATIVE_BASE.join(', ')}, no reframe, no zoom, no rotation, no altered silhouette.`
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

function fidelityModifier(level: FidelityLevel): string {
  if (level === 'creative') {
    return 'CREATIVE FIDELITY MODE: Preserve volumetry, number of stories, opening positions and overall perspective. Stylistic freedom is allowed on materials, sky, ambient props, vegetation and surroundings. '
  }
  if (level === 'balanced') {
    return 'BALANCED FIDELITY MODE: Preserve architecture, camera angle, opening positions, number of stories and main volumetry. Light composition tweaks allowed (vegetation, sky, ambient props). Do not redesign the facade. '
  }
  return 'MAXIMUM FIDELITY MODE: PIXEL-ACCURATE preservation of architecture, geometry, volumetry, number of stories, openings (doors/windows position and size), roofline, perspective, camera angle, framing and surrounding context including neighboring buildings. This is a materials-and-lighting transformation ONLY. Do not reframe, do not rotate, do not zoom, do not redesign anything. Only surface materials, textures, lighting, sky and discreet vegetation may change. '
}

function preservationBlock(briefing: BriefingArquitetonico): string {
  const lock = briefing.elementos_preservar.length > 0
    ? `\nLOCKED ELEMENTS (must be identical to reference): ${briefing.elementos_preservar.join('; ')}.`
    : ''
  return (
    `PROJECT FACTS (from vision analysis — must remain unchanged):\n` +
    `- Project type: ${briefing.tipo_projeto}\n` +
    `- Main geometry: ${briefing.geometria_principal}\n` +
    `- Volumes: ${briefing.volumes}\n` +
    `- Number of stories: ${briefing.pavimentos} — DO NOT add or remove floors\n` +
    `- Openings: ${briefing.aberturas} — preserve exact position and proportion of every door and window\n` +
    `- Visible materials in reference: ${briefing.materiais_aparentes}\n` +
    `- Camera and perspective: ${briefing.camera} — DO NOT reframe, rotate or zoom\n` +
    `- Surroundings: ${briefing.entorno} — preserve neighboring buildings if present` +
    lock + ' '
  )
}

function transformationBlock(briefing: BriefingArquitetonico): string {
  if (briefing.elementos_melhorar.length === 0) return ''
  return `ALLOWED IMPROVEMENTS ONLY (visual quality, not architecture): ${briefing.elementos_melhorar.join('; ')}. `
}

export function buildFidelityPrompt(
  briefing:  BriefingArquitetonico,
  options:   GenerateOptions,
  level:     FidelityLevel = 'maximum',
): string {
  const { projectType, segment, lighting, background, sceneElements, materials, hasAnchor } = options

  const anchor     = buildAnchorBlock(hasAnchor)
  const modifier   = fidelityModifier(level)
  const preserve   = preservationBlock(briefing)
  const allow      = transformationBlock(briefing)
  const matBlock   = buildMaterialsBlock(materials)
  const negative   = buildNegativePromptForFidelity(level)

  const lightDesc  = LIGHT_EN[lighting] ?? lighting
  const segDesc    = SEG_EN[segment]    ?? segment.toLowerCase()

  const elemParts = sceneElements.map(e => ELEM_EN[e] ?? e.toLowerCase()).filter(Boolean)
  const elemBlock = elemParts.length > 0 ? `Scene additions allowed: ${elemParts.join('; ')}. ` : ''

  let bgBlock = ''
  if (background && background !== 'Preservar Original') {
    const bgDesc = BG_EN[background] ?? background
    if (bgDesc) {
      bgBlock = projectType === 'exterior'
        ? `Surrounding context (only if compatible with the reference): ${bgDesc}. `
        : `Spatial context (only if compatible with the reference): ${bgDesc}. `
    }
  }

  const intent = projectType === 'exterior'
    ? `Transform this reference into a photorealistic ${segDesc} architectural exterior photograph. `
    : `Transform this reference into a photorealistic ${segDesc} architectural interior photograph. `

  return (
    anchor +
    modifier +
    preserve +
    matBlock +
    intent +
    `Lighting: ${lightDesc}. ` +
    bgBlock +
    elemBlock +
    allow +
    negative +
    buildCameraBlock()
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildGenerationPrompt(options: GenerateOptions): string {
  const { projectType, segment, environment, lighting, background, sceneElements, geometryLock, materials, fidelityMode, hasAnchor } = options

  const anchor    = buildAnchorBlock(hasAnchor)
  const geoPrefix = buildFidelityBlock(geometryLock, fidelityMode)
  const matBlock  = buildMaterialsBlock(materials)
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
      anchor + geoPrefix + matBlock +
      `Transform this 3D model into a photorealistic architectural exterior photograph. ` +
      `${segDesc} architecture. ${envDesc}. ` +
      `Lighting: ${lightDesc}. ` +
      bgBlock + elemBlock +
      `Preserve all architectural proportions, geometry and materials exactly as in the reference.` +
      buildCameraBlock()
    )
  }
  return (
    anchor + geoPrefix + matBlock +
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
