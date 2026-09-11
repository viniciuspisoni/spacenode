# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-09-10

## Product Overview
**One-liner:** Visualização arquitetônica com IA que respeita o projeto — a SpaceNode transforma modelos 3D e estudos em imagens fotorrealistas sem reinterpretar a geometria.
**What it does:** SaaS de renderização com IA para arquitetos e designers de interiores. Transforma imagens de modelos 3D (SketchUp, Revit, ArchiCAD, Blender ou qualquer modelador), estudos volumétricos e fotos de referência em visualizações fotorrealistas, preservando geometria, proporções, perspectiva e composição do projeto original. Além da geração, oferece ferramentas de edição e pós-produção (ajustes, variações, imagens de apresentação) e um plugin oficial para SketchUp que captura a vista direto do modelo.
**Product category:** Visualização arquitetônica / renderização com IA para arquitetura e interiores.
**Product type:** SaaS via navegador (sem instalação, sem GPU dedicada) + plugin nativo para SketchUp.
**Business model:** Assinatura mensal por planos (Starter, Pro, Studio — o plano Office foi descontinuado para novas vendas em 31/08/2026, assinantes existentes mantidos). Consumo medido em **nodes** (nunca "créditos"): nodes mensais vêm incluídos no plano, renovam todo mês e não acumulam; nodes extras são comprados avulsos, não expiram, e são consumidos depois dos mensais. Custo por geração varia por motor/resolução (render HD a partir de 10 nodes, 2K a partir de 15, 4K a partir de 25 — fonte: FAQ da landing). Cadastro grátis concede 80 nodes de teste, sem cartão de crédito. Existe um preço de ciclo anual no catálogo de planos, mas a venda está **desligada** (`ANNUAL_BILLING_ENABLED=false` em `lib/plans.ts`) por uma limitação técnica de recarga mensal de nodes em assinaturas anuais — não anunciar/oferecer anual até isso ser corrigido.
Fontes conferidas em 2026-09-10: `lib/plans.ts`, `components/landing/FAQ.tsx`, `components/Hero.tsx`. **Valores de plano podem mudar — reconferir `lib/plans.ts` antes de citar preço em qualquer peça de mídia.**

## Target Audience
**Target companies:** Arquitetos e designers de interiores — tanto autônomos/freelancers quanto pequenos/médios escritórios, **sem prioridade entre os dois portes** (confirmado pelo dono). A descrição dos planos no código reflete isso por estágio: Starter = "estudante/freelancer testando", Pro = "profissional autônomo em produção", Studio = "escritório com volume e equipe".
**Decision-makers:** Na grande maioria dos casos, **quem usa a ferramenta é quem decide a assinatura** — raramente há um comprador separado do usuário final (confirmado pelo dono).
**Primary use case:** Transformar modelo 3D/estudo em imagem fotorrealista fiel ao projeto para apresentar a clientes, sem que a IA "reinterprete" ou altere elementos do projeto — dor citada literalmente por leads reais sobre ferramentas concorrentes.
**Jobs to be done:**
- Fechar clientes/aprovações mostrando o projeto de forma realista sem perder fidelidade técnica
- Produzir material de apresentação (imagens, variações, ângulos) rápido, sem depender de render tradicional (motor 3D + iluminação manual) nem terceirizar para um renderista
- Iterar rápido em estudos/volumetria durante o processo de projeto
**Use cases:**
- Enviar um print do SketchUp e receber a vista renderizada
- Gerar variações de luz/atmosfera/material mantendo a mesma geometria entre vistas do mesmo projeto
- Produzir imagens em alta resolução (até 4K) para impressão e portfólio

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Arquiteto/designer autônomo (Starter/Pro) | Fechar clientes, portfólio, velocidade | Sem tempo/orçamento para renderista dedicado; ferramentas de IA genéricas distorcem o projeto | Render fiel ao projeto em minutos, sem prompt, direto do modelo que já usa |
| Escritório pequeno com equipe (Studio) | Padronização, volume, marca própria na entrega | Precisa de consistência entre vistas/projetos e apresentar com a marca do escritório, não da ferramenta | Volume de nodes + apresentação com a marca do escritório (white-label) |

Tabela simplificada de propósito — ainda não há evidência de múltiplos stakeholders de compra por conta; revisar quando houver um assinante Studio real para conversar.

