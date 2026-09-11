# Filme de apresentação do SPACENODE — "Mesma Geometria"

| peça | quadro | duração | onde |
|---|---|---|---|
| master | 1920×1080 | 57,1 s | site, YouTube, apresentação a cliente |
| corte vertical | 1080×1920 | 47,2 s | Reels e Stories |

30 fps · H.264 · **sem áudio** nas duas.
Spec único: `marketing/specs/2026-09-09-filme/mesma-geometria.json`
(o corte 9:16 é um bloco `vertical` dentro do mesmo arquivo — `cinema.mjs … --vertical`)
Renderizador: `marketing/scripts/cinema.mjs` (kit novo, ver `lib/cinema-kit.mjs`)

## O corte 9:16 não é o master recortado

Três decisões que valem para qualquer corte vertical futuro:

1. **Todo plano vai em banda (`contain`), não em `cover`.** Um 16:9 dentro de 1080×1920 em
   `cover` perde **69% da largura** e leva junto o enquadramento que o arquiteto escolheu —
   o `BRIEF.md` manda preservá-lo. É a mesma razão da "banda" do reel-kit.
2. **Os planos abertos da sala perdem o `cropFrac`** e voltam ao 4:3 nativo: ocupam 810 px de
   altura em vez de 607. Mais imagem na tela, mesma câmera.
3. **O par de macros ganha um recorte próprio, 1:1** (`cropFrac [0.62, 0.10, 0.36, 0.48]`),
   ainda idêntico nos dois arquivos. O recorte 16:9 do master viraria uma tira de 607 px no
   meio do quadro; em 1:1 a quina ocupa 1080×1080 e a prova sobrevive à tela do celular.
   O que **não** podia acontecer era usar `cover` aqui: a janela central de 31,6% cortaria
   justamente o encontro do ripado com a pedra, que é o assunto do plano.

O ato da escala perde o plano industrial para o corte fechar em ~47 s de Reel.

## A tese

Fidelidade geométrica é a única qualidade de imagem que **exige tempo** para ser verificada:
nitidez se vê num quadro, cor se vê num quadro — "nada se moveu" só se prova olhando devagar.
Por isso o filme é lento de propósito. É o argumento que o SPACENODE tem e que não se copia
com um prompt melhor: modo estrutural `render_only`, trava constante, e verificação automática
de geometria depois de gerar, com re-geração por conta da casa (`lib/ai/fidelity/`).

Escolhido entre 4 tratamentos independentes por um júri de 3 lentes (marca/honestidade,
direção de cinema, e o próprio público). Venceu em 2 das 3.

## Estrutura

| ato | o que acontece | por quê |
|---|---|---|
| 1 · o modelo | viewport real do SketchUp → "o projeto já existe. [a imagem dele, ainda não.]" | põe o espectador dentro do problema em 4 s |
| 2 · a prova | modelo cru → *wipe* → render, **mesma câmera**; depois dois macros de recorte idêntico, em corte seco | o argumento se prova sozinho, sem adjetivo |
| 3 · a luz | o render animado pelo próprio Animar → segunda geração do mesmo enquadramento, outra luz | "a luz muda. [o projeto não.]" |
| 4 · a escala | fachada em travelling, interior industrial, fachada comercial | "todos começaram [num modelo cinza.]" |
| 5 · o produto | o botão real do Renderizar, com o preço queimado no pixel | preço antes do clique, sem um adjetivo em cima |

## Decisões que valem registro

**Sem letterbox.** O tratamento pedia 2.39:1. As barras comeriam 26% do quadro e esmagariam os
planos de interface (o botão do Renderizar tem 98 px de altura nativa). O renderizador suporta
letterbox — é um campo no spec — mas o master saiu em 16:9 cheio. O "cinematográfico" aqui vem
da gramática (preto de marca, holds longos, uma ideia por plano, tipografia que entra em fade),
não de barras.

