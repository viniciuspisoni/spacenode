# SPACENODE — Regras de marca para conteúdo

> Fonte da verdade para todo conteúdo orgânico e pago (Instagram @spacenode + Meta Ads).
> Tudo que sai daqui passa por **revisão humana antes de publicar**. Nada é publicado automaticamente.

---

## 1. Identidade

**Em uma linha:** plataforma de visualização arquitetônica com IA que respeita o projeto — geometria, proporções, perspectiva e intenção.

**Público:** arquitetos, designers de interiores e pequenos escritórios brasileiros que apresentam projeto para cliente e não aceitam render que "inventa" o próprio projeto.

**Promessa central:** fidelidade. A imagem final é o *seu* projeto, apresentado melhor — não uma alucinação bonita por cima dele.

**Referência de tom (hero da landing):** "Visualização arquitetônica que respeita seu projeto."

---

## 2. Voz

Arquiteto falando com arquiteto. Direto, técnico, premium, seco no bom sentido. A confiança vem da especificidade, nunca do entusiasmo.

| Dizemos | Não dizemos |
|---|---|
| "Linhas de fuga no lugar. Escala no lugar. Seu projeto, renderizado." | "IA revolucionária transforma seus projetos! 🚀" |
| "Do modelo à imagem de apresentação em minutos — sem perder a proporção do pé-direito." | "Crie imagens incríveis com um clique!" |
| "Mesmo ambiente, quatro vistas, um único DNA visual." | "A mágica da IA a serviço da arquitetura" |
| "O cliente aprova o que vai ser construído — não uma versão fantasiosa dele." | "Potencialize suas apresentações!" |

**Regras de voz:**
- Todo argumento precisa ser específico e verificável: *o que* é preservado (geometria, proporção, perspectiva, materiais), *quanto* tempo se ganha, *o que* o cliente vê.
- Vocabulário do ofício é bem-vindo: linhas de fuga, ponto de fuga, pé-direito, planta, corte, fachada, vista, prancha, escala, setorização, especificação.
- Frases curtas. Voz ativa. Sem exclamação dupla, sem emoji em copy de marca (emoji pontual e sóbrio é tolerado em legenda orgânica, nunca em headline/anúncio).
- Convenção tipográfica herdada da landing: títulos podem ser em minúsculas com ponto final ("que respeita seu projeto.").
- Falamos de resultado e controle, não de "IA". A tecnologia é meio; o assunto é o projeto do arquiteto.

### Léxico proibido
Nunca usar (em qualquer peça, orgânica ou paga): **revolucionário, incrível, mágico, magia, alucinante, transforme, transformador, potencialize, surreal, insano, chocante, inacreditável, game changer, disruptivo, "o futuro chegou", "vai mudar tudo", "segredo", "hack", "truque", turbine, alavanque, desbloqueie, imperdível**. Também proibidos: 🚀 🔥 🤯 ✨ em qualquer contexto.

### Léxico preferido
fidelidade, geometria, proporção, perspectiva, coerência entre vistas, prazo, apresentação, controle, precisão, iteração, intenção do projeto, revisão, aprovação do cliente.

---

## 3. Claims — o que pode e o que não pode

**Proibidos por serem falsos** (já removidos da landing; não reintroduzir):
- "Importação direta do SketchUp" — não existe plugin. O correto: *upload de imagens/prints do modelo*.
- "Histórico de 30 dias / ilimitado por plano" — não existe retenção por plano.
- "Lumens" — conceito aposentado em 2026-08-31: todo crédito é "Node". Nodes mensais renovam
  com o plano (não acumulam); **Nodes extras** são os avulsos, sem validade, em qualquer plano
  pago. Nunca usar "Lumens" em peça nova, nem prometer expiração para Nodes extras.
- Plano **Office** — aposentado para novas assinaturas em 2026-08-31. Não promover; a vitrine é
  Starter/Pro/Studio e volume maior vira conversa com o suporte.

**Regras gerais de claim:**
- Só comunicar recursos **ativos em produção**. Antes de citar um módulo, conferir `lib/nav/modules-config.ts` (ex.: Apresentar está desativado desde 2026-07-02 — não promover).
- Módulos seguros para conteúdo hoje: Renderizar, Editar, Animar (vídeo), Spaces, Planta Humanizada, Upscale, Histórico.
- Não citar preços, custos de nodes ou números de plano sem conferir o pricing vigente no código.
- "Comece grátis" é um claim válido (cadastro concede nodes gratuitos), mas **não** citar a quantidade sem conferir o valor atual.
- Nunca inventar depoimento, métrica de cliente ou caso de uso que não aconteceu.
- Antes/depois deve ser honesto: o "antes" é o modelo/print real, o "depois" é o resultado real da plataforma, do mesmo projeto.

---

## 4. Copy — especificações por formato

**Feed (quadrado 1080×1080 e vertical 1080×1350)**
- Headline na arte: máx. 8 palavras. Uma ideia só.
- Linha de apoio na arte: máx. 2 linhas (~90 caracteres).
- Legenda: gancho na 1ª linha (≤125 caracteres — é o que aparece antes do "mais"), corpo em 2–4 parágrafos curtos, CTA no fim, 3–5 hashtags técnicas na última linha.

**Story/Reels (1080×1920)**
- Texto na tela: mínimo. Headline + 1 apoio + CTA.
- Roteiro de Reels: gancho nos primeiros 3 segundos (visual, não promessa), duração alvo 15–30s, sem trilha "épica", encerramento com CTA único. Mostrar tela real do produto e projeto real.

