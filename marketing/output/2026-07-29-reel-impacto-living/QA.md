# QA — 2026-07-29-reel-impacto-living

Versão **IMPACTO** do Reel, roteiro `entrega`. Mesma legenda da v1
(`2026-07-29-reel-transformacao-living`); o tratamento é o descrito em
[reel-impacto-banheiro/QA.md](../2026-07-29-reel-impacto-banheiro/QA.md).

```bash
node marketing/scripts/reel-impacto.mjs --roteiro entrega --data 2026-07-29
```

| item | alvo | medido | ok |
|---|---|---|---|
| resolução / fps | 1080×1920 · 30 | 1080×1920 · 30/1 | ✅ |
| codec / pix_fmt | libx264 crf 18 / yuv420p | h264 / yuv420p | ✅ |
| duração | 8–12s | 8.60s | ✅ |
| áudio | nenhum | sem stream | ✅ |
| tamanho | — | 1,65 MB | ✅ |

Banda 1080×608 em y=656. Crop praticamente nulo nos dois lados.

## Inspeção visual

| frame | verificado |
|---|---|
| `t0.60s.png` | hook em 1 linha; fundo desfocado do modelo com textura; zona segura ok |
| `t1.45s.png` | wipe alinhado, régua na borda, hook inteiro |
| `t3.00s.png` | **é onde o full-bleed mais rende**: o render é quente (terracota + luminária acesa) e o fundo desfocado espalha essa cor pelo frame inteiro; a v1 desperdiçava isso em preto chapado |
| `t5.40s.png` | corte seco sem texto, scrim presente |
| `t6.50s.png` | Ken Burns adiantado |
| `t8.00s.png` | card final |

## Ressalva

Adicionar áudio dentro do Instagram na hora de postar.
