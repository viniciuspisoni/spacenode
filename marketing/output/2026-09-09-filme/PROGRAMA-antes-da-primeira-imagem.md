# "antes da primeira imagem." — filme de apresentação

| peça | quadro | duração | onde |
|---|---|---|---|
| master | 1920×1080 | 46,4 s | site, YouTube, apresentação |
| corte vertical | 1080×1920 | 46,4 s | Reels e Stories |

30 fps · H.264 · **sem áudio** nas duas.
Spec único: `marketing/specs/2026-09-09-filme/antes-da-primeira-imagem.json`
(o corte 9:16 é o bloco `vertical` do mesmo arquivo — `cinema.mjs … --vertical`)
Roteiro completo: `marketing/specs/2026-09-09-filme/roteiro-isto-roda-ha-meses.json`
Renderizador: `marketing/scripts/cinema.mjs`

## O corte 9:16

Quatro decisões, e a terceira não é óbvia:

1. **A ambientação segue cheia na tela** (`cover`). São matéria e luz abstratas — não há
   enquadramento de arquiteto para preservar, e num celular a textura full-bleed bate mais.
2. **Tudo que é prova vai para banda** (`contain`, `inset: 0`). Ali existe enquadramento, e um
   16:9 recortado em 9:16 perde 69% da largura junto com ele.
3. **O tema do texto inverte em quase toda a metade clara.** No master essas cenas são full-bleed
   e o texto branco cai sobre a imagem. Em banda ele cai sobre a **chapa clara em volta**, e
   branco sobre #FAFAFA é invisível. Por isso `s6`, `s9`, `s11` e `s13` viram tema claro no corte.
4. **O Histórico ganha recorte próprio**, 2 colunas × 2 fileiras em vez de 4 × 2. A banda 16:9 do
   master viraria uma tira de 607 px e o rodapé de cada card — onde está o custo em nodes, que é
   o ponto da cena — ficaria ilegível no celular.

## De onde veio

O dono mandou como referência o filme de lançamento de um concorrente (Redraw, *"Diga Olá ao
novo Redraw"*) e pediu **a estrutura de anúncio**, com imagem gerada por IA permitida **apenas
como ambientação**. Três direções foram escritas em paralelo e julgadas por uma lente de marca
e honestidade; esta venceu por 8,5 contra 7,5 e 6,5.

## A armadilha do "novo", e como a peça resolve (revisto)

O SPACENODE **não está lançando nada**. Vende desde 16/07/2026. Dizer "o novo SPACENODE" seria
mentira, e imitar a frase do concorrente seria pior.

A primeira versão resolvia isso de frente, com "isto roda há meses." na abertura e "tudo isto já
está no ar." no fecho. O dono derrubou as duas, com razão: **respondiam uma pergunta que ninguém
fez**. O espectador não chega ao filme achando que o produto é novo — essa era uma preocupação
herdada do filme de referência, não do público. E "rodar" é palavra de software, não de arquiteto.

A peça mantém a estrutura de anúncio inteira — atmosfera, apresentação, produto, CTA — e o que
ficou no lugar das duas cartelas trabalha para o filme em vez de se defender dele:

- aos 5 s, ainda no escuro: **"todo projeto existe [antes da primeira imagem.]"**
  Faz a ponte da matéria abstrata para o modelo do SketchUp que vem logo depois.
- no fecho: **"[oito ferramentas.] um projeto só."**

**Efeito colateral resolvido:** a cena 10 dizia "oito módulos." e o novo fecho diz "oito
ferramentas." — o mesmo número com dois nomes diferentes em 15 s. O número saiu da cena 10 (a
imagem da barra lateral já mostra os oito) e aterrissa uma vez só, no fecho. A cena 10 passou a
dizer **"um crédito só. [node paga render, vista, edição e vídeo.]"**, que é verdade conferida
(Node serve para render, vista, edição, upscale, vídeo, planta e bloco 3D).

## A regra que divide o filme em dois