**Carrossel (5 slides, 1080×1350)**
- Slide 1 = gancho (a headline carrega sozinha). Slides 2–4 = desenvolvimento, um argumento por slide. Slide 5 = fechamento + CTA.
- Título de slide: máx. 7 palavras. Corpo de slide: máx. 220 caracteres.

**Meta Ads (tráfego)**
- Texto primário: a primeira linha carrega (≤125 caracteres visíveis). Total até ~300.
- Título: **máx. 40 caracteres**. Descrição: **máx. 30 caracteres**.
- Botão CTA: usar valores válidos da API — `SIGN_UP` ("Cadastre-se") ou `LEARN_MORE` ("Saiba mais").
- Sempre 3 variações por peça, cada uma com um ângulo diferente (ex.: fidelidade / prazo / apresentação ao cliente).

**CTAs aprovados:** "Renderize seu projeto", "Teste com um projeto real", "Comece agora", "Veja no seu próprio projeto", "Comece grátis". Destino: link na bio (orgânico) / botão do anúncio (pago). Não escrever URL na arte.

---

## 5. Visual

**Paleta (dark-first — é a cara da marca):**

| Papel | Valor |
|---|---|
| Fundo | `#0a0a0a` (elevado: `#111111`) |
| Texto principal | `#f5f5f7` |
| Texto secundário | `#a1a1a6` |
| Texto terciário | `#6e6e73` |
| Hairline/borda | `rgba(255,255,255,0.08)` |
| Verde (acento) | `#30d158` — **apenas funcional** |

Variante light (uso excepcional, ex.: carrossel técnico): fundo `#fafafa`, texto `#1a1a1a`, verde `#30b46c`.

**Regras visuais:**
- Verde ocupa **menos de 5% da área**: um ponto no eyebrow, um sublinhado de CTA, um marcador. Nunca fundo verde, nunca gradiente, nunca headline verde.
- Logo/wordmark SPACENODE: **100% monocromático**, sempre (política de 2026-07-02 — a versão com nó verde foi aposentada).
- Tipografia: **Geist** (a fonte do produto — `public/fonts/geist-latin.woff2`). Títulos em peso 600–700, tracking apertado (-0.02em). Eyebrow em uppercase, letterspacing largo (0.28em), com hairline horizontal — mesma convenção da landing.
- Grid: margens generosas (≥96px na arte de 1080px), um ponto focal por peça, no máximo 3 níveis de texto (eyebrow, headline, apoio).
- Imagem: renders e telas **reais do produto e de projetos reais**. O antes/depois é o device visual da marca — pode receber linhas de fuga/régua sobrepostas como elemento gráfico (traço fino, branco ou verde funcional).

**Estética proibida (a "cara de startup de IA" que nunca teremos):**
- Gradientes roxo/azul/neon, glow, partículas, blobs.
- Robôs, cérebros, circuitos, mãos brilhantes, olhos de HAL.
- Mockups 3D genéricos de banco de imagem, stock photos de "escritório feliz".
- Emoji na arte, setas gordas, selos "NOVO!!", mais de 2 pesos de fonte na mesma peça.

---

## 6. Processo (inegociável)

1. Gerar peça com o `generate.mjs` (ou manualmente seguindo este documento).
2. Revisar com o checklist do `REVIEW.md` gerado junto — voz, claims, limites de caracteres, visual.
3. Ajustar copy/arte. Exportar PNG a partir dos previews HTML.
4. Publicar **manualmente** (orgânico) ou subir no Gerenciador de Anúncios com status **pausado** (pago).

Este sistema **gera para revisão humana. Ele não publica.** A integração `lib/meta/ads.ts` existe para leitura e futura automação de campanha — nunca para postar conteúdo sem aprovação.

---

## 7. Parâmetros máquina

Bloco lido pelo `generate.mjs` para validação automática. Manter em sincronia com as seções 2 e 4.

```json
{
  "lexico_proibido": [
    "revolucionário", "revolucionaria", "revolucionária", "revolucionario",
    "incrível", "incrivel", "incríveis", "incriveis",
    "mágico", "magico", "mágica", "magica", "magia",
    "alucinante", "alucinantes",
    "transforme", "transformador", "transformadora", "potencialize",
    "surreal", "insano", "insana", "chocante", "inacreditável", "inacreditavel",
    "game changer", "game-changer", "disruptivo", "disruptiva",
    "o futuro chegou", "vai mudar tudo", "segredo", "hack", "truque",
    "turbine", "alavanque", "desbloqueie", "imperdível", "imperdivel",
    "🚀", "🔥", "🤯", "✨",
    "importação direta", "importacao direta", "plugin do sketchup",
    "histórico de 30 dias", "historico de 30 dias", "histórico ilimitado", "historico ilimitado",
    "lumen", "lumens"
  ],
  "limites": {
    "headline_arte_palavras": 8,
    "gancho_legenda_chars": 125,
    "titulo_anuncio_chars": 40,
    "descricao_anuncio_chars": 30,
    "titulo_slide_palavras": 7,
    "corpo_slide_chars": 220,
    "hashtags_max": 5,
    "hashtags_min": 3
  },
  "cta_botoes_validos": ["SIGN_UP", "LEARN_MORE"]
}
```
