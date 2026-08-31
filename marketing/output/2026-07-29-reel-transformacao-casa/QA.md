# QA — 2026-07-29-reel-transformacao-casa

Reel de transformação (pilar 1), roteiro **`preco`** — ataca a dor de custo
(R$150–600 por imagem terceirizada, número que já está no BRIEF.md).

```bash
node marketing/scripts/reel-transformacao.mjs --roteiro preco --data 2026-07-29
```

| item | alvo | medido | ok |
|---|---|---|---|
| resolução | 1080×1920 | 1080×1920 | ✅ |
| frame rate | 30 fps | 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 10.00s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 3,68 MB | ✅ |

Banda 1080×608 em y=656 (aspect 1.778). Crop: antes 1524×857 de 1567×857, depois
2731×1536 de 2784×1536 — o "depois" é 4K de origem, então sobra resolução.

## Textos

- Hook (antes): "Terceirizar esse render: R$150 a R$600."
- Hook (depois): "Do seu próprio modelo: **minutos**." — verde só em "minutos"
- Sub: "Mesma geometria, mesma câmera, mesmo projeto."

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.7s.png` | hook em 2 linhas com o preço legível; zona segura ok |
| `t2.5s.png` | payoff com o verde no hook (único uso de verde no vídeo); sub em 2 linhas, base em ~y 1420, dentro da zona segura |
| `t6.0s.png` | Ken Burns visível |
| `t9.2s.png` | card final — PNG byte-idêntico aos outros Reels (md5 `5764f8e7…`) |

Cores da marca ✅ · sem emoji/gradiente/sombra ✅ · geometria preservada ✅

## Legenda

Palavras-chave em texto corrido ✅ · 8 hashtags do pool ✅ · CTA pós-lançamento ✅

## Ressalvas

1. **O preço é do mercado, não nosso.** "R$150 a R$600" descreve o custo de
   terceirizar (dado do BRIEF.md), não preço de plano. Se alguém comentar
   perguntando preço, responder com o plano real — não deixar a comparação
   virar promessa de tabela.
2. **Contraste de brilho no corte.** O modelo do SketchUp tem céu branco estourado
   e o render tem céu azul; o wipe fica com um flash claro no meio. Foi mantido de
   propósito (é output real do SketchUp), mas se incomodar, dá pra escurecer só o
   "antes" com um `eq=brightness` leve.
3. Adicionar áudio dentro do Instagram na hora de postar.
