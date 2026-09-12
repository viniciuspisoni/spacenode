# REELS-SLATE — @spacenode.app · rodada 2026-09-04

Documento final da head de conteúdo. Consolida 13 conceitos finalistas, as notas do júri (4 lentes) e os dois pareceres adversariais de cada um (marca; assets). Onde os pareceres divergiram, a decisão está escrita e justificada no próprio Reel.

Convenções deste documento:
- Raiz do acervo: `C:/Users/Pisoni/AppData/Local/Temp/claude/C--Users-Pisoni-spacenode/19988837-c924-4b30-b28f-e9e7dc6696fa/scratchpad/` — miniaturas em `thumbs/NNNN-kind-role.jpg`, originais em `assets/`, QA dos pareceres nas pastas `qa*/`, `dop_check/`, `dp/`, `cf/`, `qa-drone/`.
- Texto em tela segue a linguagem da landing no ar: minúsculas com ponto final, duas frases curtas, sem exclamação. CTAs ficam exatamente como na lista aprovada (a caixa do CTA não se altera).
- Visual: faixas #1a1a1a (não #0a0a0a), Geist 500 no hook / 300–400 no apoio, verde #30d158 só funcional (uma palavra ou um marcador), card final do kit = logo monocromático + pílula branca "CTA →" + microcopy "80 nodes grátis · sem cartão · em português", sem URL na arte.
- Specs: 1080×1920, 30 fps, H.264 crf 18, yuv420p, sem áudio; texto só entre y=220 e y=1600; `setsar=1` antes de qualquer concat.

---

## 1. Sumário executivo

