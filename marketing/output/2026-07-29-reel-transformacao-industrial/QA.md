# QA — 2026-07-29-reel-transformacao-industrial

Reel de transformação (pilar 1), roteiro **`apresentacao`** — projeto comercial, onde
quem decide raramente é arquiteto.

```bash
node marketing/scripts/reel-transformacao.mjs --roteiro apresentacao --data 2026-07-29
```

| item | alvo | medido | ok |
|---|---|---|---|
| resolução | 1080×1920 | 1080×1920 | ✅ |
| frame rate | 30 fps | 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 10.00s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 2,89 MB | ✅ |

Banda 1080×608 em y=656. **Este par é panorâmico (2.58:1)** e foi recortado para
16:9: antes 2761×1553 de 4000×1553, depois 1138×640 de 1664×640 — ou seja, ~31% da
largura foi cortada nas duas pontas. Conferi no frame que o recorte central preserva
o assunto (escada + mezanino + piso de madeira); as pontas eram parede e vidro sem
informação.

## Textos

- Hook (antes): "O projeto está pronto. A apresentação, não."
- Hook (depois): "Agora está."
- Sub: "Render com IA em **minutos**, sobre o seu SketchUp." — verde só em "minutos"

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.7s.png` | hook em 2 linhas; recorte central mantém o foco da imagem; zona segura ok |
| `t2.5s.png` | payoff "Agora está." — linha curta, fica com muito respiro, mas legível e alinhada ao centro |
| `t6.0s.png` | Ken Burns visível (comparado com t2.5s), sem estouro de borda |
| `t9.2s.png` | card final — PNG byte-idêntico aos outros Reels (md5 `5764f8e7…`) |

Cores da marca ✅ · sem emoji/gradiente/sombra ✅ · geometria preservada ✅

## Legenda

Palavras-chave em texto corrido ✅ · 8 hashtags do pool ✅ · CTA pós-lançamento ✅

## Ressalvas

1. **É o par com o antes/depois mais fraco dos quatro.** O export do SketchUp já vem
   com textura e cor, então o salto visual é menor que no banheiro ou na casa — o
   ganho aqui é luz, reflexo e profundidade, não "cinza → colorido". Por isso eu
   postaria este **por último** dos quatro.
2. **Recorte de 31% da largura.** Se você quiser o panorâmico inteiro, o caminho é
   um Reel com a imagem em faixa fina e mais texto em volta — muda o layout, não é
   só trocar um parâmetro.
3. Adicionar áudio dentro do Instagram na hora de postar.
