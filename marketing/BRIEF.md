# BRIEF — Produção de conteúdo Instagram @spacenode.app

## O que é o SPACENODE
SaaS de renderização com IA para arquitetos brasileiros. O usuário sobe uma
imagem do SketchUp e recebe um render fotorrealista em minutos. Diferenciais:
Geometry Lock (slider que trava a geometria do projeto), Spaces (consistência
entre imagens do mesmo projeto), workflow SketchUp-first, feito por um
arquiteto brasileiro. **Já lançado e vendendo** — ver "Fase da campanha" no
anexo, não confie em memória de fase.

## Público-alvo
Arquitetos e estudantes de arquitetura no Brasil, donos de escritório pequeno/
médio. Dores: render tradicional é caro (R$150–600/imagem terceirizada),
lento (madrugadas no V-Ray/Lumion) e exige hardware caro. Tom: "de arquiteto
para arquiteto" — direto, honesto, zero hype de IA, zero corporativês.

## Identidade visual (NUNCA desviar)
- Fundo escuro: #0A0A0A (dark) / claro: #FAFAFA — sistema Apple-inspired
- Verde de destaque: #30D158 (usar com parcimônia: CTAs, números, 1 palavra-chave)
- Tipografia: Geist SemiBold para títulos, Geist Regular para corpo
  (fonte em marketing/brand/; se faltar, baixar de vercel/geist no GitHub)
- Logo: símbolo "ConstellationN" — um "N" formado por 3 traços lineares e 4 nós
  (círculos) nos vértices, opcionalmente com o wordmark "spacenode" à direita.
  Arquivos em marketing/brand/. **100% monocromático** (branco sobre escuro) —
  a versão com nó de acento verde foi aposentada pelo dono em 2026-07-02.
- Texto branco #FFFFFF sobre fundo escuro; nunca usar outras cores de destaque
- Estética minimalista: muito respiro, sem sombras exageradas, sem gradientes
  chamativos, sem emoji dentro das artes (emoji só em legenda)

## Especificações técnicas dos assets
- Reels: 1080×1920 (9:16), 30 fps, H.264 (libx264, crf 18, yuv420p), SEM áudio
  (a música é adicionada no app do Instagram para pegar áudio em alta)
- Feed/carrossel: 1080×1350 (4:5), PNG
- Capas de highlight: 1080×1920, ícone centralizado em círculo, fundo #0A0A0A
- Zona segura nos Reels: nada de texto nos 220px do topo nem nos 320px da base
  (a UI do Instagram cobre essas áreas); texto sempre no terço central
- Duração: Reels de transformação 8–12s; screen recording 20–30s; compilados 15s

