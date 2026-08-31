# QA — 2026-07-29-reel-impacto-banheiro

Versão **IMPACTO** do Reel de transformação, roteiro `base`. Mesma mensagem e mesma
legenda da versão v1 (`2026-07-29-reel-transformacao-banheiro`) — muda o tratamento.

```bash
node marketing/scripts/reel-impacto.mjs --roteiro base --data 2026-07-29
```

## O que mudou em relação à v1

| | v1 | impacto |
|---|---|---|
| fundo | preto chapado (imagem ocupava ~32% do frame) | a própria imagem desfocada em full-bleed + scrim |
| revelação | `xfade wipeleft` seco | wipe com régua branca de 6px acompanhando a borda |
| estrutura | antes → depois → card | antes → wipe → render → **corte seco de volta** → render → card |
| duração | 10,0s | 8,6s (taxa de conclusão maior) |
| hook | 62px | 72px |

A banda nítida continua com a composição inteira do projeto — nada de recortar um
16:9 em 9:16 e destruir o enquadramento que o arquiteto escolheu.

## Especificações

| item | alvo | medido | ok |
|---|---|---|---|
| resolução | 1080×1920 | 1080×1920 | ✅ |
| frame rate | 30 fps | 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 8.60s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 1,60 MB | ✅ |

Banda 1080×702 em y=610. Crop: antes 1289×838 de 1343×838, depois 1280×832 inteiro.

## Linha do tempo

| t | conteúdo |
|---|---|
| 0.00–1.20 | SketchUp full-bleed + hook |
| 1.20–1.70 | régua atravessa revelando o render |
| 1.70–5.30 | render com Ken Burns + payoff |
| 5.30–5.50 | corte seco de volta ao SketchUp, sem texto |
| 5.50–7.40 | render de novo (o zoom continua de onde parou) |
| 7.40–8.60 | card final |

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.60s.png` | hook em 72px sobre o scrim; fundo desfocado com textura visível (não é preto morto); zona segura ok |
| `t1.45s.png` | **wipe correto**: as duas imagens paradas e alinhadas, régua casando com a borda, hook inteiro e legível atravessando a passagem |
| `t3.00s.png` | render full-bleed com payoff; "minutos" em #30D158, único verde do vídeo |
| `t5.40s.png` | corte seco: SketchUp de volta, **sem texto**, scrim presente, luminância parecida com a do render (sem flash claro) |
| `t6.50s.png` | render de volta com o Ken Burns adiantado |
| `t8.00s.png` | card final |

## Três erros que apareceram no caminho (e o que consertou)

1. **A revelação deslizava em vez de wipar.** O quadro do SketchUp saía para a
   esquerda, então a borda direita dele encostava na esquerda do render: lia como
   defeito, não como comparação. Trocado por `xfade=wipeleft` (as duas imagens
   paradas, só a borda anda) com a régua sincronizada por expressão de tempo.
2. **Os dois textos colidiam no meio da passagem** — "Seu cliente não…" e
   "…mas entende isso." ficam na mesma altura e viravam "ententende isso.". Agora a
   imagem passa no wipe e o texto troca em corte seco, sobreposto depois.
3. **O scrim morava dentro dos cards de texto.** Ao esconder o texto no corte seco o
   scrim ia junto e o quadro ficava lavado. Virou camada própria, sempre aplicada.

## Ressalva

Adicionar áudio de biblioteca dentro do app do Instagram na hora de postar.