## Problems & Pain Points
**Core problem:** Apresentar um projeto de forma realista e persuasiva sem tempo/orçamento para render tradicional, e sem que a ferramenta de IA "invente" ou distorça geometria, materiais e proporções do projeto real.
**Why alternatives fall short:**
- Render tradicional (motor 3D + iluminação manual) é caro e lento para iteração rápida
- Ferramentas de IA genéricas geram imagens "parecidas" com o projeto, não o projeto real — perdem fidelidade geométrica
- Concorrentes diretos de "print → render com IA" tratam a transformação como commodity; a queixa mais citada por leads reais é a IA alterar materiais e elementos arquitetônicos do projeto
**What it costs them:** Tempo perdido corrigindo renders que não representam o projeto, retrabalho de apresentação, ou o custo de terceirizar para um renderista.
**Emotional tension:** Medo de apresentar ao cliente uma imagem que "não é bem o projeto" e perder credibilidade técnica.

## Competitive Landscape
**Direct (BR, "print → render com IA"):** genius_render, archrenderia, renderizaai.app, renderizafacil, redraw.pro, avga.labs, arqhub.ia, vertexstudioia, brunoluizarquiteto — nesse grupo a promessa "print vira render" já é commodity; a falha mais citada por leads é a fidelidade geométrica.
**Secondary (internacional, mesma categoria):** LookX, MyArchitectAI, ArchiVinci, Veras, D5 Render/D5 Showreel — em geral vendem uso ilimitado no motor "da casa" e cobram créditos só do motor premium ou de vídeo; a SpaceNode mede todo consumo (qualquer motor) em nodes, o que faz os planos parecerem "atacado" por comparação direta de volume.
**Indirect:** Render tradicional feito à mão (freelancer/renderista terceirizado) ou nenhum render (apresentação só com print do modelador).
**Ciclo de venda dos concorrentes:** os citados acima costumam vender plano anual com desconto relevante sobre o mensal. A SpaceNode tem preço anual definido no catálogo, mas a venda está desligada (ver Business model) — não é hoje um ponto de paridade.

## Differentiation
**Key differentiators** (copy oficial da landing, `components/landing/Differentiators.tsx`):
- **Fidelidade geométrica** — preserva geometria, proporções e perspectiva; nada é reinterpretado
- **Coerência entre vistas** — luz, câmera e atmosfera variam entre imagens do mesmo projeto; a identidade do projeto, não
- **Velocidade com controle** — iteração em minutos, com escolhas de arquiteto (motor, resolução, atmosfera, materialidade), sem precisar escrever prompt
**How we do it differently:** Fluxo pensado para quem já tem um modelo/estudo (não para gerar imagem do zero) — a entrada é o projeto real, e a plataforma restringe a IA para não alterar sua geometria.
**Why that's better:** Reduz o risco de apresentar ao cliente algo que "parece" mas não é o projeto — preserva a credibilidade técnica do arquiteto.
**Why customers choose us:** Fidelidade geométrica — segundo o dono, é o que mais pesou na decisão de quem testou/assinou até aqui (ainda sem entrevista formal, mas confirmado pela observação direta dos casos reais).

## Objections
| Objection | Response |
|-----------|----------|
| "A IA vai alterar/distorcer meu projeto" | A plataforma é construída para preservar geometria, proporções, perspectiva e composição — o objetivo é respeitar o projeto original, não gerar algo "parecido" (resposta oficial do FAQ) |
| "Preciso instalar algo / ter GPU dedicada" | Roda no navegador, sem instalação e sem GPU; o plugin de SketchUp é opcional |
| "Os direitos da imagem são meus? Posso usar com cliente?" | Sim — direitos são do usuário, uso comercial liberado, inclusive impressão em até 4K |
| "Será que funciona de verdade no meu projeto?" | 80 nodes grátis no cadastro, sem cartão — testa com o seu próprio modelo antes de pagar qualquer coisa |

Demais objeções reais de venda: **a confirmar** — as fontes acima já incluem uma objeção levantada pelo dono a partir de conversas reais; o restante ainda vem só do FAQ da landing e de comentários de prospecção no Instagram.

**Anti-persona (confirmado pelo dono):** Quem precisa de imagens fantasiosas/conceituais sem projeto real por trás, ou volume industrial de renders padronizados — uso que foge do "projeto real, fidelidade alta" que é a proposta central. Ainda sem casos documentados de churn/recusa por esse motivo.

