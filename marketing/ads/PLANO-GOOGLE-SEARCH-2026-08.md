# Captação Google Ads — campanha de Pesquisa (plano de 2026-08-18)

> Recuperado em 2026-09-05 do artifact original
> (https://claude.ai/code/artifact/8715b640-a379-470f-8be5-1fb0dba29c99); o arquivo em
> `marketing/ads/` nunca tinha sido commitado. É a ficha de execução da **frente C** do
> `PLANO-TRAFEGO-PAGO-2026-09.md` — as revisões de setembro (verba por grupo, LP por grupo,
> conversão por importação off-line, sem extensão de promoção, negativas novas) estão lá e
> prevalecem sobre este texto onde houver conflito.

Campanha de Pesquisa para capturar quem já procura render e imagem com IA para arquitetura
no Brasil — e converter em cadastro (80 nodes grátis) e assinatura. Tudo nasce **pausado**;
a ativação é do dono.

- Canal: Pesquisa Google · Local: Brasil · Orçamento base: R$ 40/dia · 1 campanha, 4 grupos
- Conversão: cadastro (e assinatura, por importação off-line — revisão de setembro)

## 00 · Pré-voo — bloqueadores antes de ativar

1. **Conversão de cadastro.** Em agosto: criar ação "Cadastro" (Site, Inscrição, contagem Uma,
   30 dias, principal) e setar `NEXT_PUBLIC_GADS_SIGNUP_LABEL` na Vercel + redeploy.
   **Revisão de setembro:** preferir ações do tipo *importar de cliques* (`gclid`) alimentadas
   pelo funil first-party, sem depender da tag no site.
2. **LGPD — cláusula 7.** `/privacidade` promete "sem rastreadores de terceiros"; a tag do Google
   está no ar desde 23/07. Atualizar a cláusula (ou remover a tag) antes de escalar gasto.
3. **Auto-tagging ON** (gclid). O cookie `sn_attribution` já lê gclid + UTMs.
4. **Regra da casa:** campanha, grupos e anúncios entram pausados no Gerenciador.

## 01 · Estratégia — o que capturamos e o que não

**Capturamos:** render com IA (núcleo da demanda ativa) · render de SketchUp (workflow-first) ·
planta humanizada (intenção altíssima, módulo ativo) · IA para arquitetura (categoria
qualificada, inclui "gerar imagem de arquitetura com IA").

**Fora, de propósito:** "gerador de imagem IA" genérico (público de meme/avatar; posicionamento
proíbe) · marcas concorrentes (Lumion, V-Ray, Enscape, D5 — jurisprudência do STJ trata compra
de marca alheia como concorrência desleal; entram como negativas, fase 2 só com parecer) ·
Display / PMax (sem histórico de conversão).

## 02 · Estrutura — naming e UTMs

Identificadores no padrão de `lib/marketing/ads/naming.ts`; o id do anúncio em minúsculo vira
`utm_content`, a chave que liga clique → cadastro → assinatura.

| Nível | Identificador | Papel |
|---|---|---|
| Campanha | `SN_GOOGLE_CAPTACAO_ARQUITETO` | `utm_campaign` |
| Grupo 1 | `…_RENDERIA` | Render com IA |
| Grupo 2 | `…_SKETCHUP` | Workflow SketchUp |
| Grupo 3 | `…_PLANTAHUM` | Planta humanizada |
| Grupo 4 | `…_IAARQ` | IA para arquitetura |
| RSAs | `…_{PROMESSA}_RSA01_COPY01` | `utm_content` (PRAZO · FIDELIDADE · APRESENTACAO · CATEGORIA) |

URL final (agosto: home; setembro: LP por grupo em `/lp/<slug>`):

```
https://spacenode.app/?utm_source=google&utm_medium=cpc
  &utm_campaign=sn_google_captacao_arquiteto
  &utm_content=<id do anúncio em minúsculo>
  &utm_term=arquiteto
```

## 03 · Configuração — checklist de criação

| Configuração | Valor |
|---|---|
| Tipo | Pesquisa, criada sem orientação de meta (evita expansões automáticas) |
| Redes | Só Pesquisa Google — desmarcar Parceiros de pesquisa e Display |
| Local | Brasil, segmentação por presença (não "interesse") |
| Idiomas | Português e Inglês (navegador em EN é comum) |
| Lances | Maximizar cliques com teto de CPC R$ 3,00 → migrar para Maximizar conversões com conversão ativa e ≥ 30 conv./30 d |
| Orçamento | R$ 40/dia (≈ R$ 1.200/mês) · mínimo viável R$ 25/dia |
| Rotação | Otimizar |
| Programação | 24/7 na v1 — não cortar noite sem dado |
| Sitelinks | Só com LPs por grupo publicadas (revisão de setembro) |

**Callouts (todos verificados):** Cadastro sem cartão · 80 nodes grátis · Geometry Lock · Tudo
no navegador · Suporte em português · Feito por arquiteto.

**Snippet estruturado — Serviços (só módulo ativo):** Render fotorrealista · Planta humanizada ·
Edição de imagem · Ampliação de imagem · Vídeo do projeto. Nunca anunciar Isométricas, Prancha IA
ou Moodboard (desligados em `lib/nav/modules-config.ts`).

**Extensão de promoção:** a de agosto (50% na 1ª mensalidade, 18–31/08) **expirou** — não recriar.

## 04 · Palavras-chave — quatro grupos, correspondência controlada

Só frase e exata. Lista enxuta de propósito; expandir pelo relatório de termos toda semana.

**G1 · Render com IA** (`…_RENDERIA`) — *setembro: preferir as frases com modificador profissional*

```
"render com ia"  "renderizar com ia"  "render ia"  "render com inteligência artificial"
"renderizador com ia"  "programa de render com ia"  "site para renderizar com ia"
"render online com ia"  "criar render com ia"
[render com ia]  [renderizar com ia]
+ setembro: "render com ia para arquitetura"  "renderizar projeto com ia"  "render com ia sketchup"
```

**G2 · SketchUp** (`…_SKETCHUP`)

```
"renderizar sketchup"  "render sketchup online"  "renderizar sketchup online"
"sketchup com ia"  "ia para sketchup"  "renderizar modelo do sketchup"
"render rápido sketchup"  "como renderizar no sketchup"
[renderizar sketchup]  [render sketchup]
```

"como renderizar…" tem intenção mista de tutorial — manter e vigiar o CPL; cortar se não converter.

**G3 · Planta humanizada** (`…_PLANTAHUM`)

```
"planta humanizada"  "planta humanizada online"  "fazer planta humanizada"
"planta humanizada com ia"  "programa para planta humanizada"
"planta humanizada automática"  "como fazer planta humanizada"
[planta humanizada]  [planta humanizada com ia]
```

**G4 · IA para arquitetura** (`…_IAARQ`) — *setembro: 15% da verba, vigiar ativação*

```
"ia para arquitetura"  "ia para arquitetos"  "inteligência artificial para arquitetura"
"ia para design de interiores"  "ia para projetos de arquitetura"
"gerar imagem de arquitetura com ia"  "criar imagem de arquitetura com ia"
"imagem com ia arquitetura"
[ia para arquitetura]  [ia para arquitetos]
```

**Negativas — nível campanha**

```
curso, cursos, aula, aulas, tutorial, apostila, faculdade, tcc,
emprego, vaga, vagas, salário, estágio, currículo,
download, baixar, apk, crack, crackeado, torrent, pirata,
midjourney, dall-e, dalle, stable diffusion, leonardo ai, chatgpt, canva,
vray, v-ray, lumion, enscape, twinmotion, d5,
o que é, significado, wallpaper, png, logo, logotipo,
tattoo, tatuagem, anime, jogo, jogos
+ setembro: free, sem pagar, ilimitado, estudante
```

Não negativar: `grátis` (o cadastro é grátis mesmo), `revit` (upload de print funciona de qualquer
software), `photoshop` no G3 (quem busca "planta humanizada photoshop" aceita um caminho mais fácil).

## 05 · Anúncios — RSAs prontos para colar

Tom do brief: de arquiteto para arquiteto, direto, zero hype de IA. Léxico proibido conferido,
sem emoji, claim de tempo aprovado ("em minutos"), preços conferidos em `lib/plans.ts`.
Títulos ≤ 30, descrições ≤ 90 (contagem entre parênteses).

### G1 · Render com IA — `sn_google_captacao_arquiteto_prazo_rsa01_copy01`

Títulos: Render com IA para Arquitetos (29) · Fotorrealismo em Minutos (24) · Do Modelo 3D ao
Fotorrealista (29) · Sem Fila, Sem Madrugada (23) · Geometria do Projeto Intacta (28) · Cadastro
Grátis, Sem Cartão (27) · Planos a partir de R$ 89/mês (28) · Feito por Arquiteto, no Brasil (30) ·
Renderize no Navegador (22) · Sem Hardware Caro (17) · Seu Cliente Entende o Render (28) · Teste
com 80 Nodes Grátis (25)

Descrições:
- Suba a imagem do seu modelo e receba um render fotorrealista em minutos. Teste grátis. (86)
- Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
- Sem placa de vídeo, sem fila de render. Tudo no navegador, a partir de R$ 89/mês. (81)
- Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade. (87)

### G2 · SketchUp — `sn_google_captacao_arquiteto_fidelidade_rsa01_copy01`

Títulos: Renderize Prints do SketchUp (28, fixar na posição 1) · Do SketchUp ao Render com IA
(28) · Do Print ao Fotorrealista (25) · Geometry Lock: Projeto Fiel (27) · Fotorrealismo em
Minutos (24) · Sem Render de Madrugada (23) · Cadastro Grátis, Sem Cartão (27) · A partir de
R$ 89/mês (21) · Seu Cliente Entende o Render (28) · Sem Plugin, Sem Instalação (26)* · Upload da
Imagem e Pronto (25) · Render Fiel ao Seu Modelo (25)

Descrições:
- Faça upload do print do SketchUp e receba o render fotorrealista em minutos, no navegador. (90)
- Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
- Sem plugin e sem render de madrugada: o modelo que você já tem vira apresentação. (81)*
- Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade. (87)

\* Em setembro o plugin do SketchUp existe (v0.8, `.rbz` ainda não assinado). Trocar "Sem Plugin,
Sem Instalação" por "Funciona com Qualquer Print" e a 3ª descrição por "Sem render de madrugada:
o modelo que você já tem vira apresentação, direto no navegador." até o plugin ser anunciável.

### G3 · Planta humanizada — `sn_google_captacao_arquiteto_apresentacao_rsa01_copy01`

Títulos: Planta Humanizada com IA (24, fixar na posição 1) · Da Planta Técnica à Humanizada (30) ·
Humanize Plantas em Minutos (27) · Planta Humanizada Online (24) · Cores, Pisos e Mobiliário (25) ·
Apresente a Planta ao Cliente (29) · Cadastro Grátis, Sem Cartão (27) · A partir de R$ 89/mês
(21) · Sem Photoshop, Sem Demora (25) · Feito para Arquitetura (22) · Envie a Planta e Pronto
(23) · Qualidade de Apresentação (25)

Descrições:
- Envie a planta técnica e receba a versão humanizada em minutos, pronta para apresentar. (87)
- Pisos, cores e mobiliário aplicados com IA, respeitando o desenho da sua planta. (80)
- Sem horas de Photoshop: a planta humanizada sai no navegador, sem hardware caro. (80)
- Cadastro grátis com 80 nodes para testar. Planos a partir de R$ 89 por mês. (75)

### G4 · IA para arquitetura — `sn_google_captacao_arquiteto_categoria_rsa01_copy01`

Títulos: IA Feita para Arquitetura (25) · Imagens de Arquitetura com IA (29) · Render com IA para
Arquitetos (29) · Imagens Fiéis ao Seu Projeto (28) · Do Projeto à Apresentação (25) ·
Fotorrealismo em Minutos (24) · Cadastro Grátis, Sem Cartão (27) · Planos a partir de R$ 89/mês
(28) · Geometria do Projeto Intacta (28) · Feito por Arquiteto, no Brasil (30) · Render, Planta e
Vídeo (22) · Tudo no Navegador (17)

Descrições:
- IA para renderizar, editar, ampliar e animar imagens do seu projeto de arquitetura. (83)
- Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro. (84)
- Ferramenta de imagem com IA feita para arquitetos, não um gerador genérico. Teste grátis. (89)
- Suba a imagem do seu modelo e receba um render fotorrealista em minutos. Teste grátis. (86)

## 06 · Experimento — critério de sucesso e guardrails (agosto)

Hipótese: existe demanda ativa qualificada por render/imagem IA de arquitetura no Brasil que
converte em cadastro a custo sustentável. A fase 1 compra dado, não escala.

- CPL alvo ≤ R$ 40 em 30 dias · ≥ 10 cadastros · ativação ≥ 40% · R$ 300 gastos sem cadastro → pausar o grupo.
- Meta de negócio (90 dias): ≥ 2 assinaturas atribuídas. CAC de R$ 600 no Starter = payback ~7 meses; no Pro (R$ 199) ~3 meses.
- Rotina semanal: termos de pesquisa → exata/negativa; CPL por grupo; CSV de desempenho no painel.

**Setembro substitui estes números pelos do plano geral** (CPL ≤ R$ 35, ativação ≥ 50%,
CAC ≤ R$ 450 em 60 dias, escala só com CAC ≤ R$ 400).

## 07 · Fase 2 (não fazer agora)

Conversão de assinatura com valor · LPs por grupo (virou frente C, item 3) · marcas concorrentes
só com parecer jurídico.