## Pipeline de produção
1. TEXTOS NA TELA: nunca usar drawtext do ffmpeg (kerning ruim). Gerar cada
   card de texto como HTML (Geist, fundo transparente ou #0A0A0A) e capturar
   PNG 1080×1920 com Playwright (deviceScaleFactor 2, depois reduzir). Isso
   vale para slides de carrossel também — carrossel é HTML → screenshot.
2. VÍDEO: montar com ffmpeg a partir dos PNGs e renders:
   - Movimento nos renders: zoompan (Ken Burns) lento, zoom máx. 1.08
   - Transição antes→depois: corte seco no beat OU wipe horizontal rápido
     (xfade wipeleft, 0.3s). O "antes" fica no máximo 1,5s na tela.
   - Sempre terminar com card final: logo + "spacenode.app" (1,5s)
3. SCREEN RECORDING do produto: usar Playwright contra o app local
   (npm run dev), viewport 1920×1080, gravar o fluxo upload → ajustes →
   gerar → resultado. Acelerar 2x no ffmpeg (setpts=0.5*PTS) e compor dentro
   do frame 9:16: vídeo no centro, fundo #0A0A0A, título em cima.
   NUNCA gravar dados reais de usuários do beta — usar conta/projeto de demo.
4. RENDERS: usar SOMENTE imagens de marketing/renders/ (material real do
   produto). NUNCA gerar renders com IA externa para fingir que são output
   do produto — isso destruiria a credibilidade se descoberto.
5. Cada asset gerado vai para marketing/output/AAAA-MM-DD-<slug>/ contendo:
   - o(s) arquivo(s) final(is) (mp4/png)
   - caption.txt — legenda pronta + hashtags
   - QA.md — checklist preenchido (ver abaixo)

## Controle de qualidade (obrigatório antes de entregar)
- Extrair 4 frames do vídeo (ffmpeg -ss ... -frames:v 1) e INSPECIONAR
  visualmente: texto legível? dentro da zona segura? cores da marca corretas?
- ffprobe: confirmar 1080×1920, 30fps, duração alvo, yuv420p
- Legenda: contém as palavras-chave de busca (render com IA, SketchUp,
  arquitetura) em texto corrido + 5–8 hashtags do pool:
  #arquitetura #render #sketchup #archviz #arquiteto #projetodeinteriores
  #renderizacao #iaparaarquitetos
- CTA coerente com a fase: **fase atual = pós-lançamento → "teste grátis no link
  da bio"** (ver "Fase da campanha" no anexo)

## Pilares e proporção do feed
1. Transformação antes/depois (~40%) — alcance
2. Educação/workflow (~25%) — autoridade, carrosséis
3. Produto em ação (~20%) — screen recordings honestos
4. Marca/founder (~15%) — roteiros para o Vinícius gravar (gerar roteiro +
   cards de apoio, não o vídeo)

## Roteiros de referência (usar como base, variando o ambiente/render)
- REEL TRANSFORMAÇÃO: hook visual "Seu cliente não entende isso…" (SketchUp
  1,5s) → transição → render com "…mas entende isso. Gerado em minutos com
  IA." → card final logo.
- REEL GEOMETRY LOCK: "O medo de todo arquiteto ao usar IA" → exemplo de
  geometria destruída → demo do slider → "Seu projeto continua sendo seu."
- REEL PRODUTO: "Isso é um render sendo feito em tempo real. Sem cortes." →
  screen recording acelerado com timer → antes/depois lado a lado.
- CARROSSEL DOR: capa "5 horas renderizando. O problema não é você." →
  workflow tradicional vs. IA → CTA de salvar + seguir.
- CARROSSEL MITO: capa "IA vai substituir o arquiteto?" → não, mas quem usa
  apresenta melhor e fecha mais → CTA de compartilhar.

---

# Anexo do repo (preenchido no setup — 2026-07-29)

## Inventário de assets disponíveis

`marketing/renders/` já está populado com os **6 pares reais** usados na galeria
da landing (mesmo nome nos dois lados, conforme a regra dos pares):

| par | ambiente |
|---|---|
| `banheiro.jpg` | Interior · Banheiro |
| `living.jpg` | Interior · Sala de estar |
| `coworking.jpg` | Coworking |
| `industrial.jpg` | Comercial · Interior industrial |
| `casa.jpg` | Residencial · Casa contemporânea (fachada) |
| `comercial.jpg` | Comercial · Fachada urbana |

> **Gotcha ao repopular a partir de `public/`:** os arquivos
> `gallery-casa-*.jpg` e `gallery-comercial-*.jpg` estão **trocados no disco** —
> nesses dois o `-after` é o modelo SketchUp e o `-before` é o render.
> `components/Gallery.tsx` compensa invertendo as props. As cópias em
> `marketing/renders/` já saíram corrigidas (antes = SketchUp, depois = render).

`marketing/brand/`:
- `spacenode-symbol.svg` — símbolo isolado, branco, viewBox 64 (bom para capas
  de highlight e watermark)
- `spacenode-logo-horizontal.svg` — lockup símbolo + wordmark, branco
- `geist-latin.woff2` / `geist-latin-ext.woff2` — a mesma Geist que o app usa
  (`@font-face` local, sem CDN)

Fonte de verdade da identidade em código: `components/brand/Logo.tsx`,
`components/brand/ConstellationN.tsx` e os tokens de `app/globals.css`
(`--color-accent-green: #30d158` no dark).

## Ferramental (instalado em 2026-07-29)

- **ffmpeg / ffprobe 8.1.2** — via `winget install Gyan.FFmpeg`. **Não está no
  PATH.** `marketing/scripts/lib/tools.mjs` resolve o binário sozinho (env
  `FFMPEG`/`FFPROBE` → PATH → diretório de pacotes do winget). Use sempre esse
  módulo em vez de chamar `ffmpeg` cru.
- **Playwright 1.62 + Chromium** — devDependency do repo.

## Scripts

```bash
# Reel de transformação, versão IMPACTO (8,6s) — é a versão de referência hoje.
node marketing/scripts/reel-impacto.mjs --roteiro entrega --data 2026-07-29

# Versão v1, mais sóbria (10s), imagem em faixa sobre preto.
node marketing/scripts/reel-transformacao.mjs --roteiro entrega --data 2026-07-29

# Trocar o par de um roteiro existente:
node marketing/scripts/reel-impacto.mjs --roteiro base --par living --data 2026-07-29
```

### REEL PRODUTO (pilar 3) — captura + edição

```bash
# 1x, NO TERMINAL DO DONO (precisa de janela gráfica): ele faz o login
node marketing/scripts/gravar-produto.mjs --login

# filmagem headless reusando o perfil salvo — GASTA NODES
node marketing/scripts/gravar-produto.mjs --shoot --data AAAA-MM-DD

# edição
node marketing/scripts/reel-produto.mjs --slug AAAA-MM-DD-reel-produto-banheiro
```

**Restrições descobertas em 2026-07-29 (não perder tempo redescobrindo):**
- `/app` é auth-gated. **Não existe caminho em que o assistente autentique**: digitar
  senha em campo de login está fora, e reaproveitar cookie/token da sessão do dono
  também. O login é sempre passo manual do dono.
- Dirigir o Chrome do dono (MCP claude-in-chrome) **opera** o produto mas **não
  exporta pixels**: as capturas ficam no contexto da conversa e não viram arquivo.
  Serve para reconhecimento de tela, não para produzir material.
- Nesta sessão o Playwright **headed não abre** (`spawn UNKNOWN`, mesmo fora do
  sandbox — não há desktop). Headless funciona e grava vídeo + PNG em disco.
  Daí a divisão: dono loga (headed, terminal dele), assistente filma (headless).
- `gravar-produto.mjs` tem trava de custo: só clica em gerar depois que o resumo da
  tela confirmar o motor pedido. Se não achar o controle, aborta e lista os botões
  visíveis — sem gastar node.
- O selo de velocidade ("2×") é obrigatório em qualquer screen recording acelerado, e
  fica no scrim ACIMA da banda (dentro da banda ele cobre a UI do produto).

**Qual usar:** `reel-impacto.mjs` para alcance (full-bleed, régua de revelação, corte
seco de volta, 8,6s). `reel-transformacao.mjs` quando quiser algo mais contido. Os
dois leem os mesmos roteiros, então a mensagem é idêntica.

**Regras aprendidas montando o impacto — não desfazer:**
- O wipe atravessa a IMAGEM, nunca o TEXTO. Os hooks de antes/depois ficam na mesma
  altura; wipar os dois junto vira sopa ("ententende isso."). Texto troca em corte.
- O scrim é camada própria, não parte dos cards de texto. Senão, esconder o texto no
  corte seco leva o scrim embora e o quadro fica lavado.
- Revelação = `xfade=wipeleft` (imagens paradas, borda anda). Overlay deslizante NÃO
  serve: encosta a borda direita de uma imagem na esquerda da outra e lê como bug.
- `xfade` é linear, então a régua tem que ser linear também — nada de ease-out.
- O escurecimento do fundo desfocado é diferente para cada lado (modelo do SketchUp
  é cinza médio, render é escuro): sem isso o corte seco dá um flash claro.
- `setsar=1` nos dois ramos antes do `concat` — o `zoompan` devolve SAR 19200:19201 e
  o concat recusa juntar com o card final.

O script faz tudo: recorte no mesmo aspecto nos dois lados, cards de texto em HTML
→ PNG via Playwright (dSF 2 → lanczos), montagem no ffmpeg, extração dos 4 frames
de QA e o `ffprobe` de conferência. `caption.txt` e `QA.md` são escritos à mão em
cada post (a legenda é editorial, não template).

**Roteiros** ficam em `marketing/scripts/lib/roteiros.mjs` — hook do antes, hook do
depois e subtexto, com `{palavra}` marcando a única palavra em verde. Já existem
`base` (banheiro), `entrega` (living), `preco` (casa) e `apresentacao` (industrial).
Novo Reel = nova entrada lá, não um script novo.

**Layout** (`lib/reel-cards.mjs`): a banda da imagem é sempre 1080 de largura e
centrada no frame, com o aspecto do próprio par **limitado entre 4:3 e 16:9** — os
pares vão de 1,54 a 2,60, e sem esse limite o panorâmico virava uma tira fina.
O hook fica 70px acima da banda e o subtexto 60px abaixo; `bandGeometry()` **levanta
erro** se qualquer um invadir a zona segura (220–1600), então o layout não sai
errado silenciosamente.

**Gotchas de ffmpeg já pagos (não repetir):**
- Card PNG é 1 frame. Sem `-loop 1 -framerate 30 -t <dur>` no input, o
  `shortest=1` do `overlay` trunca o segmento inteiro (o primeiro corte saiu com
  1,57s em vez de 10s).
- `zoompan` recebe a banda já em 2× (2160×1620) e só faz downsample — evita
  pixel esticado no fim do Ken Burns.

## Fase da campanha (confirmado pelo dono em 2026-07-29)

O produto **não está mais em beta**: vende em produção desde 16/07/2026 (Stripe
live) e cadastro novo ganha **80 nodes grátis** para testar.

- **CTA padrão: "Teste grátis no link da bio."** A versão "segue @spacenode.app"
  do roteiro pré-lançamento está aposentada — não usar.
- "teste grátis" é honesto por causa do grant de cadastro, não porque exista trial
  de assinatura. Não prometer "trial", "30 dias grátis" nem plano gratuito ilimitado.
- Existe uma oferta de **50% no 1º mês** rodando até 31/08/2026 (desconto
  automático no checkout). Serve como ângulo de urgência, mas **confirmar que ainda
  está no ar antes de citar em legenda** — a data de fim é estática no código.

"Gerado em minutos" está aprovado como claim de tempo (dono confirmou em
2026-07-29) — é o tempo percebido no engine default.

## Claims proibidos (são falsos — nunca reintroduzir em legenda ou arte)

- "importação direta"/plugin do SketchUp — não existe plugin
- "histórico de 30 dias/ilimitado" por plano — não há retenção por plano
- "Lumens" — conceito APOSENTADO em 2026-08-31: todo crédito é "Node".
  Nodes mensais renovam com o plano; **Nodes extras** são os avulsos, sem
  validade, em qualquer plano pago. Nunca usar "Lumens" em peça nova, nem
  prometer expiração para Nodes extras.
- Plano **Office** — aposentado p/ novas assinaturas em 2026-08-31. Não
  promover; a vitrine é Starter/Pro/Studio.

Custos reais de nodes, se precisar citar número: Pulsar HD 10 / 2K 15 / 4K 25;
Vega 2K 20 / 4K 40; Quasar 2K 28 / 4K 56.

---

# Anexo 2026-09-04 — acervo real, kit de montagem e correções de fato

## Correções ao texto acima (o que mudou desde 29/07)
- **Plugin de SketchUp EXISTE** desde set/2026 (PRs #159–#165): landing tem a faixa `#sketchup`,
  página `/sketchup` e download público `public/downloads/spacenode-sketchup.rbz` (v0.7.0).
  A regra "não existe plugin" acima está obsoleta. Ressalva: o `.rbz` ainda não foi assinado no
  portal da Trimble — peça sobre o plugin fica **gated** até o dono assinar e validar.
- **Oferta de 50% no 1º mês ENCERROU em 31/08/2026.** Não citar.
- Cadastro grátis = **80 nodes** (não 40). Planos: Starter R$89 / Pro R$199 / Studio R$349.
- Módulos ativos hoje: Renderizar, Spaces, Editar, Ampliar, Animar, Finalizar, Estudar (beta),
  Planta humanizada, Blocos 3D (beta). Isométricas/Prancha/Moodboard seguem OFF.

## Acervo real do dono (fonte para Reels a partir de agora)
Além dos 6 pares de `marketing/renders/`, o banco de produção tem ~800 imagens geradas na conta
do dono (290 renders com o "antes", 107 vistas de Spaces, ~50 edições, 15 vídeos do Animar).
O inventário (JSON + miniaturas + folhas de pares) é gerado por script fora do repo — ver a
memória do assistente "Reels a partir do acervo" para o caminho da sessão.

## Kit de montagem por spec (`marketing/scripts/reel-spec.mjs`)
Substitui escrever um script ffmpeg por Reel: `node marketing/scripts/reel-spec.mjs spec.json`.
Documentação em `marketing/scripts/REEL-KIT.md` (stills com Ken Burns, vídeos do Animar,
split antes/depois empilhado, cards HTML, wipes com régua, overlays em tempo global, QA).