## Switching Dynamics
**Push:** Frustração com renders tradicionais lentos/caros, ou com ferramentas de IA que distorcem o projeto.
**Pull:** Fidelidade geométrica + velocidade + fluxo que já parte do modelo que o profissional usa (SketchUp e outros).
**Habit:** Já ter um workflow de render manual estabelecido (ou um renderista terceirizado de confiança) que "funciona bem o suficiente".
**Anxiety:** Medo de que a IA produza algo genérico/incorreto e ainda exija retrabalho manual; incerteza sobre se vale a assinatura recorrente vs. pagar por render pontual.

## Customer Language
**How they describe the problem (verbatim, de comentários reais no Instagram):**
- "a IA altera os materiais e elementos arquitetônicos"
**How they describe us:** **A confirmar** — ainda não há citação verbatim de um assinante pagante sobre a SpaceNode especificamente.
**Words to use:** "fidelidade ao projeto", "geometria preservada", "o projeto continua seu", "nodes" (nunca "créditos")
**Words to avoid:** autoapresentação como "sou arquiteto" / "de arquiteto pra arquiteto" em mensagens de social selling (guardrail interno de tom, não de produto); "crédito" no lugar de "node"
**Glossary:**
| Term | Meaning |
|------|---------|
| Node | Unidade de consumo da plataforma; cada geração, edição ou ampliação consome nodes conforme motor e resolução |
| White-label | Remove a marca "criado com SpaceNode" do rodapé do link de apresentação compartilhável — hoje o único recurso travado por plano (Pro/Studio) |
| Nodes mensais vs. extras | Mensais vêm no plano, renovam todo mês e não acumulam; extras são comprados avulsos e não expiram |

## Brand Voice
**Tone:** Direto, confiante, sem jargão técnico de IA, sem se vender como "mágico" — foco em respeito ao projeto e controle do arquiteto.
**Style:** Minimalista, frases curtas, sem emojis, em português do Brasil.
**Personality:** Premium, discreto, técnico mas acessível — adjetivos inferidos da direção de design e da copy atual da landing; **validar com o dono** se descrevem a marca como pretendido.

## Proof Points
**Metrics:** O funil está instrumentado ponta a ponta (anúncio → cadastro → primeira imagem útil → assinatura), com eventos de produto e webhooks do Stripe. Números atuais de conversão, CAC e assinantes **não estão incluídos aqui de propósito** — consultar o painel de tráfego pago / Stripe / analytics para o valor vigente antes de citar em qualquer peça.
**Customers:** Renders de escritórios clientes aparecem na landing com crédito. Nomes específicos **não estão listados aqui** — conferir a seção correspondente da landing antes de citar um cliente nominalmente.
**Testimonials:** Nenhum depoimento formal coletado ainda — **a confirmar**.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Fidelidade geométrica | Copy oficial da landing (Differentiators) + queixa recorrente sobre concorrentes em comentários do Instagram |
| Sem instalação / sem GPU | FAQ oficial da landing |
| Uso comercial liberado, até 4K | FAQ oficial da landing |

## Goals
**Business goal:** Conquistar usuários pagantes (assinantes) com orçamento de mídia limitado — prioridade explícita sobre crescimento de topo de funil genérico.
**Conversion action:** Cadastro gratuito → primeira imagem útil → assinatura paga.
**Current metrics:** Não incluídos aqui de propósito, para o documento não carregar um número que fica desatualizado — consultar o painel de tráfego pago / Stripe / `lib/analytics` antes de qualquer decisão de mídia.

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-09-10) — Revisão das 7 lacunas da v1 com o dono: público-alvo (ambos os portes, sem prioridade), decisor = usuário na maioria dos casos, motivo de escolha (fidelidade geométrica), nova objeção de venda ("será que funciona?" → teste grátis de 80 nodes) e anti-persona confirmada. Mantidos pendentes de propósito: frase verbatim de como descrevem a SpaceNode, depoimentos/clientes nominais, e métricas atuais de funil (decisão do dono de não fixar número no documento).
- v1 (2026-09-10) — Contexto inicial, gerado a partir do código (`lib/plans.ts`, FAQ, Differentiators, Hero), memória do projeto e informações fornecidas pelo dono. Pendências marcadas "a confirmar": persona detalhada, objeções de venda 1:1, depoimentos, métricas de funil atuais, motivo de escolha dos assinantes.