**O par macro é pixel-alinhado de propósito.** `sala-de71-antes.png` (3072×2304) e
`sala-de71-depois.png` (2368×1776) têm resoluções diferentes e o mesmo aspecto 4:3, capturados
pela mesma câmera do plugin. Por isso o spec usa `cropFrac` (fração) e não `crop` (pixel):
a mesma fração recorta exatamente a mesma quina nos dois arquivos. É o que torna o corte seco
entre as cenas 6 e 7 uma prova em vez de uma ilustração.

**O b-roll é o produto usando o produto.** Os dois clipes com movimento real foram gerados com
Veo 3.1 via fal — o motor "Cinemático" do módulo Animar (`lib/video/models.ts:107`) — a partir
de renders que já são output real do SPACENODE. Não é imagem de IA externa fingindo ser produto
(o que o `BRIEF.md` §4 proíbe). Custo: **US$ 2,40** de um teto autorizado de US$ 15
(livro-caixa em `broll/gasto.json`).

**`sala-dolly.mp4` só entra por 2,4 s.** O QA mostrou que o clipe é fiel até ~2,5 s e depois
inventa uma segunda coluna, achata o forro em leque e alarga a sala. Num filme cuja tese é que
a geometria não se mexe, deixar rodar até os 6 s desmentiria a peça no próprio quadro. Detalhes
e a provável causa em `broll/LEIA-ME.md`.

## Números citados (todos conferidos no código)

| onde | número | fonte |
|---|---|---|
| botão do Renderizar (pixel real da UI) | 20 Nodes por render | `lib/engines.ts:30` |
| microcopy da cartela final | 80 nodes grátis | `supabase/migrations/20260728000000_free_signup_nodes_80.sql:22` |

Nenhum outro número aparece. Nenhuma métrica de tempo, custo em reais ou comparação com
concorrente — não existe medição real para sustentar nenhuma delas.

## Privacidade

Nenhum plano do filme mostra dado de conta. O único plano de interface é o botão
`06-botao-gerar-com-preco.png` (902×98), que é um recorte nativo contendo apenas
"gerar render / 20 Nodes por render". O viewport do SketchUp não tem barra de título,
nome de arquivo nem usuário.

Fora do filme, a auditoria encontrou material que **não pode** ser usado em peça pública:
`marketing/output/2026-09-08-tutoriais/src/historico/03-drawer-detalhes.png` traz nome
completo e e-mail do dono, e abre em modo staff (`INTERNAL_STAFF_EMAILS`).

## Pendências do dono

1. **Trilha sonora.** O pipeline inteiro produz mp4 sem áudio de propósito (a música entra no
   app do Instagram). Um filme de apresentação para site/YouTube pede trilha e desenho de som —
   e não há nada licenciado no repo. O master está mudo.
2. **Onde publica.** Hero da landing, YouTube, apresentação a cliente — cada um pede um
   tratamento de primeiro frame diferente.
3. **Decidir sobre a v2 proposta pela síntese** (ver abaixo).

## v2 proposta pela síntese — não aplicada, decisão sua

O roteiro sintetizado (73 s, 20 cenas) acrescenta duas cartelas que o corte atual não tem, e
que são as duas afirmações mais fortes e verdadeiras do produto:

- **"renderize de dentro do SketchUp. [ou do navegador.]"** — abre o capítulo do plugin.
  Claim autorizado explicitamente por `docs/marketing/prohibited-content.md` §2. Antes de usar,
  confirmar se a peça pode falar do plugin (a versão pública em `main` é a v0.9.0).
- **"se a geometria não bate, [o render é refeito.]"** — a verificação automática de geometria
  com re-geração por conta da casa. É o diferencial que nenhum concorrente tem.
  **Conferir `RENDER_FIDELITY_GATE` ligado em produção antes de publicar essa cartela.**

A síntese também aponta que o CTA literal da landing em `main` é "Testar grátis →"
(`components/FinalCTA.tsx`), enquanto a cartela final do filme diz "Testar com um projeto real".
Não é erro — mas alinhar com o site é melhor.

Duas críticas honestas que ela levanta e que continuam de pé no corte atual: **o filme não tem
um ser humano** (não existe nenhuma imagem de pessoa, mão, mesa ou escritório no acervo) e
**ele mostra um módulo, não o produto inteiro** (só o Renderizar aparece nomeado por pixel).