1. **Tese de conteúdo:** a conversão nasce de prova, não de promessa. Cada Reel dá ao arquiteto um teste que ele faz com os próprios olhos (marcadores, pisca, régua, "conte o que saiu do lugar") e o CTA transfere esse teste para o projeto dele — cadastro grátis, sem cartão, 80 nodes. A assinatura vem quando o segundo projeto (ou a segunda rodada de opções para o cliente) estoura o saldo grátis.
2. **Orgânico e pago com a mesma peça:** todo Reel nasce ≤12 s, com loop (sem card final quando o loop é a mecânica) e com cutdown ≤15 s + 3 variações de copy (fidelidade / prazo / apresentação) para o Meta. O que muda entre os dois usos é o fecho: overlay/loop no orgânico, botão do anúncio no pago.
3. **O que muda em relação aos Reels de julho:** (a) acervo real de 807 assets em vez dos 6 pares da landing — todo par foi verificado por hash, blend 50/50 e diff por região; (b) imagens em retrato/4:5/3:2 preenchendo o 9:16 em vez da faixa 16:9 pequena; (c) ganchos por instrução, objeção ou situação reconhecível, não frases de venda; (d) linguagem da landing atual (minúsculas com ponto, Geist 300–500, #1a1a1a, pílula branca) em vez do brief de julho; (e) claims auditados — nenhum "nada mudou", nenhum horário, só "gerado em minutos".
4. **Três pilares carregam o slate:** fidelidade geométrica (5 peças), antes-e-depois (2), demonstração de ferramentas (2 — Editar e Animar) e produtividade/tradicional-vs (2). Nenhuma peça de plugin nesta rodada (o .rbz não está assinado) e nenhuma cita módulo desligado.
5. **Repetição de acervo foi resolvida por calendário, não por corte:** a casa com piscina (drone/esquadria/vídeo) e a cozinha (#426/#425) aparecem em mais de um conceito; ficam separadas por ≥2–3 semanas e por pilar diferente.
6. **Quatro conceitos caíram:** um por prova falsa (só a parede), três por duplicidade com peças melhores do mesmo acervo (série cinco climas, resposta-prazo cinco climas, repara no lustre). O que tinham de bom foi absorvido pelas peças que ficaram.
7. **Um conceito foi reconstruído:** o do banheiro (ex-"lavabo") tinha a legenda apoiada num fato errado; troquei o "depois" pelo #473, que torna o "nada." quase literal, e reescrevi tudo.
8. **Ordem de produção recomendada:** (1) drone → (2) cinco climas → (3) pisca → (4) entre duas reuniões → (5) editar: só o piso → (6) banheiro → (7) zoom cozinha → (8) três antes das 14h → (9) print, render, vídeo → (10) esquadria (reserva). Os quatro primeiros cobrem a semana 1 e a campanha paga inicial; três deles são kit puro.
9. **Pré-condição técnica única:** 1 linha no `marketing/scripts/lib/reel-kit.mjs:188` (`c.url || 'spacenode.app'` → `c.url === undefined ? 'spacenode.app' : c.url`) para o card final aceitar `url: ""` — sem isso, o kit imprime o domínio na arte.
10. **Pré-condições do dono antes de veicular pago:** confirmar autoria/permissão dos modelos (casa com piscina, casa de concreto e ripado, cozinha, sala de jantar, suíte, banheiro, volumes gêmeos), confirmar que os prints #426/#430/#474 saíram do SketchUp e configurar o evento de cadastro no pixel do Meta. Lista completa na seção 5.

---

## 2. Slate ordenado dos Reels aprovados

### R1 · `resposta-direta/resposta-nada-sai-do-lugar-drone` — nada sai do lugar (drone → chão)

- **Pilar / ângulo:** fidelidade-geometrica · resposta direta à objeção nº 1 ("o render vai inventar o meu projeto").
- **Formato / duração:** vídeo-anúncio de 11,5 s (cutdowns 8,5 s e 6 s). Serve ao orgânico como 4º post da semana 1.
- **Por que converte:** é a melhor peça para cadastro do lote (conversão 9). Prova visual antes de qualquer texto: três cantoneiras sobre objetos que qualquer um confere no celular (espreguiçadeiras, escada, planta no vaso) não se movem quando o wipe troca print por render. Oferta explícita na arte ("80 nodes grátis · sem cartão · em português"), SIGN_UP, pré-qualifica pela fidelidade e não pelo hype.
- **Decisões sobre os pareceres:** (1) full-bleed 9:16 é geometricamente impossível com os três marcadores (parecer de assets, medido: janela 639 px vs vão 650 px) → **imagem em 4:5 (1080×1350) centrada, faixas #1a1a1a de 285 px**; upscale cai para 1,48× no antes e 1,14× no depois. (2) "vaso" vs "planta": o parecer de marca diz que no print é um arbusto preto e o vaso só fica claro no render; o de assets manda dimensionar a cantoneira pelo POTE (≈70×70 px, mesma posição nos dois). Faço os dois: cantoneira do tamanho do pote, e a copy diz **"planta"** — é o que o viewer vê nos dois lados. (3) Micro-linha e card final no padrão do kit; "sem cartão" está na landing (Hero, Navbar, FinalCTA, MobileCTA) — claim aprovado.
- **Gancho:** sem texto até 2,4 s. Visual: print aéreo oblíquo do SketchUp (#442) em 4:5, deck de madeira, três espreguiçadeiras em diagonal, escada preta, planta no vaso, pavers, piscina; aos 0,6 s três cantoneiras hairline brancas (1,5 px) surgem; aos 1,4 s o wipe da esquerda para a direita troca para o render (#441) e as cantoneiras continuam sobre os mesmos objetos. Headline "nada sai do lugar." aos 2,4 s.
- **Assets:** #442 `thumbs/0442-render-before.jpg` (728×872) → #441 `thumbs/0441-render-after.jpg` (944×1136), job 6a2d19c1, 2026-04-28, vega/2k; #444 `thumbs/0444-render-before.jpg` (733×867) → #443 `thumbs/0443-render-after.jpg` (944×1120), job 1e83b155, mesma data. Mesmo modelo nas duas vistas (verificado: volume de concreto, 3 chaises em S, piscina chanfrada, pavers).
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,4 | #442 em 4:5 (janela de 909 px centrada no quadro de 944, vão vaso→3ª chaise cabe com folga); sem movimento; aos 0,6 s fade-in das 3 cantoneiras (espreguiçadeiras, escada, vaso — cantoneira do vaso dimensionada pelo pote) | — | 442 |
| 1,4–2,3 | xfade wipeleft linear 0,9 s #442→#441 (antes cover-resized para o quadro exato do depois 944×1136 — alinha chaises, escada e borda da piscina sem offset manual); cantoneiras paradas (overlay separado, o wipe nunca atravessa overlay) | — | 442, 441 |
| 2,3–5,5 | hold #441, push-in 1,00→1,06; scrim inferior em camada própria; cantoneiras somem em fade aos 4,6 s | 2,4 s: **nada sai do lugar.** / 3,4 s: espreguiçadeiras, escada e planta: onde você modelou. | 441 |
| 5,5–6,0 | corte seco para #444 (print do chão, mesmo 4:5 — casa em L inteira) | — | 444 |
| 6,0–6,8 | xfade wipeleft 0,8 s #444→#443 (cover-resize do antes para 944×1120) | — | 444, 443 |
| 6,8–10,0 | hold #443, push-in 1,00→1,05 para o deck; aos 8,0 s bloco de CTA no terço inferior sobre scrim | **Comece grátis** (sublinhado hairline verde — único verde da peça) / 80 nodes grátis · sem cartão · em português | 443 |
| 10,0–11,5 | card final do kit (#1a1a1a): logo monocromático + pílula "Comece grátis →" + microcopy; `url: ""` | — | — |

- **CTA:** Comece grátis.
- **Legenda:**

  > Três espreguiçadeiras, uma escada e uma planta. No render, no mesmo lugar onde você colocou no modelo.
  >
  > O print é uma vista de drone do SketchUp, ainda cru. O render sai com a mesma câmera, o mesmo deck e as três peças na mesma posição — o que muda é material, luz e vegetação.
  >
  > Depois, a mesma casa vista do chão: concreto aparente, ripado, piscina. Mesmo modelo, mesma geometria, gerado em minutos.
  >
  > O cadastro é grátis e já vem com 80 nodes, sem cartão — dá para testar com um projeto seu.
  >
  > Comece grátis no link da bio.
  >
  > #archviz #sketchup #visualizacaoarquitetonica #renderizacao #projetodearquitetura

- **Variante paga (botão SIGN_UP nas três):**
  - A · fidelidade — primário: "Suba o print do SketchUp. O render sai com as peças onde você modelou — e o cadastro vem com 80 nodes, sem cartão." · título: "Render fiel ao seu modelo" · descrição: "80 nodes grátis, sem cartão".
  - B · prazo — primário: "Apresentação amanhã? Suba o print, o render sai em minutos com a geometria no lugar. Cadastro grátis, sem cartão." · título: "Do print à imagem, em minutos" · descrição: "Cadastro grátis, sem cartão".
  - C · apresentação — primário: "Vista de drone e vista do chão do mesmo modelo, para a reunião de amanhã. Piscina, deck e escada onde você desenhou." · título: "Duas vistas, o mesmo projeto" · descrição: "80 nodes grátis, sem cartão".
  - Cutdown 6 s (stories/placements curtos): cenas 1–3 e CTA aos 4,0 s sobre #441; sem par do chão, sem card. Cutdown 8,5 s: mantém o par do chão, corta o card final.
- **Notas de produção:** `marketing/scripts/reel-spec.mjs` com stills `fit:'contain'` (4:5 → 1080×1350) ou composição própria com a mesma caixa; cantoneiras e textos como cards HTML transparentes (`lib/reel-kit.mjs`, Playwright headless, dSF 2 → lanczos) em tempo global; wipes com `ruler:true`; renderizar a partir dos originais em `assets/`, nunca das thumbs; scrim diferente para antes (cinza médio) e depois (mais escuro) para não dar flash no corte seco; QA em 0,7 / 2,0 / 4,0 / 8,5 s conferindo cantoneiras encaixadas e texto dentro da zona segura.
- **Riscos / gating:** nunca "idêntico", "pixel a pixel", "cada peça"; os pavers mantêm o arranjo (só mudam material) e podem ficar no quadro, mas sem marcador; o escritório do térreo em #443 virou reflexo/vegetação — fora dos marcadores; sem "IA" na arte e na legenda. Gate: confirmar autoria do modelo SketchUp da casa com piscina antes de veicular pago. Anti-repetição: mesma casa de R9 e R10 — ≥2 semanas de distância no orgânico.
- **Júri:** retenção 7 (headline só em 2,4 s e card final mata o loop — aceito: é peça de anúncio) · conversão paga 9 (melhor do lote) · marca 9 (headline fala de posição, não de identidade) · produção 7 (o full-bleed foi o problema; resolvido com 4:5).

---

### R2 · `alcance-organico/um-print-cinco-climas` — um print, cinco climas

- **Pilar / ângulo:** antes-e-depois · alcance orgânico com loop tipo timelapse (a mesma casa, câmera travada, só a luz muda). Absorve o melhor da versão serializada e da versão "resposta-prazo" (derrubadas, seção 4).
- **Formato / duração:** série/loop de 10 s (cutdown pago 8,5 s).
- **Por que converte:** vende o hábito que consome nodes: iteração. Responde à pergunta que todo cliente faz ("e à noite?") e que no fluxo tradicional custa um render novo. Funil: "Renderize seu projeto" → cadastro grátis → 1–2 climas no próprio print (Vega 2K = 20 nodes) → 5 climas = 100 nodes estoura os 80 grátis na primeira reunião → Starter. Serve também de remarketing para quem cadastrou e parou no primeiro render.
- **Decisões sobre os pareceres:** (1) **#513 sai, #511 entra** (os dois pareceres e o júri de produção convergem: #513 é outra câmera/escala e traz o eixo vermelho do SketchUp reproduzido no chão; #511 é o mesmo 1312×816, blend perfeito, chão limpo, céu preto — melhor fundo para o fecho). (2) **#521 ("sol") sai, #507 (hora azul) entra.** O parecer de marca da peça-irmã apontou que #517 e #521 são ambos `Diurno` no banco — "cinco climas" ficava frouxo; o parecer de assets da série apontou o flare arco-íris fantasma do #521. Com #507 cada clima é uma escolha de atmosfera distinta (Diurno / Chuva / Entardecer / Blue Hour / Noturno) e o arco vira cronológico. Se o dono preferir o sol, volta #521 e a legenda diz "dia com sol forte". (3) **Faixa 3:2 em vez de 4:3** (o corte 4:3 clipa o nariz do carro e as árvores; o carro inteiro é a prova de "mesmo carro"). (4) Rótulos de clima em pílula (herdados da série) entram — são a legenda embutida para som off; o eyebrow de episódio não entra.
- **Gancho:** "um print. cinco climas." em corte no frame 0 sobre o print #514 (hidden-line do SketchUp: lâmina de concreto central, ripado, cortinas, escada à direita, carro preto à esquerda, duas árvores, eixos do SketchUp visíveis — não retocar). Três imagens diferentes nos 3 primeiros segundos.
- **Assets:** #514 `thumbs/0514-render-before.jpg` (print, 1342×833, md5 7b81d6c3 = #516/#518/#520/#522/#508/#512 — mesmo arquivo, "mesmo print" provado); #517 `thumbs/0517-render-after.jpg` (dia); #515 `thumbs/0515-render-after.jpg` (chuva); #519 `thumbs/0519-render-after.jpg` (entardecer); #507 `thumbs/0507-render-after.jpg` (hora azul); #511 `thumbs/0511-render-after.jpg` (noite). Todos 1312×816, vega/2k, 2026-04-27, "Preservar original". Reserva: #521 (sol, flare).
- **Roteiro (um único zoompan 1,00→1,04 atravessando os seis clipes, sem reset):**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,2 | #514 na faixa 3:2 (crop 1224×816 em x=44 → 1080×720, y 600–1320); fundo = mesma imagem desfocada e escurecida (calibrar por imagem: print branco −55%, renders −35%) | **um print. cinco climas.** | 514 |
| 1,2–2,5 | corte seco → #517 (céu azul, três pessoas na calçada, carro no mesmo ponto) | um print. cinco climas. (até 2,5 s) · pílula: DIA | 517 |
| 2,5–3,8 | corte seco → #515 (tempestade, asfalto espelhado) | pílula: CHUVA | 515 |
| 3,8–5,1 | corte seco → #519 (céu rosado, interior aceso) | pílula: ENTARDECER | 519 |
| 5,1–6,4 | corte seco → #507 (hora azul, céu dramático) | pílula: HORA AZUL | 507 |
| 6,4–10,0 | corte seco → #511 (LED sob beiral e laje, interior com luminárias pelo vidro central, faróis acesos); apoio em 6,8 s abaixo da faixa; overlay de fechamento em 8,4 s (logo mono + pílula branca "Renderize seu projeto →"); o loop reinicia no print branco — corte de maior contraste vira gancho de novo | 6,8–8,4: mesma câmera. mesmo carro. mesma escada. · 8,4–10: **Renderize seu projeto** · pílula: NOITE | 511 |

- **CTA:** Renderize seu projeto.
- **Legenda:**

  > O cliente pergunta "e à noite?". Mesmo print do SketchUp, mesma câmera, cinco respostas.
  >
  > Dia, chuva, entardecer, hora azul e noite. Concreto, ripado, escada e o carro na rua ficam onde estavam no modelo.
  >
  > No fluxo tradicional essa pergunta custa um render inteiro de novo. Aqui é outra geração sobre o mesmo print, em minutos: sobe o print, escolhe a atmosfera, gera. Sem remodelar, sem trocar de câmera.
  >
  > Cinco versões para levar à reunião.
  >
  > Renderize seu projeto — link na bio.
  >
  > #arquitetura #render #sketchup #projetodearquitetura #archviz

- **Variante paga (SIGN_UP):**
  - A · fidelidade — primário: "'E à noite?' Mesmo print do SketchUp, cinco climas, mesma câmera. Gerado em minutos, sem remodelar." · título: "Cinco climas do mesmo print" · descrição: "Comece grátis, sem cartão".
  - B · prazo (herdada do conceito resposta-prazo) — primário: "Apresentação amanhã e o cliente quer ver de noite, de dia e na chuva? Um print, cinco climas, cada um gerado em minutos." · título: "Cinco climas antes da reunião" · descrição: "Cada render em minutos".
  - C · apresentação — primário: "Dia, entardecer e noite do mesmo projeto, na mesma reunião. Mesmo print, mesma câmera, sem remodelar." · título: "Cinco versões para a reunião" · descrição: "Cadastro grátis, sem cartão".
  - Cutdown 8,5 s: 1,0 s por clima (print 1,0 → dia → chuva → entardecer → hora azul → noite 2,5 s), headline desde o frame 0, botão do anúncio no lugar do overlay.
- **Notas de produção:** estender `reel-impacto.mjs` (ou `reel-spec.mjs` com stills + `cut`) para N "depois" com um zoompan contínuo; os seis quadros são um único pipeline 1312×816 (print 1342×833 → 1312×816 alinha sem fantasma); pílulas de clima no estilo `lbl` do kit (20 px, 500, uppercase, 0,14em, fundo rgba(10,10,10,.62), borda hairline) no canto inferior esquerdo da faixa; fundo desfocado pré-nivelado também em #515 para não ler como flash; QA em 0,5 / 2,0 / 4,5 / 7,0 s conferindo lâmina de concreto, carro inteiro e legibilidade das pílulas.
- **Riscos / gating:** nunca "a mesma imagem relit" (são cinco gerações separadas), nunca "só o clima muda" (#517 tem três pessoas; gradil varia entre tela e chapa perfurada), nunca "decidir com o cliente na hora"; "fila" é crítica ao processo, não a renderista; não descrever a interface além de "escolhe a atmosfera". Gate: autoria do modelo .skp (sem marca d'água em #514). Aviso ao dono: os eixos do SketchUp (azul vertical, tracejado vermelho) aparecem no frame 0 — são o insumo honesto, não retocar.
- **Júri:** retenção 9 (três imagens em 3 s, loop noite→print) · conversão 8 (objeção real, prova por cortes, faltava "80 nodes" — entra no card do cutdown) · marca 7 ("decidir na hora" e "mesmo carro" com #513 — ambos corrigidos) · produção 7 (#513 desalinhado — resolvido com #511, o zoompan contínuo continua sendo trabalho fora do kit).

---

### R3 · `fidelidade-tecnica/pisca-fachada-geminada` — pisca. a casa não se mexe.

- **Pilar / ângulo:** fidelidade-geometrica · corte seco alternado print/render em cadência acelerada, com marcas de registro fixas — se a geometria derivasse, o pisca denunciaria.
- **Formato / duração:** transformação de 9 s (serve como anúncio sem cortes; cutdown 6 s).
- **Por que converte:** é a prova mais barata de ler em tela pequena e sem som — o olho detecta borda que se mexe involuntariamente, então "nada se mexeu" é percebido, não lido. A cadência segura os 3 s e provoca rewatch; a copy nomeia o limite honesto (entorno muda, casa não), que é o que o cético precisa ouvir. Provavelmente o Reel mais rápido de montar do lote.
- **Decisões sobre os pareceres:** (1) **escala do render em 0,99 é obrigatória** (assets mediu s=1,010 — sem correção os cantos derivam 2,5–3 px, no limite); marca só admite escala uniforme + recorte, nunca warp — compatível. (2) **Marcas de registro em y=57,5 %, não 61 %** (medido: base da laje em 57,5 %; a 61 % a cruz ficaria solta no térreo). (3) **Fundo estático obrigatório** (#1a1a1a liso) — se o fundo desfocado piscar junto, a área que pisca vira a tela inteira. (4) **Recorte 4:3 (1080×810, y 555–1365)** em vez da faixa 16:9: casa 37 % maior, zonas seguras respeitadas. (5) Verde: marca pede nenhuma palavra verde na headline ("não se mexe" = 3 de 6 palavras); assets sugere "não" — decido **sem verde na headline e as 4 marcas de registro em #30d158 a 70 %** (marcador funcional, <5 %). (6) Fallback #445←#446 REPROVADO pelo parecer de assets (perspectiva 3/4, 2,6:1, laje muda) — trocado por candidatos em retrato #459←#460 / #457←#458 / #455←#456 (edifício de cubos) e #397←#398 (sobrados em elevação), todos sujeitos ao mesmo QA de blend.
- **Gancho:** "pisca. a casa não se mexe." aos 0,15 s sobre o print (#382): elevação frontal de dois volumes brancos envidraçados, torre de escada ripada entre eles, muro de concreto, abrigo de carro, pinheiros de biblioteca, céu branco; quatro cruzes hairline nos cantos externos dos cubos; a partir de 1,0 s a imagem pisca entre print e render (0,8 → 0,3 s).
- **Assets:** #382 `thumbs/0382-render-before.jpg` (1567×857) → #381 `thumbs/0381-render-after.jpg` (2784×1536), job b282d9b5, 2026-04-30, vega/2k, folha render-ext-10. Sem upscale (ambos downscale).
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,0 | print #382 recortado 4:3 centrado na casa (x 212–1355 de 1567, altura inteira) → 1080×810 em y 555–1365 sobre #1a1a1a liso; 4 marcas de registro (cruz hairline 24 px, #30d158 70 %) snapadas às coordenadas medidas no print (cubo esq. x=26,9 %, cubo dir. x≈71,5 %, topo y=30,5 %, base da laje y=57,5 % — recalcular após o recorte 4:3) | 0,15 s: **pisca. a casa não se mexe.** (Geist 500, ~70 px, acima da faixa, y≈485) | 382 |
| 1,0–1,8 | corte seco → render #381 (reduzido 1 % sobre o centro, alinhado pelo canto sup. esq. do cubo esquerdo); marcas paradas | idem | 381 |
| 1,8–2,4 | corte seco → print (0,6 s) | idem | 382 |
| 2,4–2,9 | corte seco → render (0,5 s) | idem | 381 |
| 2,9–3,3 | corte seco → print (0,4 s) | idem | 382 |
| 3,3–3,6 | corte seco → render (0,3 s) | idem | 381 |
| 3,6–3,9 | corte seco → print (0,3 s) — último pisca (1,67 flashes/s, abaixo de 3 Hz; não acelerar além de 0,3 s) | idem | 382 |
| 3,9–7,2 | render preso; Ken Burns 1,00→1,05 centrado entre os cubos (nunca no carro); marcas somem em 4,4 s | apoio em 4,0 s (abaixo da faixa, y≈1425): mesma câmera, mesmos vãos, mesma escada. | 381 |
| 7,2–9,0 | overlay sobre o render: scrim em camada própria + logo monocromático + pílula "Teste com um projeto real →"; sem card preto (preserva o loop) | **Teste com um projeto real** | 381 |

- **CTA:** Teste com um projeto real.
- **Legenda:**

  > Corte seco entre print e render, sem transição para esconder nada. Se a geometria mexesse, você veria.
  >
  > Dois volumes gêmeos, elevação frontal. Sete cortes secos, cada vez mais rápidos, entre o print do SketchUp e a imagem gerada. Marcas de registro nos cantos dos dois volumes — não saem do lugar.
  >
  > Vãos, muro, abrigo do carro e escada de acesso na mesma posição. O entorno muda (céu, pinheiros, piso, até o carro), porque entorno é cena. A casa é projeto.
  >
  > Fidelidade tem limite honesto: material e vegetação são lidos, não copiados. Por isso o teste que vale é no seu próprio modelo.
  >
  > Teste com um projeto real — link na bio.
  >
  > #archviz #sketchup #renderizacao #projetodearquitetura #arquitetura

- **Variante paga (SIGN_UP):**
  - A · fidelidade — primário: "Corte seco entre print e render. Se a geometria mexesse, você veria. Teste com um projeto real — sem cartão." · título: "A casa não se mexe. A luz, sim." · descrição: "Sem cartão de crédito".
  - B · prazo — primário: "Sobe o print, a elevação sai em minutos. Mesma casa, mesmos vãos." · título: "Elevação pronta em minutos" · descrição: "Cadastro grátis, sem cartão".
  - C · tradicional-vs — primário: "Sem fila de render: sobe o print, confere a geometria, apresenta." · título: "Sem fila, sem espera" · descrição: "Cadastro grátis, sem cartão".
  - Cutdown 6 s: manter 0–3,9 s (o pisca inteiro é o gancho) e entrar no CTA sobre o render aos 4,0 s com o apoio embutido no card.
- **Notas de produção:** `reel-spec.mjs`: sequência de stills com transição `cut` nativa; marcas de registro = card HTML/SVG transparente fixo em tempo global 0–4,4 s; QA de blend 50/50 OBRIGATÓRIO (tolerância 3 px em 1080; evidências em `qa-382-381/`); escurecimento não se aplica (fundo liso); Ken Burns máx. 1,05.
- **Riscos / gating:** nunca prometer entorno preservado (pinheiros, asfalto→intertravado, rochas, carro branco→preto), nem contagem de montantes na copy (4 panos/3 montantes conferem, mas o texto fala em "vãos"); a torre da escada muda de ripado preto para madeira (material, não geometria) — a legenda já cobre com "lidos, não copiados"; estrela da Mercedes na grade nos dois assets (~17 px no 4:3): sem zoom, sem menção — se o dono quiser risco zero em mídia paga, trocar o par por um dos candidatos em retrato após QA. Nenhum número, nenhum horário (a variação "9h/9h07" foi cortada).
- **Júri:** retenção 9 · conversão 8 (faltava "80 nodes" — o card do cutdown resolve) · marca 6 (tempo inventado e 3 palavras em verde — ambos corrigidos; reavaliaria como 8) · produção 9.

---

### R4 · `tradicional-vs/entre-duas-reunioes` — entre duas reuniões

- **Pilar / ângulo:** tradicional-vs-spacenode (sub-ângulo produtividade) · o render que cabe entre a reunião da manhã e a da tarde. O alvo é a fila, nunca quem renderiza.
- **Formato / duração:** transformação de 11 s (cutdown 8,5 s).
- **Por que converte:** gancho visual (print cinza-escuro vira cozinha editorial em 2 s) e uma frase que qualquer escritório pequeno reconhece. "Comece agora" leva ao cadastro grátis (80 nodes = 4 gerações Vega 2K, o suficiente para o projeto que está na mesa hoje); a assinatura vem quando a cadência de reunião se repete (Starter cobre ~37 gerações Vega 2K/mês).
- **Decisões sobre os pareceres:** (1) O júri de produção errou o "zero código novo": `reel-impacto.mjs` trava a faixa entre 4:3 e 16:9 — o caminho é **`reel-spec.mjs` + `fit:'contain'`** (containGeometry(0,8696) = 1080×1242 @ y=339, exatamente o quadro do conceito). (2) Pré-recortar #426 para 728×837 para os dois stills caírem no mesmo 1080×1242 (senão a régua tem um degrau de 3–6 px). (3) Direção do wipe: marca sugeriu fio vertical (wipeleft) como no comparador da landing; assets confirmou que o wipedown revela teto → lustre acende → ilha. **Fico com o wipedown** — a ordem de revelação é a narrativa (o lustre acende) — com dur 0,45 s para a régua passar ~0,3 s sobre a imagem. (4) Texto: o "terço central" do conceito é a prova (lustre, ilha); hook no teto liso (hook-fixed top≈400), apoio no piso (bottom≈360), scrim do hook-fixed reduzido para ~420 px para não escurecer a ilha.
- **Gancho:** "reunião de manhã: o print." em corte no frame 0 sobre o print #426 (armários pretos foscos, backsplash de mármore preto, ilha de pedra com veios, lustre espiral de cobre apagado, duas cadeiras bege, flores rosa, cortina cinza, piso cinza com a grade amarela do SketchUp), retrato inteiro em 1080×1242 sobre a própria imagem desfocada. Aos 1,5 s a régua desce e a cozinha acende.
- **Assets:** #426 `thumbs/0426-render-before.jpg` (731×837, `_input.jpg` do job) → #425 `thumbs/0425-render-after.jpg` (960×1104), job 9b53068f, 2026-04-28, Cozinha, vega/2k, "Clara e Natural"; folha render-int-10. Landmarks (anéis do lustre, quina da ilha) desviam <2 %.
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,5 | #426 (pré-recortado 728×837) em `contain` 1080×1242 @ y339; Ken Burns 1,00→1,03; fundo = a própria imagem desfocada e escurecida (calibrar: print cinza médio, render escuro) | **reunião de manhã: o print.** (hook-fixed, top≈400, 2 linhas 60–64 px sobre o teto liso, Geist 500) | 426 |
| 1,5–1,95 | xfade wipedown 0,45 s com `ruler:true` (régua branca 1080×6 varre o quadro inteiro); texto some no corte em 1,5 s | — | 426, 425 |
| 1,95–6,0 | #425 inteiro; Ken Burns 1,03→1,08 para a ilha e o lustre aceso | 1,95 s: **reunião da tarde: a imagem.** · 3,0 s (apoio no piso, bottom≈360): sem fila. mesmo print, mesma câmera, minutos. | 425 |
| 6,0–8,5 | zoom lento até 1,12 no máximo (fonte 960 px) | idem | 425 |
| 8,5–11,0 | card final do kit (#1a1a1a): logo monocromático + pílula "Comece agora →" + "80 nodes grátis · sem cartão · em português"; `url: ""` | — | — |

- **CTA:** Comece agora.
- **Legenda:**

  > Mesmo projeto, mesma câmera. O que separa a reunião da manhã da reunião da tarde não é uma semana de fila.
  >
  > Render externo, em geral, atravessa a semana: briefing, fila, ajuste, entrega. Não é culpa de quem renderiza — é o tamanho da fila.
  >
  > Aqui o fluxo é outro: sobe o print do SketchUp, escolhe o ambiente, gera. A imagem sai em minutos e a geometria continua a sua — bancada, lustre, cortina, tudo onde você modelou.
  >
  > Esta cozinha é geração real na plataforma, do print à imagem.
  >
  > Comece agora — cadastro grátis, sem cartão. Link na bio.
  >
  > #arquitetura #renderizacao #sketchup #designdeinteriores #archviz

- **Variante paga (SIGN_UP):**
  - A · prazo — primário: "Reunião de manhã com o print, reunião da tarde com a imagem. Do print do seu SketchUp, gerado em minutos. Render externo, em geral, atravessa a semana. Aqui a geometria continua a sua e a imagem sai em minutos. Cadastro grátis, sem cartão." · título: "O render entre duas reuniões" · descrição: "Cadastro grátis, sem cartão".
  - B · fidelidade — primário: "o print entra, a imagem sai — bancada, lustre e cortina onde você modelou. geometria e câmera continuam as suas. gerado em minutos. cadastro grátis, sem cartão." · título: "geometria como verdade." · descrição: "Cadastro grátis, sem cartão".
  - C · apresentação — primário: "a reunião da tarde com a imagem, não com o print. mesmo projeto, mesma câmera, gerado em minutos. cadastro grátis, sem cartão." · título: "apresente com a imagem, não o print" · descrição: "Cadastro grátis, sem cartão".
  - Cutdown 8,5 s: cortar a cena 6,0–8,5 s e entrar no card aos 6 s.
- **Notas de produção:** `reel-spec.mjs`; segmentos still com `fit:'contain'`; cards `hook-fixed` com `scrim:true` e `css` sobrescrevendo a altura do scrim inferior (~420 px); Geist 500 hook / 400 apoio; #426 sobe 1,52× efetivo (macio, aceitável como print — não afiar), #425 1,26× (nítido); QA em 0,5 / 1,7 / 3,5 / 7,0 s.
- **Riscos / gating:** sem horário (nem "10h/14h", nem "antes da próxima reunião" — só "em minutos"); "sem fila" descreve o nosso fluxo; não prometer que toda geração sai pronta na primeira; render reinterpretou a cortina (cinza→taupe) e os montantes da porta sumiram atrás do voile — "onde você modelou" (posição) se sustenta, "como você modelou" não; fornos com "comida" iluminada dentro (curiosidade, não defeito). Número de mercado (R$150–600 por imagem) fica fora de toda copy até ter fonte registrada. Gate: confirmar que #426 saiu do SketchUp (senão "print do modelo" e #visualizacaoarquitetonica no lugar de #sketchup). Anti-repetição: mesmo par de R7 — ≥19 dias e pilar diferente.
- **Júri:** retenção 7 (sem device de rewatch, card final quebra o loop — aceito: peça de funil, não de alcance) · conversão 8 · marca 8 · produção 9 (corrigida para "kit puro via reel-spec", não via reel-impacto).

---

### R5 · `editar-ferramenta/2026-09-04-reel-editar-so-o-piso` — trocou o piso. não o render.

- **Pilar / ângulo:** demonstracao-de-ferramentas · Editar → Trocar material. Mudança pós-aprovação sem voltar para a fila do render.
- **Formato / duração:** transformação de 10,2 s (cutdown 7,2 s).
- **Por que converte:** gancho por reconhecimento (pedido de mudança depois da aprovação), payoff é uma capacidade concreta, e o recorte empilhado prova fidelidade (sombra da persiana e tapete) para o público cético. Quem chega pelo Editar já renderiza e está no meio de um projeto com cliente — o perfil que consome nodes mês a mês.
- **Decisões sobre os pareceres:** (1) **URL no card final sai** (violação direta; exige o patch de 1 linha no kit). (2) **Alternativa B #68→#798 sai** — os dois pareceres provaram que #798 foi edição sem máscara que regenerou cama, abajures, persiana e removeu o tapete; não existe copy honesta. (3) **Legenda deixa de narrar um cliente que não existiu** (#760 foi teste do próprio dono) e vira situação condicional — o hook situacional fica. (4) Headline paga muda para "Só o piso mudou." (o post de 18/08 já usou "Troque o piso. Não o projeto."). (5) Recorte **4:3 (crop=1706:1280:811:0 → 1080×810)** em vez da faixa 16:9 pequena; persiana continua no quadro (~18 %). (6) "referência de material" (rótulo real da UI, `components/edit-v3/EditV3Flow.tsx:64`) — verificado, pode ficar na legenda.
- **Gancho:** eyebrow "EDITAR · TROCAR MATERIAL" (uppercase 0,22em, ladeado por fios) + "cliente pediu o piso em madeira." sobre o render aprovado da suíte (#75): marcenaria grafite, cama baixa branca com abajur duplo, tapete cru, piso de concreto e a persiana à direita riscando o piso com listras de sol. Aos 1,5 s a régua troca o piso.
- **Assets:** #75 `thumbs/0075-render-after.jpg` (render 74861bb6, 2026-06-04, vega/2k, 3328×1280; original `assets/0075-render-after.jpg`) → #760 `thumbs/0760-edit-after.jpg` (edição 4621f00e, 2026-06-10, prompt real "trocar piso por piso de madeira conforme textura de referência", máscara 12,6 %; original `assets/0760-edit-after.png`, 3328×1280). Diff fora da máscara: YAVG 0,025/255 — pixel-idêntico acima do piso. Não usar #758 (gêmeo).
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,5 | #75 recortado 4:3 (crop=1706:1280:811:0) → 1080×810 centrado sobre a própria imagem desfocada e escurecida; parado; scrim próprio | EDITAR · TROCAR MATERIAL / **cliente pediu o piso em madeira.** | 75 |
| 1,5–2,0 | xfade wipeleft 0,5 s com régua branca; mesmas coordenadas de crop em #760 (wipe pixel-alinhado); texto some no corte | — | 75, 760 |
| 2,0–5,6 | #760: tábuas de madeira clara em perspectiva correta, listras da persiana projetadas na madeira, tapete/cama/abajur/marcenaria idênticos; Ken Burns 1,00→1,04 | só o piso mudou. / sem regenerar o {ambiente}. (verde só em "ambiente") | 760 |
| 5,6–6,0 | fade 0,4 s para o recorte | — | 760 |
| 6,0–8,8 | still empilhado: em cima #75, embaixo #760, mesmo recorte crop=1270:470:2050:800 (exclui o canto branco da cama), fio branco 4 px entre eles (aspecto 1,345); Ken Burns sincronizado 1,00→1,03 | mesma sombra, mesmo tapete, mesma {câmera}. (verde só em "câmera") | 75, 760 |
| 8,8–9,0 | corte seco | — | 760 |
| 9,0–10,2 | card final do kit (#1a1a1a): logo mono + pílula "Veja no seu próprio projeto →" + microcopy; `url: ""` | — | — |

- **CTA:** Veja no seu próprio projeto.
- **Legenda:**

  > Quando o cliente pede o piso em madeira depois do render aprovado, ninguém precisa regenerar o ambiente.
  >
  > Editar, Trocar material: você contorna o piso, escreve o material (ou anexa uma referência de material) e a plataforma refaz só aquela área. Câmera, luz, tapete e a sombra da persiana ficam onde estavam.
  >
  > É a diferença entre "volta pro render" e "resolvo antes da próxima reunião". O mesmo vale para parede, bancada ou marcenaria.
  >
  > Antes e depois são a mesma imagem, gerada e editada aqui.
  >
  > Veja no seu próprio projeto — link na bio.
  >
  > #arquitetura #designdeinteriores #renderizacao #archviz #projetodearquitetura

- **Variante paga (SIGN_UP, título "Só o piso mudou.", descrição "Cadastro grátis, sem cartão" nas três):**
  - A · situação — primário: "O cliente pediu o piso em madeira depois do render aprovado. Você troca o piso, não o render. Editar: contorne a área, descreva o material, pronto em minutos. Cadastro grátis, sem cartão."
  - B · fidelidade — primário: "Sombra da persiana, tapete e câmera no lugar. Só o piso mudou. Editar: contorne a área, descreva o material. Cadastro grátis, sem cartão."
  - C · prazo — primário: "Mudança depois da aprovação, sem voltar pra fila do render. Editar: contorne o piso, descreva o material, pronto em minutos. Cadastro grátis, sem cartão."
  - Cutdown 7,2 s: cortar as cenas 4–5 (recorte empilhado) e ir do #760 ao card; legenda embutida = hook + "só o piso mudou."; A/B só variando o hook sobre o MESMO par.
- **Notas de produção:** `reel-spec.mjs` (stills 4:3 pré-recortados com ffmpeg, wipe com `ruler:true`, still do recorte empilhado montado com ffmpeg `vstack` + fio); QA no `--plan`/frames conferindo a persiana no quadro; eyebrow no estilo do kit; não citar motor nem provider (o asset é do editor v1; o V3 atual recompõe com máscara — `lib/edit-v3/pipeline.ts` recomposeMasked — então "refaz só aquela área" vale no produto vigente).
- **Riscos / gating:** não prometer que a máscara nunca vaza; não "em segundos", não "preserva 100 %", não custo em nodes por edição; não prometer reprodução exata da textura de referência. Gate: confirmar que a suíte (input #76, hidden-line na conta do dono) não é projeto de cliente sem `permission_status = granted`.
- **Júri:** retenção 7 (faixa 16:9 pequena — resolvido com 4:3) · conversão 8 · marca 7 (URL na arte e lista de materiais — corrigidos) · produção 9.

---

### R6 · `alcance-organico/banheiro-conta-o-que-saiu-do-lugar` — conte o que saiu do lugar (ex-"lavabo")

- **Pilar / ângulo:** fidelidade-geometrica · alcance orgânico com mecânica de reassistir: a instrução pede para contar o que saiu do lugar enquanto o print ainda está escuro; a resposta ("nada.") chega no fim e obriga a segunda visualização.
- **Formato / duração:** transformação de 9,5 s (já ≤15 s; ajuste de hold para anúncio).
- **Por que converte:** o público é o cético técnico. A mecânica faz ele procurar erro e encontrar geometria no lugar; a legenda entrega a única mudança real antes que ele aponte — confiança que se compartilha entre colegas. "Veja no seu próprio projeto" converte a dúvida em teste no próprio banheiro (ambiente pequeno que rende bem em Vega 2K).
- **Decisão — reconstrução:** o parecer de marca REFUTOU (0,85) porque a "única mudança admitida" da legenda era falsa (as "lajotas sobre seixos" já estavam no print; os "tapetes ovais" nunca existiram) e "lavabo" está errado (há ducha e chuveiro de teto → banheiro). O parecer de assets não refutou, mas listou 2–3 flagras reais em #475 (nicho→barra de ducha, parede direita revestida, piso→madeira, sanca) que "nada." não sobrevive, e ofereceu #473. **Decisão: manter o conceito com o par #474→#473.** #474 é byte-idêntico a #476 (mesmo print), #473 é mesma câmera e sessão, e preserva nicho, piso cinza, parede direita lisa, pedras sobre seixos e as gotas do chuveiro; a única adição é a sanca. Com isso "nada." fica quase literal e a admissão da legenda é uma só. O que a refutação de marca pedia (reescrever §3, abertura e risks) está feito abaixo; a nota 8,5 de marca deixa de se apoiar em fato errado. Custa uma re-QA de blend #474/#473 (o parecer de assets já conferiu alinhamento) — vai em `qa475/` ao lado das evidências existentes.
- **Gancho:** "conte o que saiu do lugar." (Geist 500) sobre o print #474 quase preto: bacia suspensa branca à esquerda, coluna de ducha e misturador na parede esquerda, nicho vertical, chuveiro de teto com gotas modeladas, porta de vidro de piso a teto ao centro com jardim vertical (painel de bambu, trepadeira florida, bananeira, samambaia), duas lajotas irregulares de pedra escura sobre uma faixa de seixos em frente à esquadria, piso de porcelanato escuro à frente. Headline na faixa de revestimento acima da esquadria (canvas y≈400–590, cinza uniforme).
- **Assets:** #474 `thumbs/0474-render-before.jpg` (print, 669×856, md5 = #476/#478/#480) → #473 `thumbs/0473-render-after.jpg` (912×1168, id 8ef2b96f, 2026-04-28, vega/2k). Reserva: #475 (vapor/vidro molhado) só se o dono exigir — aí a legenda admite sanca, nicho→barra, piso→madeira e revestimento da parede direita. Nunca #477/#479 (viraram quarto).
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,5 | print #474 escalado para exatamente 912×1168 (lanczos + unsharp ≈0,3 só neste ramo) → 1080×1383 centrado (proporção 0,78 — não é 3:4, não cropar), faixas #1a1a1a de 268 px; zoompan 1,00→1,03 (máx. 1,05 no ramo do print); os 51 px inferiores da imagem caem na zona insegura — nada de texto ali | **conte o que saiu do lugar.** (em corte no frame 0, scrim próprio) | 474 |
| 1,5–4,5 | xfade wipedown 3,0 s linear #474→#473 com hairline branca 2 px na borda (ajuste no kit: a régua nativa só existe em wipeleft/right); ordem de revelação: sanca → gotas do chuveiro e flores → bananeira/samambaia → pedras sobre seixos → piso cinza; zoompan em sincronia nos dois ramos; headline fica até 2,5 s sobre scrim próprio (o wipe cruza a faixa em 1,8–2,2 s) e sai em corte | conte o que saiu do lugar. (até 2,5 s) | 474, 473 |
| 4,5–7,8 | #473 inteiro, zoompan 1,06→1,08 para o jardim iluminado; em 5,0 s entra a resposta na MESMA faixa acima da esquadria, scrim suave em camada própria — nunca sobre o jardim | nada. mesma câmera, mesma esquadria. | 473 |
| 7,8–9,5 | overlay de fechamento sobre o render (fade 0,3 s): logo monocromático pequeno (y≈1400) + pílula branca "Veja no seu próprio projeto →" (y≈1480–1540, sobre o piso cinza-escuro); apoio some em 7,8 s; o loop reinicia no print com a pergunta | **Veja no seu próprio projeto** | 473 |

- **CTA:** Veja no seu próprio projeto.
- **Legenda:**

  > Banheiro com jardim vertical. Antes de ver o depois, marque a posição da bacia, da ducha e da esquadria.
  >
  > Bacia suspensa, ducha, nicho, esquadria e jardim: mesma posição, mesma câmera. O print saiu escuro do modelo; a imagem de apresentação voltou com a sanca acesa e o jardim iluminado por baixo.
  >
  > Régua na mão: as lajotas sobre os seixos, o piso e o nicho já estavam no modelo e ficaram onde estavam. Até as gotas do chuveiro de teto que estavam no modelo ficaram. A única coisa que não estava lá é a sanca no forro.
  >
  > Gerado em minutos, a partir do print que você já tem.
  >
  > Veja no seu próprio projeto — cadastro grátis, sem cartão, no link da bio.
  >
  > #arquitetura #archviz #sketchup #designdeinteriores #visualizacaoarquitetonica

- **Variante paga (SIGN_UP, descrição "Cadastro grátis, sem cartão" nas três):**
  - A · fidelidade — primário: "Envie o print do seu modelo e confira: bacia, ducha, esquadria e jardim no mesmo lugar. Cadastro grátis, sem cartão." · título: "Geometria do seu modelo, no lugar."
  - B · prazo — primário: "Do print escuro à imagem de apresentação em minutos. Bacia, ducha e esquadria onde você modelou." · título: "Do print à imagem, em minutos".
  - C · apresentação — primário: "O jardim vertical que o cliente não enxergava no print, iluminado — no mesmo lugar do modelo." · título: "O cliente vê o que você projetou".
  - Ajuste para anúncio: hold do "nada." em 1,2 s, overlay de CTA em 6,5 s → 8,5 s total, headline desde o frame 0, CTA da arte substituído pelo botão.
- **Notas de produção:** ffmpeg puro + cards Playwright; textos trocam em corte, nunca no wipe; scrim em camada separada; QA obrigatório: blend 50/50 #474×#473 a 912×1168 + 4 frames (0,5 / 3,0 / 5,5 / 8,5 s) conferindo legibilidade da headline sobre o print quase preto e da resposta sobre o revestimento (no #473 a faixa fica tostada pela sanca). Fechamento como overlay, sem card preto (preserva o loop); se o dono exigir card final, +1,0 s depois do overlay.
- **Riscos / gating:** nunca "lavabo", nunca o rótulo do banco "Suíte Master", nunca "exaustor" (é chuveiro de teto); não prometer "nada mudou" nem "material preservado" — dizer "nada saiu do lugar"; a sanca é adição; artefato menor: triângulo claro no topo da folha direita do vidro (~25×30 px em 912) — invisível no feed. Gate: confirmar SketchUp como origem do print (senão "do modelo", já usado na legenda) e autoria do modelo.
- **Júri (notas dadas ao conceito original, com #475 e "lavabo"):** retenção 9 (mecânica de contar + loop no print) · conversão 7 (enigma sobre print quase preto) · marca 8,5 (baseada no fato errado — refeita) · produção 9 (upscale "mínimo" também estava errado: o print é 669 px, 1,61×).

---

### R7 · `fidelidade-tecnica/zoom-cozinha-cada-peca` — forno, cafeteira, torneira: mesma posição

- **Pilar / ângulo:** fidelidade-geometrica · prova objeto a objeto: quatro marcadores cravados no print caem sobre as mesmas peças no render; depois print e render empilhados no mesmo recorte e mesmo zoom.
- **Formato / duração:** transformação de 12 s (cutdown 10 s).
- **Por que converte:** fala com quem faz interiores (o público mais próximo do arquiteto de escritório pequeno) e com a dor específica de render genérico trocar eletros, luminárias e torneiras de lugar. Os marcadores tornam a prova objeto a objeto; o split empilhado responde a "mas no detalhe deve derivar". "Comece grátis" fecha sem atrito.
- **Decisões sobre os pareceres:** (1) Marcador do forno desce para y≈45–46 % (medido). (2) Split empilhado via `splitGeometry()` do kit (2×520 px + gap 8, largura 877) com recorte alargado para x 0–58 % e push ≤1,04 — as metades de ~640 px do conceito somam mais que a banda e borram a cafeteira. (3) Verde em UMA palavra ("posição") — não "Mesma posição". (4) Eyebrow do split = MODELO / RENDER (0,18em, padrão da landing). (5) Legenda §3 lista só o que o recorte mostra (o trilho de spots fica fora dele). (6) Print estático nos primeiros 1,2 s (1,48× de upscale; sem Ken Burns; nunca passar pelo Ampliar — alteraria o "antes").
- **Gancho:** "forno, cafeteira, torneira. mesma posição." no topo da banda sobre o forro, com 4 marcadores circulares hairline (⌀40 px, branco 70 %) entrando em cascata de 0,15 s sobre forno, cafeteira, torneira e lustre no print #426 (guias amarelas do SketchUp ainda no piso). Aos 1,2 s corte seco para o render — cada marcador continua em cima da sua peça.
- **Assets:** #426 `thumbs/0426-render-before.jpg` → #425 `thumbs/0425-render-after.jpg` (mesmo par de R4; blend ≤4 px em `qa_cozinha/blend50.jpg`; marcadores conferidos em `qa_cozinha/marker_tiles.jpg`). Único par de cozinha em retrato do acervo.
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,2 | print #426 em banda `contain` 1080×1242 @ y339 sobre #1a1a1a (ou a própria imagem desfocada — padrão do kit); estático; marcadores em cascata: forno (x≈5 %, y≈45,5 %), cafeteira (13 %, 56 %), torneira (37 %, 56 %), lustre (46 %, 33 %); scrim 30 % só atrás da headline | **forno, cafeteira, torneira. mesma {posição}.** | 426 |
| 1,2–4,0 | corte seco → #425, mesma banda; marcadores presos sobre forno duplo, cafeteira, torneira preta, lustre aceso; apoio em 1,6 s na base (sobre o piso, scrim 30 %) | idem + o que você modelou, onde você modelou. | 425 |
| 4,0–4,5 | marcadores somem em 0,3 s; corte para o split | idem | 425 |
| 4,5–8,0 | split empilhado do kit: em cima recorte do PRINT, embaixo o mesmo recorte do RENDER (forno + cafeteira + backsplash + torneira: x 0–58 %, y 38–62 %), 2×520 px, gap 8, hairline; push sincronizado 1,00→1,04; eyebrows MODELO / RENDER; headline sai em 5,0 s | o que você modelou, onde você modelou. | 426, 425 |
| 8,0–9,8 | render completo; Ken Burns 1,00→1,04 no lustre e na ilha; apoio sai em 9,0 s | idem | 425 |
| 9,8–12,0 | scrim + pílula "Comece grátis →" + wordmark monocromático (overlay sobre o render; sem card preto) | **Comece grátis** | 425 |

- **CTA:** Comece grátis.
- **Legenda:**

  > O print já tinha forno, cafeteira e torneira. A imagem manteve cada um no lugar onde você colocou.
  >
  > Cozinha com ilha, print do SketchUp com as guias amarelas ainda no piso. Marcamos quatro pontos no print — forno, cafeteira, torneira, lustre — e seguramos as marcas sobre o render. Cada uma cai em cima da peça.
  >
  > Depois, print e render empilhados no mesmo recorte, mesmo zoom: backsplash de mármore, coifa, forno duplo. O que você especificou aparece com luz e material de verdade, no lugar que você especificou.
  >
  > Não é redesenho do ambiente; é a apresentação do seu projeto, gerada em minutos.
  >
  > Comece grátis — link na bio.
  >
  > #designdeinteriores #sketchup #render #archviz #apresentacaodeprojeto

- **Variante paga (SIGN_UP):**
  - A · fidelidade — primário: "forno, cafeteira, torneira: cada uma continua onde você colocou. render em minutos." · título: "seu modelo, iluminado. não redesenhado." · descrição: "Cadastro grátis".
  - B · prazo — primário: "cozinha modelada de manhã, imagem de apresentação em minutos. forno, cafeteira e torneira no lugar." · título: "Apresente a cozinha hoje" · descrição: "Cadastro grátis, sem cartão".
  - C · apresentação — primário: "O cliente vê a cozinha dele. Você vê o seu projeto respeitado." · título: "Imagem que o cliente entende" · descrição: "Cadastro grátis, sem cartão".
  - Cutdown 10 s: manter 0–4,0 s e o split 4,5–8,0 s; cortar o Ken Burns final e entrar no CTA aos 8,0 s.
- **Notas de produção:** `reel-spec.mjs` com `band: {split: true}` para o trecho empilhado (PNGs pré-recortados dos dois originais com as MESMAS coordenadas) e `contain` nos demais; marcadores em card SVG transparente (círculo hairline 2 px, sem preenchimento, sem glow); upscale 1,12× no render e 1,48× no print; QA nos frames 0,6 / 1,4 / 6,0 / 10,5 s.
- **Riscos / gating:** não prometer que iluminação/forro sejam do modelo (forro clareado, spots e lustre acesos, luz de janela, fita de LED sob armários, sanca junto à cortina, dois vasos extras — tudo interpretação); "não é redesenho" só sobre esta imagem; o print já era texturizado — não vender como "do clay ao render". Gate: SketchUp como origem (#sketchup) e autoria do modelo. Anti-repetição: mesmo par de R4 — publicar ≥19 dias depois, pilar diferente.
- **Júri:** retenção 8 · conversão 7 (só "Cadastro grátis" — a variação B/C traz "sem cartão") · marca 8 (verde em duas palavras e "antes do almoço" — corrigidos) · produção 8.

---

### R8 · `serie-formato/serie-tres-antes-das-14h-ep01-sala-de-jantar` — três antes das 14h · ep. 01

- **Pilar / ângulo:** produtividade · um print, três leituras de acabamento do mesmo ambiente, mesma câmera, numeradas 01/02/03. A promessa é operacional: chegar na reunião com opção em vez de promessa.
- **Formato / duração:** série, 11,5 s (cutdown pago 9,5 s).
- **Por que converte:** dor concreta e datada ("reunião às 14h"); o print no início prova que as três opções saíram do mesmo modelo. Três gerações Vega 2K (60 nodes) cabem inteiras nos 80 grátis — o primeiro projeto de qualquer pessoa reproduz o episódio de graça; o segundo projeto da semana seguinte pede o Starter.
- **Decisões sobre os pareceres:** (1) **Claim "mesmas cadeiras, mesmo pendente" sai** (os dois pareceres provaram: pendentes são três luminárias diferentes; cadeiras de #435 mudam estofado e pés) → "mesma câmera, mesma geometria". (2) **Promessa "toda segunda" sai** até os episódios estarem pré-produzidos; a série fica como formato recorrente sem cadência prometida. (3) Ep. 04 e Ep. 05 saem da série (partem de render/Editar, não de print — Ep. 05 é o R5 deste slate); Ep. 02 (loja #404→#403/#405/#411, paisagem 1,66:1) e Ep. 03 (living #309→#318/#308/#303, quase quadrado) seguem válidos com a assinatura redefinida como "imagem inteira centrada, altura variável, textos calculados a partir da caixa da imagem". (4) Legibilidade: imagem sobe para y 220–1441 e apoio+CTA vão para a faixa sólida abaixo (y≈1470–1590), sem scrim sobre o mármore; rótulos 01/02/03 como etiquetas com fundo #1a1a1a 80 %. (5) Nota interna sobre #433 corrigida: exclui-se porque troca cadeiras/flores e vem em outro tamanho, não por "pedido" que não está no banco.
- **Gancho:** eyebrow "TRÊS ANTES DAS 14H · EP. 01" + "reunião às 14h. três acabamentos." sobre o print #430 (teto cinza com rebaixo, cortinas achatadas, mesa oval preta de base listrada, oito cadeiras em malha wireframe, piso com grade, flores rosas). Aos 1,4 s a régua atravessa e a sala vira a opção 01; aos 3,6 s corte seco para a 02. Print + duas opções em 3,6 s.
- **Assets:** #430 `thumbs/0430-render-before.jpg` (print 739×835, sha256 = #428/#432/#434/#436) → #429 `thumbs/0429-render-after.jpg` (01 · sanca quente, "Natural Suave"), #431 `thumbs/0431-render-after.jpg` (02 · cimento queimado), #435 `thumbs/0435-render-after.jpg` (03 · mármore polido, "Clara e Natural" — a mais luminosa). Todos 976×1104, 2026-04-28, vega/2k. Excluir #433 e #427.
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,4 | print #430 reescalado para 1080×1221 em y 220–1441 sobre #1a1a1a; sem movimento; eyebrow (uppercase 0,22em com fios) sobre o teto cinza uniforme (y≈250) + headline sobre scrim próprio | TRÊS ANTES DAS 14H · EP. 01 / **reunião às 14h. três acabamentos.** | 430 |
| 1,4–1,7 | xfade wipeleft 0,3 s com régua → #429 (mesmo 1080×1221, setsar=1; blend a 50 % alinha pendentes, mesa e cadeiras ao pixel); headline e eyebrow saem em corte | etiqueta: 01 · sanca quente | 430, 429 |
| 1,7–3,6 | hold #429 (sanca LED quente, cortinas bege, mesa de nogueira posta, tapete geométrico) | 01 · sanca quente | 429 |
| 3,6–5,5 | corte seco → #431 (cimento queimado, piso preto, pendentes dourados, jardim pela porta) | 02 · cimento queimado | 431 |
| 5,5–7,4 | corte seco → #435 (mármore branco polido, mesa escura de veio forte, louça preta) | 03 · mármore polido | 435 |
| 7,4–8,6 | recap em cortes secos 3×0,4 s: #429 → #431 → #435, etiquetas acompanhando | 01 · 02 · 03 | 429, 431, 435 |
| 8,6–10,0 | hold #435; apoio + CTA na faixa sólida abaixo da imagem (y≈1470–1590), sem scrim | mesmo print. gerado em {minutos}. / **Comece agora** / etiqueta 03 | 435 |
| 10,0–11,5 | card final do kit (#1a1a1a): logo mono + pílula "Comece agora →" + microcopy; `url: ""` | — | — |

- **CTA:** Comece agora.
- **Legenda:**

  > O cliente pediu três acabamentos para a reunião das 14h. Mesmo print, mesma câmera, gerado em minutos.
  >
  > Ep. 01 da série Três antes das 14h. A regra: um print do SketchUp, três leituras de acabamento, mesma câmera, mesma geometria.
  >
  > 01 sanca quente e cortina bege. 02 cimento queimado e piso escuro. 03 mármore polido e mesa de madeira escura. Nenhuma delas exigiu voltar ao modelo.
  >
  > Um ambiente novo em três acabamentos, para a reunião da semana ter opção em vez de promessa.
  >
  > Comece agora — link na bio.
  >
  > #designdeinteriores #apresentacaodeprojeto #render #arquitetura #archviz

- **Variante paga (SIGN_UP):**
  - A · prazo — primário: "Reunião às 14h, três acabamentos da mesma sala. Um print, três opções, gerado em minutos." · título: "três acabamentos antes da reunião." · descrição: "mesmo print, mesma câmera.".
  - B · fidelidade — primário: "Mesma câmera, mesma geometria, três acabamentos. Um print, gerado em minutos." · título: "três acabamentos antes da reunião." · descrição: "Cadastro grátis, sem cartão".
  - C · apresentação — primário: "O cliente pediu opções. Três leituras da mesma sala, do mesmo print, gerado em minutos." · título: "Três leituras da mesma sala" · descrição: "Cadastro grátis, sem cartão".
  - Cutdown 9,5 s: sem recap, holds de 1,5 s, apoio+CTA já sobre a opção 03 aos 5,5 s; sem eyebrow de episódio; etiquetas 01/02/03 ficam (legenda embutida). Público: interiores/reforma.
- **Notas de produção:** mesmo `reel-serie` de R2 (N "depois", um wipe, cortes secos, recap por concat com setsar=1); etiquetas no estilo `lbl` do kit; QA em 1,0 / 2,5 / 6,5 / 9,0 s (legibilidade do apoio na faixa sólida, alinhamento print→01 na régua).
- **Riscos / gating:** não dizer que "o arquiteto pediu" (campo vazio no banco), nem tempo total; "reunião às 14h" é dispositivo narrativo; pisos e tapete mudam entre as opções (o tapete some em 02 e 03) — nunca "só trocar o acabamento"; não atribuir a luminosidade da 03 ao mármore (é o preset de luz); não usar o rótulo "Quarto" do banco no Ep. 02 (#403). Gate: SketchUp como origem de #430; autoria do modelo. Anti-repetição: mesmo ângulo de produtividade de R4 — ≥3 semanas.
- **Júri:** retenção 7 · conversão 7 (oferta ausente na descrição — B/C resolvem) · marca 7 ("reunião às 14h" como dispositivo; claim de pendente — corrigido) · produção 9.

---

### R9 · `alcance-organico/print-render-video-piscina` — print, render, vídeo

- **Pilar / ângulo:** demonstracao-de-ferramentas · encadeamento honesto de dois módulos no mesmo projeto: o print vira imagem (régua com "passo atrás" sobre as três espreguiçadeiras) e a imagem vira o take do Animar em que a água se mexe.
- **Formato / duração:** transformação de 12 s (cutdown 9 s).
- **Por que converte:** movimento real é o maior scroll-stop do feed de arquitetura, e aqui é produto, não motion graphics. A peça mostra em 12 s o pacote que a assinatura compra (imagem para o cliente + take para a apresentação/story) sobre o print que o arquiteto já tem. É a única peça do lote com apelo direto ao story do escritório. Única peça com Animar.
- **Decisões sobre os pareceres:** (1) Dimensões corrigidas: #396 é 733×867 (não 944×1120) → **caixa única 1080×1283 com scale-to-fill** para os três assets. (2) **O clipe não faz push-in — faz tilt-up** (medido: casa desce ~8 % do quadro, céu cresce) → toda a copy diz "a câmera sobe devagar". (3) Corte still→vídeo invisível exige #395 parado em 1,00 de 3,6 a 5,6 s (sem zoompan) — o frame 0 do clipe é o próprio render (SSIM 0,95). (4) Passo atrás 78 % → 40 % → 100 % (55 % só cobria duas espreguiçadeiras). (5) Apoio sai no corte (5,6 s) — a grama desliza para fora com o tilt. (6) Fechamento no céu chapado do topo da caixa (canvas y≈320–615), sem scrim — o tilt-up entrega isso de graça.
- **Gancho:** "um print. uma imagem. um vídeo." sobre o print #396 (céu azul chapado, casa em L de dois pavimentos, piscina lisa, deck com três espreguiçadeiras pretas, escada de inox, balizadores, grama com pedras).
- **Assets:** #396 `thumbs/0396-render-before.jpg` (733×867) → #395 `thumbs/0395-render-after.jpg` (944×1120), job 61866b0a, 2026-04-29, vega/2k; #170 `thumbs/0170-video-video_src.jpg` (= #395 byte a byte, md5 2123010185…); #169 `thumbs/0169-video-video_out.jpg` — vídeo `assets/0169-video-video_out.mp4` (1320×1568, 24 fps, 5,04 s, Kling 2.5 Turbo Pro, 2026-05-22). Cadeia print→render→vídeo provada.
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,2 | #396 (1,47× lanczos, fill 1080×1283, faixas #1a1a1a ~318 px); zoompan 1,00→1,02 | **um print. uma imagem. um vídeo.** (em corte no frame 0) | 396 |
| 1,2–3,6 | régua horizontal com passo atrás (render como overlay com crop de largura animado por expressão, imagens paradas, hairline 2 px): 0→78 % (1,2–2,4 s), recua para 40 % (2,4–2,9 s) — o dedo confere as três espreguiçadeiras: plástico preto vira fibra, mesma posição —, completa até 100 % (2,9–3,6 s); headline sai em corte em 4,0 s | um print. uma imagem. um vídeo. (até 4,0 s) | 396, 395 |
| 3,6–5,6 | #395 parado em 1,00 (sem zoompan); apoio em 4,2 s sobre a água, scrim próprio | piscina, deck e espreguiçadeiras onde você desenhou. (sai no corte, 5,6 s) | 395 |
| 5,6–10,64 | corte invisível para o vídeo #169 na mesma caixa: a imagem começa a se mexer — cáusticas, câmera sobe devagar e abre céu, volumes/vidros/espreguiçadeiras estáveis | — | 169 (170) |
| 9,0–12,0 | overlay de fechamento no céu chapado do topo da caixa (y≈320–615, sem scrim), depois sobre o último frame congelado (tpad 10,64–12,0): logo monocromático + pílula "Comece grátis →"; o loop reinicia no print | **Comece grátis** | 169 |

- **CTA:** Comece grátis.
- **Legenda:**

  > Do print do SketchUp à imagem, e da imagem ao vídeo. Mesma casa, mesma piscina, mesmo deck.
  >
  > Primeiro a imagem de apresentação: concreto aparente, ripado de madeira, três espreguiçadeiras e a piscina onde foram desenhados.
  >
  > Depois o Animar pega essa mesma imagem e devolve um take curto: a água se mexe, a câmera sobe devagar, o projeto continua o mesmo.
  >
  > Dois passos sobre o mesmo print, em minutos. O take serve a apresentação ou o story do escritório.
  >
  > Comece grátis — sem cartão, no link da bio.
  >
  > #arquitetura #archviz #sketchup #apresentacaodeprojeto #visualizacaoarquitetonica

- **Variante paga (SIGN_UP):**
  - A · ferramentas — primário: "Do print à imagem e da imagem ao vídeo, sem sair do projeto. Piscina, deck e espreguiçadeiras no lugar. Comece grátis." · título: "Imagem e vídeo do mesmo print" · descrição: "Sem cartão para começar".
  - B · fidelidade — primário: "Piscina, deck e espreguiçadeiras onde você desenhou. O render vira um take curto: a água se mexe, o projeto não. Comece grátis." · título: "Do print ao vídeo, sem mudar o projeto" · descrição: "Sem cartão para começar".
  - C · apresentação — primário: "Imagem para o cliente e um take curto para a apresentação, do mesmo print do SketchUp. Comece grátis." · título: "Imagem e vídeo do mesmo projeto" · descrição: "Em português, sem cartão".
  - Cutdown 9 s: régua reta de 1,2 s (sem passo atrás), hold do render 1,0 s, vídeo cortado nos primeiros 3,5 s, botão do anúncio no lugar do overlay, headline no frame 0.
- **Notas de produção:** composição própria em ffmpeg (a régua com passo atrás não é xfade); vídeo e stills na mesma caixa por scale-to-fill (aspectos 0,8429 vs 0,8418 — não precisa casar pela escada); não aplicar sharpen no still (o vídeo é levemente mais macio — deixar o degrau diluir nos primeiros frames); congelar o último frame com `tpad`; QA em 0,6 / 2,6 / 5,5 / 5,8 / 9,5 s (o par 5,5/5,8 confere o corte invisível). Evidências em `cf/`.
- **Riscos / gating:** não prometer "câmera parada" nem "aproximação" (o take sobe), "sem alterações" (espreguiçadeiras mudam de material; pedras→vegetação; arbusto→planta+vaso), "tempo real", duração de vídeo além de ~5 s; não nomear motor/provedor (o clipe é Kling de maio; os presets atuais roteiam para Veo 3.1 — a peça não afirma nada disso). Gate: SketchUp como origem e autoria do modelo. Anti-repetição: mesma casa de R1 e R10 — ≥11 dias de R1, R10 fica para a semana 5+.
- **Júri:** retenção 7 (movimento só em 5,6 s) · conversão 6 (vende feature, atrai curioso) — por isso fica no orgânico e só entra no pago como retargeting · marca 8 · produção 8.

---

### R10 · `fidelidade-tecnica/esquadria-regua-patio` — a esquadria continua onde você desenhou (reserva · semana 5+)

- **Pilar / ângulo:** fidelidade-geometrica · contorno da esquadria traçado no print + régua vertical + zoom no vão do térreo.
- **Formato / duração:** transformação de 11 s (cutdown 9 s).
- **Por que converte:** fala a língua do ofício (esquadria, montante, guarda-corpo, caixilho) — filtra o comprador com projeto real; a legenda transfere o critério ("a pergunta certa é X"), e a única forma de responder é subir o próprio print.
- **Por que reserva:** usa o mesmo par de R9 e a mesma casa de R1; com R1 no pago desde a semana 1 e R9 na semana 3, não há janela honesta de ≥2 semanas dentro deste calendário. Produzir na fila 10 e abrir a semana 5 (ou entrar no dia 03/10 se R1 ficar só no pago).
- **Decisões sobre os pareceres:** headline no card `hook-fixed` (top 250) — o céu chapado só ocupa y≈320–468 e a 2ª linha cairia sobre a laje branca; contorno com **montantes laterais e montante central** (não "dois montantes"); coordenadas medidas na banda 1080×1281: vão x 28–467 / y 552–797, topo do guarda-corpo y≈389, janela superior x≈775–990 / y≈345–405; banda rotulada 27:32 (não 4:5), y 319–1600; direção do wipeleft é da direita para a esquerda (trocar para wiperight se a intenção for esquerda→direita); push ancorado à esquerda com teto 1,15× (não 1,22×, que amplia 1,40× do JPG de 944 px); legenda sem "a mesa lá dentro no mesmo lugar" (a mesa fica, as cadeiras mudam de 6–7 para 4) e com "mobiliário" na lista de interpretação; título pago "geometria no lugar. câmera no lugar." (não "travada").
- **Gancho:** "esquadria no lugar. [guarda-corpo no lugar.]" (2ª frase em cinza terciário, verde só em "esquadria") sobre o print #396; contorno hairline branco (2 px, 70 %) desenha em 0,6 s o vão do térreo, a linha do guarda-corpo e a janela superior; aos 1,4 s a régua atravessa e o render aparece — o contorno não sai do lugar.
- **Assets:** #396 `thumbs/0396-render-before.jpg` → #395 `thumbs/0395-render-after.jpg` (alinhamento por correlação de arestas: vão dx=1 px, janela dy=1 px, laje 2 px, guarda-corpo 4 px; QA em `qa_396_395/`).
- **Roteiro:**

| t | visual | texto em tela | assets |
|---|---|---|---|
| 0,0–1,4 | print #396 em banda 1080×1281 (y 319–1600) sobre #1a1a1a; contorno SVG (traçado no PRINT) desenha em 0,6 s | **esquadria no lugar. [guarda-corpo no lugar.]** (hook-fixed, top 250, scrim do kit) | 396 |
| 1,4–2,6 | xfade wipeleft linear 1,2 s com régua hairline (2 tiques); imagens paradas; contorno imóvel por cima | idem | 396, 395 |
| 2,6–4,2 | #395 com o contorno preso 1,6 s — caixilhos pretos, guarda-corpo e janela caem dentro do traço; apoio em 2,8 s na base (sobre a grama, scrim 30 %) | idem + do print à apresentação, em minutos. | 395 |
| 4,2–4,6 | contorno some (0,2 s); corte seco 0,4 s de volta ao print (confere); corte seco para o render | do print à apresentação, em minutos. | 396, 395 |
| 4,6–8,5 | push ancorado à esquerda 1,00→1,15 (recorte x 0–~940, y ~200–1180) para o vão do térreo: montantes, caixilho preto; headline sai em 6,5 s | idem | 395 |
| 8,5–11,0 | scrim + pílula "Veja no seu próprio projeto →" + wordmark mono (overlay sobre o render) | **Veja no seu próprio projeto** | 395 |

- **CTA:** Veja no seu próprio projeto.
- **Legenda:**

  > A pergunta certa não é "ficou bonito?". É: a esquadria continua onde você desenhou?
  >
  > Pátio com piscina, print do modelo com o céu chapado do SketchUp. A régua atravessa a imagem e o contorno da esquadria — traçado no print — segue encaixado no render: vão do térreo, guarda-corpo de vidro, janela do pavimento superior.
  >
  > Depois, zoom no vão da sala. Montante e caixilho no mesmo lugar. A câmera não foi reposicionada para "ficar melhor".
  >
  > Mobiliário, vegetação, água e reflexos são interpretação — é o que a cena pede. O que é projeto, fica no lugar.
  >
  > Veja no seu próprio projeto — link na bio.
  >
  > #arquitetura #sketchup #render #visualizacaoarquitetonica #projetodearquitetura

  Variação de gancho (viável — contagem bate 1:1: 3 verticais no vão, 3 postes no guarda-corpo): "Conte os montantes no print. Agora conte no render."
- **Variante paga (SIGN_UP):**
  - A · fidelidade — primário: "A esquadria continua onde você desenhou. Print do modelo → imagem de apresentação, em minutos. Cadastro grátis." · título: "geometria no lugar. câmera no lugar." · descrição: "Teste com um projeto real".
  - B · prazo — primário: "Imagem de apresentação em minutos, com a esquadria onde você desenhou." · título: "Do print à reunião em minutos" · descrição: "Comece grátis".
  - C · controle — primário: "Você decide a câmera. A imagem respeita." · título: "Sua câmera, sua geometria" · descrição: "Teste com um projeto real".
  - Cutdown 9 s: manter 0–4,2 s intactos, cortar o corte de volta, push de 2 s, CTA aos 7 s.
- **Notas de produção:** `reel-spec.mjs` (still contain 27:32, wipe com `ruler:true`, zoompan com `pan` ancorado); contorno = card SVG transparente; print 733→1080 (1,47×) sem sharpen (halo sob o contorno); para variante de feed 4:5 usar letterbox, nunca cortar as laterais (clipa a jamba esquerda).
- **Riscos / gating:** nunca "nada mudou" (plantas de primeiro plano, painel escuro ao lado do pilar virou porta envidraçada, painel fosco do guarda-corpo virou vidro liso, quadro na parede); sem "35 mm" ou número de câmera; rótulo "Fachada Residencial" do banco é impreciso — não exibir. Gate: SketchUp e autoria.
- **Júri:** retenção 7 · conversão 7 (descrição sem oferta — B resolve) · marca 8,5 · produção 8.

---

## 3. Calendário sugerido — 4 semanas (07/09 a 04/10/2026)

Cadência: 3 posts/semana (4 na semana 1). Horários: Ter/Qui 12h ou 19h; Sáb 10h; Seg 8h para a peça de "reunião". Regras aplicadas: mesmo ângulo do mesmo pilar ≥3 semanas; mesmo par de assets ≥19 dias; mesma casa (piscina) ≥11 dias.

| Semana | Data | Peça | Pilar | Observação |
|---|---|---|---|---|
| 1 | Ter 08/09 | R2 um print, cinco climas | antes-e-depois | abre a rodada: maior retenção, loop |
| 1 | Qui 10/09 | R4 entre duas reuniões | tradicional-vs | funil; card final |
| 1 | Sáb 12/09 | R3 pisca. a casa não se mexe. | fidelidade | rewatch |
| 1 | Dom 13/09 | R1 nada sai do lugar (drone) | fidelidade | 4º post; se o dono preferir manter o drone só no pago, pular |
| 2 | Seg 14/09 | R5 trocou o piso. não o render. | ferramentas (Editar) | segunda de manhã = "mudança pós-aprovação" |
| 2 | Qua 16/09 | R6 conte o que saiu do lugar (banheiro) | fidelidade / alcance | reconstruído com #473 |
| 2 | Sáb 19/09 | Carrossel estático #1 (MODELO/RENDER: volumes gêmeos em 4:3, sala de jantar 01/02/03) | antes-e-depois | reaproveita os PNGs do QA; mantém cadência sem repetir Reel |
| 3 | Ter 22/09 | R7 forno, cafeteira, torneira | fidelidade | 12 dias após R4 (mesmo par, outro pilar e outra mecânica) |
| 3 | Qui 24/09 | R9 print, render, vídeo | ferramentas (Animar) | 11 dias após R1 (mesma casa) |
| 3 | Sáb 26/09 | Stories: cinco climas em 5 stories + enquete "qual você levaria para a reunião?" | antes-e-depois | não conta como post; se quiser 3º post, carrossel #2 (banheiro MODELO/RENDER + cozinha com marcadores) |
| 4 | Ter 29/09 | Carrossel estático #2 (se não foi no dia 26) ou repost do Reel de melhor retenção da semana 1 como colab | — | slot de folga para o que a semana 1 ensinou |
| 4 | Qui 01/10 | R8 três antes das 14h · ep. 01 | produtividade | 21 dias após R4 (mesmo ângulo) |
| 4 | Sáb 03/10 | R10 esquadria (condicional) | fidelidade | só se R1 não foi ao orgânico no dia 13; senão abre a semana 5 |

**Pago (Meta, som off, legenda embutida, botão SIGN_UP):**

| Campanha | Objetivo | Peças | Público | Início |
|---|---|---|---|---|
| A · Cadastro — fidelidade | cadastro (evento signup do pixel; enquanto não existir, tráfego com LEARN_MORE e trocar) | R1 11,5 s (feed/reels) + R1 6 s (stories); R2 cutdown 8,5 s com copy B (prazo); R3 9 s | frio: arquitetos/designers BR, interesses SketchUp/Revit/archviz | semana 1 |
| B · Cadastro — interiores | cadastro | R5 7,2 s; R7 10 s; R8 9,5 s | frio: design de interiores/reforma BR | semana 2 (R5) e 3 (R7/R8) |
| C · Retargeting | cadastro | R4 8,5 s; R2 copy A; R9 9 s (só aqui — vende feature) | visitantes da landing 30 d + engajados no IG 30 d + cadastrados sem geração (se a lista existir) | semana 2 |

Cada peça sobe com as 3 variações de copy deste documento (ângulos fidelidade / prazo / apresentação), 1 criativo por conjunto na primeira semana; a partir da semana 2, cortar o pior conjunto por CPA e realocar.

---

## 4. Conceitos derrubados

- `resposta-direta/resposta-alteracao-so-a-parede` — o par #52→#797 regenerou a arte dentro das molduras, livros, almofadas e cozinha (diff por região 8–16 vs 0,6 de ruído); "só a parede." e "cada quadro no lugar." são claims que o próprio wipe desmente. Refazer só com novo asset (máscara restrita à parede) e novo diff.
- `serie-formato/serie-um-print-cinco-climas-ep01` — quase duplicata de R2 (mesmos seis assets, mesma mecânica); o roadmap da série não se sustenta (Ep. 03 é o mesmo print do Ep. 01; nenhum outro projeto tem cinco climas sem gerações novas). Rótulos de clima e a troca #513→#511 foram absorvidos por R2.
- `resposta-direta/resposta-prazo-cinco-climas` — mesmos assets de R2 em layout de duas faixas que não existe no kit (produção 6), casa pequena em 6''; a objeção de prazo virou a variação paga B de R2 e o cutdown de 8,5 s cumpre o mesmo papel.
- `alcance-organico/cozinha-repara-no-lustre` — terceiro uso do mesmo par #426/#425 em 4 semanas, timing da régua errado no roteiro (o lustre cruza em 3,3–4,1 s, não em 4,8–5,5 s), headline cobrindo o payoff e LEARN_MORE numa campanha de cadastro; a mecânica "split desde o frame 0" fica anotada como corte alternativo de R7 se R7 render mal.

---

## 5. Pendências do dono

1. **Patch do kit (1 linha):** `marketing/scripts/lib/reel-kit.mjs:188` → `${c.url === undefined ? 'spacenode.app' : c.url}` para o card final aceitar `url: ""`. Sem isso, R1, R4, R5 e R8 imprimem o domínio na arte.
2. **Autoria/permissão dos modelos 3D** (prohibited §6 / editorial regra 8) antes de qualquer veiculação paga: casa com piscina (#396/#442/#444), casa de concreto e ripado (#514), cozinha (#426), sala de jantar (#430), suíte (#76→#75, storage 22b2f92f…), banheiro (#474), volumes gêmeos (#382). Se algum for projeto de cliente, registrar `permission_status = granted`.
3. **Origem SketchUp dos prints** #426, #430 e #474 (o banco não registra a ferramenta). Se não for SketchUp: "print do modelo" e #visualizacaoarquitetonica no lugar de #sketchup em R4, R6, R7 e R8.
4. **Escolhas de asset que deixei decididas, mas são reversíveis:** R2 com #507 (hora azul) no lugar de #521 (sol com flare); R6 com #473 no lugar de #475 (vapor). Se o dono preferir os originais, as legendas correspondentes voltam a admitir as mudanças (documentado em cada Reel).
5. **Pixel do Meta:** configurar o evento de cadastro (o que falta hoje é o label de conversão — mesmo bloqueio já anotado para o Google Ads). Enquanto não existir, a campanha A roda como tráfego (LEARN_MORE) e troca para SIGN_UP na semana 2.
6. **Trilha:** os arquivos saem sem áudio; escolher trilha no app do IG na hora de publicar (R2 e R8 têm cortes em ~1,3 s / 0,4 s pensados para beat).
7. **Série "Três antes das 14h":** decidir se vira série com cadência (então pré-produzir Ep. 02 loja #404→#403/#405/#411 e Ep. 03 living #309→#318/#308/#303 antes de prometer "toda segunda") ou fica como formato recorrente sem promessa — a legenda de R8 já está na versão sem promessa.
8. **Série "Um print, cinco climas":** só revive se o dono gerar os climas que faltam nos outros projetos (~20 nodes por render Vega 2K: Ep. 02 casa na encosta e Ep. 04 pavilhão precisam de 1 cada) — não autorizado nesta rodada.
9. **Plugin SketchUp:** o slate não tem Reel de plugin de propósito. Assinar o .rbz no portal da Trimble e fazer o smoke pago da 0.7 libera uma peça "renderize de dentro do SketchUp" para a rodada seguinte.
10. **QA de frames:** cada Reel gera 4–5 frames de QA (tempos indicados em cada peça) + `ffprobe`; o dono aprova os frames antes do render final — em especial o blend #474×#473 (R6), o blend com escala 0,99 (R3) e o par de frames 5,5/5,8 s do corte still→vídeo (R9).
11. **Claims que ficaram fora e só entram com fonte registrada:** preço de render terceirizado (R$150–600), "ambiente que o cliente mais pede", qualquer horário ou tempo além de "gerado em minutos".
12. **Limpeza de menções antigas:** `marketing/BRIEF.md` e `docs/marketing/prohibited-content.md` ainda dizem "plugin não existe" e usam #0a0a0a — atualizar para não confundir a próxima rodada.
