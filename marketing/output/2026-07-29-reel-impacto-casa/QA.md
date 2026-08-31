# QA — 2026-07-29-reel-impacto-casa

Versão **IMPACTO** do Reel, roteiro `preco`. Mesma legenda da v1
(`2026-07-29-reel-transformacao-casa`); o tratamento é o descrito em
[reel-impacto-banheiro/QA.md](../2026-07-29-reel-impacto-banheiro/QA.md).

```bash
node marketing/scripts/reel-impacto.mjs --roteiro preco --data 2026-07-29
```

| item | alvo | medido | ok |
|---|---|---|---|
| resolução / fps | 1080×1920 · 30 | 1080×1920 · 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 8.60s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 3,46 MB | ✅ |

Banda 1080×608 em y=656.

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.60s.png` | hook de 2 linhas com o preço legível; zona segura ok |
| `t1.45s.png` | **é o melhor frame dos três Reels de impacto**: o céu branco do SketchUp e o céu azul do render divididos pela régua, com a fachada perfeitamente alinhada nos dois lados — a comparação se explica sozinha |
| `t3.00s.png` | render full-bleed, verde só em "minutos" no hook |
| `t5.40s.png` | corte seco sem texto, scrim presente |
| `t6.50s.png` | Ken Burns adiantado |
| `t8.00s.png` | card final |

## Ressalvas

1. **O preço é do mercado, não nosso.** "R$150 a R$600" é o custo de terceirizar
   (dado do BRIEF.md), não preço de plano. Se alguém comentar perguntando preço,
   responder com o plano real.
2. **O lado do SketchUp é claro** (céu branco estourado), então durante a passagem o
   texto fica sobre um scrim mais claro que nos outros Reels. Conferi no frame e
   segue legível — mas é o Reel com menor margem de contraste dos três.
3. Adicionar áudio dentro do Instagram na hora de postar.