| metade | o que é | o que pode dizer |
|---|---|---|
| escura (0–11,7 s) | 4 clipes **gerados** por Veo 3.1 texto→vídeo: poeira num facho, concreto, pedra, uma fenda de luz | **nada sobre o produto** |
| clara (11,7 s–fim) | **100% material real**: viewport do SketchUp, par antes/depois, sidebar, botão, render animado, Histórico | todo claim acontece aqui |

`BRIEF.md` §4 proíbe usar IA externa para fingir output do produto. Por isso os quatro clipes
gerados são **matéria e luz, sem nenhum elemento construtivo** — sem quina, sem esquadria, sem
móvel, sem ponto de fuga. Um plano gerado de "interior bonito de arquitetura" seria ambíguo mesmo
sem legenda, porque **adjacência é montagem e montagem é claim**.

A dobradiça entre as metades é o quarto clipe, que estoura em branco. O corte para a primeira
imagem de produto acontece dentro desse branco.

## Números na tela (todos conferidos no código)

| onde | número | fonte |
|---|---|---|
| botão do Renderizar, em escala 1:1 | 20 Nodes por render | `lib/engines.ts:30` |
| tira da interface do Animar | 210 Nodes | `lib/video/models.ts:107` |
| rodapé dos cards do Histórico | 28 NODES / 210 NODES | mesma tabela, corroborando |
| microcopy final | 80 nodes grátis | `supabase/migrations/20260728000000_free_signup_nodes_80.sql:22` |

Nenhum claim de tempo, de preço em reais ou de comparação com render terceirizado — não existe
medição auditada para nenhum deles. A peça abre mão do gancho comercial mais óbvio do público
e fica só com o preço em nodes, que é verdadeiro e está lido no pixel da própria interface.

## Privacidade

O selo de autoria do dono aparecia nas 8 miniaturas do Histórico. Foi removido **clonando um
pedaço limpo do piso ao lado** (`marketing/scripts/produto/mascarar.mjs`, modo `clonar`).
Pintar com cor chapada deixava um quadrado cinza e desfocar só espalhava a mancha — sobre
conteúdo texturado, os dois modos denunciavam mais do que o dado denunciava.

## O que ficou de fora, de propósito

- **O par `sala-de71`** foi cortado do filme inteiro. A medição do dia mostrou ~22 ripas no painel
  do modelo contra ~30 no render, e os pendentes viraram de gaiola para globo liso: o par não
  aguenta close nem cartela de "nada mudou".
- **A verificação automática de geometria**, que é o diferencial técnico mais forte do produto.
  Existem caminhos no código em que a plataforma não refaz o render, então qualquer cartela do
  tipo "se não bate, o render é refeito" seria falsa. Ficou fora até alguém conferir
  `RENDER_FIDELITY_GATE` em produção e escrever a frase certa.

## Limites honestos da peça

- **Não tem nenhum ser humano.** Não existe no acervo imagem de pessoa, mesa ou escritório — e o
  achado do dia (uma mão entrou no quadro do Veo mesmo listada no `negative_prompt`) confirma que
  pedir gente ao gerador é justamente o que não se deve fazer sem direção.
- **Prova fina para metade dos módulos.** Editar, Ampliar, Finalizar, Spaces, Planta humanizada e
  Blocos 3D aparecem só como **nome** na barra lateral. É honesto — nenhuma copy promete resultado
  deles — mas um arquiteto cético vê oito nomes e três provas.
- **As datas do Histórico** (05–07 de set. de 2026) hoje ajudam, porque reforçam "já está no ar".
  Daqui a alguns meses passam a datar a peça.
- **Sem trilha.** Como todo o pipeline, sai mudo.

## Custo de geração

| clipe | duração | US$ |
|---|---|---|
| poeira-facho, concreto-chapado, pedra-rasante, fenda-luz | 4 s cada | 3,20 |
| (rodada anterior: sala-dolly, casa-travelling, concreto-luz) | | 3,20 |
| **total** | | **6,40** de um teto de 15,00 |

Livro-caixa em `broll/gasto.json` e `ambientacao/gasto.json`.
