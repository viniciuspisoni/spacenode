# QA — 2026-07-29-reel-transformacao-living

Reel de transformação (pilar 1), roteiro **`entrega`** — o ângulo é a diferença entre
o que você entrega e o que o cliente consegue ler.

```bash
node marketing/scripts/reel-transformacao.mjs --roteiro entrega --data 2026-07-29
```

| item | alvo | medido | ok |
|---|---|---|---|
| resolução | 1080×1920 | 1080×1920 | ✅ |
| frame rate | 30 fps | 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 10.00s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 1,71 MB | ✅ |

Banda 1080×608 em y=656 (aspect 1.778). Crop praticamente nulo: antes 1332×749 de
1336×749, depois 1365×768 de 1376×768.

## Textos

- Hook (antes): "Isso é o que você manda pro cliente."
- Hook (depois): "Isso é o que ele precisa ver."
- Sub: "Mesmo projeto. Gerado em **minutos**." — verde só em "minutos"

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.7s.png` | hook em 2 linhas, topo em ~y 430; eyebrow "MODELO SKETCHUP" abaixo da banda; tudo dentro da zona segura (220–1600) |
| `t2.5s.png` | payoff trocado corretamente após o wipe; "minutos" em #30D158 |
| `t6.0s.png` | Ken Burns visível, sem borda estourada |
| `t9.2s.png` | card final — PNG de origem byte-idêntico ao dos outros três Reels (md5 `5764f8e7…`), então não foi re-inspecionado visualmente |

Cores da marca ✅ · sem emoji/gradiente/sombra ✅ · geometria preservada entre
antes/depois ✅

## Legenda

Palavras-chave em texto corrido ("SketchUp", "render com IA", "arquitetura") ✅ ·
8 hashtags, todas do pool do brief ✅ · CTA pós-lançamento ✅

## Ressalva

Adicionar áudio de biblioteca dentro do app do Instagram na hora de postar (o MP4
sai sem áudio de propósito).
