# Reels de uso — versão na língua do filme

Cinco peças, 1080×1920, 30 fps, ~17 s, **sem áudio**.
Specs: `marketing/specs/2026-09-09-uso-cinema/` · Renderizador: `marketing/scripts/cinema.mjs`
Saídas: `marketing/output/2026-09-09-reel-uso-*-cinema/` (com `caption.txt`)

Não é uma rodada nova de conteúdo: é um **porte**. As cenas, a ordem, os recortes e os números
vêm dos Reels auditados da rodada anterior (`marketing/specs/2026-09-09-uso/`), que continuam
válidos. O que mudou foi a gramática visual, para os Reels virarem família do filme
["antes da primeira imagem."](../2026-09-09-filme/PROGRAMA-antes-da-primeira-imagem.md).

## O que mudou do reel-kit para o cinema-kit

| antes | agora |
|---|---|
| chapa escura `#1a1a1a` | **chapa clara `#FAFAFA`** — as telas do app são de tema claro, e agora o quadro acompanha |
| `fit: band` do reel-kit | `fit: contain, inset: 0` — a imagem sangra os 1080 e nada é recortado |
| texto trocando em corte seco | **fade de alpha** (0,3–0,5 s) |
| `hook-fixed` | `line` com `anchor: bottom`, tipografia do filme |
| recorte de UI esticado | **`nativo: true`** onde cabe: o pixel lê como software, não como arte |
| Ken Burns 1,04–1,05 | 1,02–1,03, e **câmera parada** em toda cena que é prova |

**Inversão de tema do texto.** Sobre chapa clara o texto vira escuro (`theme: "light"`).
Branco sobre `#FAFAFA` é invisível — foi o erro que o QA do filme pegou, e a regra entrou no
briefing desta rodada antes de qualquer um escrever spec.

**`reserveBottom` como sistema de composição.** O agente do Renderizar descobriu que, com
`contain` centrado, o recorte da taxonomia ocupava até y=1378 e a cartela ancorada na base
começava em ~1400 — 22 px de folga, texto colado na interface. Reservar 380 px em **todos** os
segmentos de imagem trava o centro óptico no mesmo y do primeiro plano ao último: a banda não
pula entre cortes e a menor folga da peça passou a 149 px.

**`grid` portado para o cinema-kit.** Era o único tipo de segmento que faltava, e é onde o Reel
do Spaces faz o argumento — nenhum outro segmento põe seis imagens na tela ao mesmo tempo.

## Duas correções de conteúdo nesta rodada

**Verde.** O briefing tinha uma contradição minha: mandava uma palavra verde por peça e ao mesmo
tempo mandava usar a cartela final do filme, que já traz `{80}`. O agente do Renderizar apontou
em vez de escolher sozinho. Resolvido para o lado do filme: **uma palavra verde por peça, sempre
o `{80}` da cartela final**. O `20` do corpo virou texto normal — é preço real da interface, mas
verde é acento, não ênfase, e dois verdes em 10 s tiram o peso do fecho.

**"mesma geometria" — agora medido, não suposto.** O Reel do Renderizar afirma "mesma câmera,
mesma geometria" sobre o par `renders/antes/casa.jpg` → `depois/casa.jpg`. Depois do que aconteceu
com o par `sala-de71` no filme (ripado com passo diferente, pendentes redesenhados), essa
afirmação não podia ir ao ar sem teste. Sobreposição por diferença: **as arestas aparecem como
linhas únicas e finas, não duplicadas** — esquadrias, lajes e volumes alinhados. O que muda é
vidro, luz e vegetação. A afirmação se sustenta neste par.

## Escolhas registradas, não defeitos

- **A tira do botão** (940×130 nativo) deixa muita chapa vazia em volta. É deliberado: em
  `contain` ela viraria 1080×150, praticamente a mesma tira só que 1,15× borrada e sem o
  argumento de escala 1:1. É a mesma composição que o filme usa na tira de custo do Animar.
- **O fundo dos recortes de UI é `#F5F5F5`**, um degrau abaixo do `#FAFAFA` da chapa. Em duas
  cenas dá para ver a emenda do card. Lê como a borda do próprio card do app; mascarar exigiria
  editar as capturas.
- **Microcópia da cartela final a 24 px** foi apontada como pequena em 1080. Conferida no frame:
  lê bem. Mantida.

## QA

Cada peça foi renderizada de verdade e teve os frames abertos um a um — 49 frames no total nesta
rodada, mais as minhas conferências. A regra veio da lição da rodada anterior: `--plan` valida
tempo e contagem, **não valida pixel**, e foi essa economia que deixou passar duas cartelas
sobrepostas no Reel do Spaces.
