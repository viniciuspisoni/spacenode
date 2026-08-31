-- ════════════════════════════════════════════════════════════════════════════
-- Seed do sistema editorial: brand_rules estruturadas + 8 templates conceituais.
--
-- Fonte: content-factory/brand-rules.md (§2 voz, §3 claims, §4 copy, §5 visual,
-- §7 parâmetros máquina) e docs/marketing/*. Mudou o manual → atualizar aqui a
-- chave equivalente (e vice-versa). Idempotente: ON CONFLICT DO NOTHING — não
-- sobrescreve edições feitas depois pelo painel.
--
-- NÃO aplicar em produção neste sprint. NÃO é aplicado por db push.
-- ════════════════════════════════════════════════════════════════════════════

-- ── brand_rules ────────────────────────────────────────────────────────────────

insert into marketing.brand_rules (key, value, description) values
(
  'voice',
  '{
    "resumo": "Arquiteto sênior falando com outro arquiteto. Direto, técnico quando necessário, seguro, específico, claro, brasileiro, profissional sem ser excessivamente formal. A confiança vem da especificidade, nunca do entusiasmo.",
    "regras": [
      "Todo argumento é específico e verificável: o que é preservado, quanto tempo se ganha, o que o cliente vê",
      "Frases curtas. Voz ativa.",
      "Sem exclamação dupla; sem emoji em copy de marca (pontual e sóbrio tolerado só em legenda orgânica)",
      "Títulos podem ser em minúsculas com ponto final",
      "Falamos de resultado e controle, não de IA — a tecnologia é meio; o assunto é o projeto",
      "Conteúdo em português brasileiro"
    ]
  }'::jsonb,
  'Tom de voz — content-factory/brand-rules.md §2'
),
(
  'prohibited_lexicon',
  '{
    "palavras": [
      "revolucionário", "revolucionaria", "revolucionária", "revolucionario",
      "incrível", "incrivel", "incríveis", "incriveis",
      "mágico", "magico", "mágica", "magica", "magia",
      "alucinante", "alucinantes",
      "transforme", "transformador", "transformadora", "potencialize",
      "surreal", "insano", "insana", "chocante", "inacreditável", "inacreditavel",
      "game changer", "game-changer", "disruptivo", "disruptiva",
      "o futuro chegou", "vai mudar tudo", "segredo", "hack", "truque",
      "turbine", "alavanque", "desbloqueie", "imperdível", "imperdivel"
    ],
    "frases": [
      "transforme suas ideias", "potencialize sua criatividade", "eleve seus projetos",
      "tecnologia do futuro", "resultados mágicos", "resultados magicos",
      "deixe a ia criar por você", "deixe a ia criar por voce"
    ],
    "emojis": ["🚀", "🔥", "🤯", "✨"],
    "claims_falsos": [
      "importação direta", "importacao direta", "plugin do sketchup",
      "histórico de 30 dias", "historico de 30 dias",
      "histórico ilimitado", "historico ilimitado"
    ]
  }'::jsonb,
  'Léxico e claims proibidos — brand-rules.md §2–3 + docs/marketing/prohibited-content.md'
),
(
  'preferred_lexicon',
  '{
    "palavras": [
      "fidelidade", "geometria", "proporção", "perspectiva", "linhas de fuga",
      "ponto de fuga", "pé-direito", "planta", "corte", "fachada", "vista",
      "prancha", "escala", "setorização", "especificação", "coerência entre vistas",
      "prazo", "apresentação", "controle", "precisão", "iteração",
      "intenção do projeto", "revisão", "aprovação do cliente", "esquadria"
    ]
  }'::jsonb,
  'Léxico preferido (vocabulário do ofício) — brand-rules.md §2'
),
(
  'approved_ctas',
  '{
    "organico": [
      "Renderize seu projeto",
      "Teste com um projeto real",
      "Comece agora",
      "Veja no seu próprio projeto",
      "Comece grátis"
    ],
    "botoes_anuncio": ["SIGN_UP", "LEARN_MORE"]
  }'::jsonb,
  'CTAs aprovados — brand-rules.md §4'
),
(
  'copy_limits',
  '{
    "headline_arte_palavras": 8,
    "gancho_legenda_chars": 125,
    "titulo_anuncio_chars": 40,
    "descricao_anuncio_chars": 30,
    "titulo_slide_palavras": 7,
    "corpo_slide_chars": 220,
    "hashtags_min": 3,
    "hashtags_max": 5,
    "reels_duracao_seg": [15, 30]
  }'::jsonb,
  'Limites de copy por formato — brand-rules.md §7'
),
(
  'color_rules',
  '{
    "paleta_dark": {
      "fundo": "#0a0a0a", "fundo_elevado": "#111111",
      "texto": "#f5f5f7", "texto_secundario": "#a1a1a6", "texto_terciario": "#6e6e73",
      "hairline": "rgba(255,255,255,0.08)", "verde": "#30d158"
    },
    "paleta_light_excepcional": { "fundo": "#fafafa", "texto": "#1a1a1a", "verde": "#30b46c" },
    "regras": [
      "Uso predominante de branco, preto e cinzas",
      "Verde apenas funcional e em menos de 5% da área",
      "Nunca fundo verde, nunca gradiente, nunca headline verde",
      "Estética proibida: neon, glow, partículas, blobs, robôs, cérebros, circuitos"
    ]
  }'::jsonb,
  'Proporção de cores e paleta — brand-rules.md §5'
),
(
  'image_rules',
  '{
    "regras": [
      "Somente renders e telas reais do produto e de projetos reais",
      "Nunca banco de imagem genérico de tecnologia ou mockup de stock",
      "Não redesenhar/reinterpretar/alterar imagem arquitetônica para adequá-la ao layout",
      "Antes/depois honesto: mesmo projeto, insumo real, resultado real da plataforma",
      "Imagem de projeto de usuário exige permission_status = granted e crédito quando acordado",
      "Screenshot sem dado pessoal de usuário visível"
    ],
    "overlay_permitido": "linhas de fuga/régua em traço fino, branco ou verde funcional"
  }'::jsonb,
  'Regras de imagem — brand-rules.md §5 + docs/marketing/visual-guidelines.md §4'
),
(
  'logo_rules',
  '{
    "regras": [
      "Wordmark SPACENODE 100% monocromático, sempre (política de 2026-07-02)",
      "A versão com nó verde foi aposentada — não reutilizar"
    ]
  }'::jsonb,
  'Regras de logo — brand-rules.md §5'
),
(
  'layout_rules',
  '{
    "regras": [
      "Tipografia Geist exclusiva; títulos 600–700 com tracking -0.02em",
      "Eyebrow uppercase com letterspacing 0.28em e hairline horizontal",
      "Margens generosas (mínimo 96px em arte de 1080px), bastante espaço vazio",
      "Um ponto focal por peça; a arquitetura é o elemento principal",
      "Máximo 2 pesos de fonte e 3 níveis de texto por peça",
      "Bordas finas, cantos suaves, aparência premium",
      "Sem emoji na arte, sem URL na arte, sem selos NOVO!!"
    ]
  }'::jsonb,
  'Regras de layout — brand-rules.md §5 + docs/marketing/visual-guidelines.md'
),
(
  'approved_formats',
  '{
    "formatos": [
      "post_estatico", "antes_depois", "carrossel_educativo", "carrossel_estudo_caso",
      "tres_angulos", "tutorial_carrossel", "reel_demonstrativo", "reel_produto",
      "video_anuncio", "story", "lancamento", "prova_social", "remarketing"
    ],
    "plataformas": ["instagram", "meta_ads", "google_ads", "youtube", "site", "other"]
  }'::jsonb,
  'Formatos e plataformas aprovados — docs/marketing/content-formats.md'
),
(
  'safe_modules',
  '{
    "nota": "Só comunicar recursos ativos em produção. Fonte viva: lib/nav/modules-config.ts (enabled: true). Snapshot de 2026-07-13:",
    "ativos": ["Renderizar", "Spaces", "Editar", "Ampliar", "Animar", "Finalizar", "Planta Humanizada", "Histórico"],
    "desativados_nao_promover": ["Isométricas", "Prancha IA", "Moodboard"]
  }'::jsonb,
  'Módulos comunicáveis — brand-rules.md §3 (conferir modules-config.ts antes de cada peça)'
),
(
  'content_pillars',
  '{
    "pilares": [
      "antes-e-depois", "fidelidade-geometrica", "coerencia-entre-angulos",
      "produtividade", "tutoriais-rapidos", "demonstracao-de-ferramentas",
      "bastidores", "erros-comuns", "estudos-de-caso", "educativo-apresentacao",
      "tradicional-vs-spacenode", "novidades"
    ]
  }'::jsonb,
  'Slugs dos 12 pilares — docs/marketing/content-pillars.md'
)
on conflict (key) do nothing;

-- ── content_templates — 8 templates conceituais ────────────────────────────────
-- provider=html referencia os formatos de content-factory/templates/ (arte via
-- preview HTML → PNG). Integração Canva futura preenche external_template_id.

insert into marketing.content_templates
  (name, format, platform, description, template_provider, aspect_ratio, visual_rules) values
(
  'SpaceNode — Antes e depois',
  'antes_depois', 'instagram',
  'Comparativo honesto modelo/print → render do mesmo projeto. Device visual da marca; aceita overlay de linhas de fuga em traço fino.',
  'html', '4:5',
  '{
    "campos_dinamicos": ["headline", "apoio", "imagem_antes", "imagem_depois", "label_antes", "label_depois", "cta"],
    "regras_de_uso": [
      "Mesmo projeto nas duas imagens; antes = insumo real, depois = resultado real",
      "Labels sóbrios (modelo / render), sem seta gorda",
      "Overlay de linhas de fuga opcional: traço fino, branco ou verde funcional",
      "Headline ≤8 palavras"
    ]
  }'::jsonb
),
(
  'SpaceNode — Três ângulos',
  'tres_angulos', 'instagram',
  'Três a cinco vistas do mesmo ambiente (Spaces) com o mesmo DNA visual, ordenadas como uma visita ao espaço.',
  'html', '4:5',
  '{
    "campos_dinamicos": ["headline", "vistas[]", "legenda_vista[]", "cta"],
    "regras_de_uso": [
      "Todas as vistas do mesmo projeto/ambiente, coerentes entre si",
      "Ordenar: entrada → detalhe → geral",
      "1 vista por slide; slide final com CTA"
    ]
  }'::jsonb
),
(
  'SpaceNode — Carrossel educativo',
  'carrossel_educativo', 'instagram',
  '5 slides: gancho, três argumentos (um por slide), fechamento com CTA. Base dos pilares erros-comuns e educativo-apresentacao.',
  'html', '4:5',
  '{
    "campos_dinamicos": ["slide1_gancho", "slides[2-4]_titulo", "slides[2-4]_corpo", "slide5_fechamento", "cta"],
    "regras_de_uso": [
      "Título de slide ≤7 palavras; corpo ≤220 caracteres",
      "Um argumento por slide; numeração discreta",
      "Slide 1 precisa carregar sozinho"
    ]
  }'::jsonb
),
(
  'SpaceNode — Estudo de caso',
  'carrossel_estudo_caso', 'instagram',
  'Contexto → desafio → processo (telas reais) → resultado → crédito + CTA. Só com material real e autorização registrada.',
  'html', '4:5',
  '{
    "campos_dinamicos": ["projeto", "contexto", "desafio", "telas_processo[]", "resultado", "credito", "cta"],
    "regras_de_uso": [
      "Pré-requisito: content_projects.permission_status = granted",
      "Crédito ao arquiteto obrigatório quando acordado",
      "Nunca inventar métrica/depoimento — sem material real, a peça espera"
    ]
  }'::jsonb
),
(
  'SpaceNode — Tutorial rápido',
  'tutorial_carrossel', 'instagram',
  'Passo a passo objetivo de um fluxo ativo: do print à imagem de apresentação, um passo por slide com tela real.',
  'html', '4:5',
  '{
    "campos_dinamicos": ["headline", "passos[]", "tela_por_passo[]", "resultado_final", "cta"],
    "regras_de_uso": [
      "Só fluxo ativo em produção (conferir modules-config.ts)",
      "Passos reais, sem atalho escondido",
      "CTA padrão: Comece grátis"
    ]
  }'::jsonb
),
(
  'SpaceNode — Apresentação de ferramenta',
  'reel_produto', 'instagram',
  'Um módulo, um problema resolvido, uma tela real. 15–30s, gancho visual ≤3s, CTA único no fim.',
  'html', '9:16',
  '{
    "campos_dinamicos": ["modulo", "problema", "roteiro_cenas[]", "texto_em_tela[]", "cta"],
    "regras_de_uso": [
      "Gancho visual (resultado/tela), não promessa",
      "Tela real do produto, tema escuro, sem dado de usuário",
      "Sem trilha épica; texto em tela mínimo"
    ]
  }'::jsonb
),
(
  'SpaceNode — Capa de Reel',
  'story', 'instagram',
  'Capa estática 9:16 para Reels: imagem real protagonista, eyebrow + headline ≤8 palavras, wordmark monocromático.',
  'html', '9:16',
  '{
    "campos_dinamicos": ["eyebrow", "headline", "imagem"],
    "regras_de_uso": [
      "Margens ≥96px; um ponto focal",
      "Verde no máximo no eyebrow (ponto/hairline)",
      "Sem emoji, sem URL"
    ]
  }'::jsonb
),
(
  'SpaceNode — Anúncio estático',
  'remarketing', 'meta_ads',
  'Peça 1:1 para tráfego: headline ≤8 palavras com um argumento (fidelidade/prazo/apresentação), imagem real, sem URL na arte. Sobe sempre pausado.',
  'html', '1:1',
  '{
    "campos_dinamicos": ["headline", "apoio", "imagem", "variacao_angulo"],
    "regras_de_uso": [
      "3 variações por peça, um ângulo por variação",
      "Título de anúncio ≤40 chars; descrição ≤30 chars; botão SIGN_UP ou LEARN_MORE",
      "Campanha entra PAUSADA; ativação é decisão humana fora do sistema"
    ]
  }'::jsonb
)
on conflict (name) do nothing;
