# QA — 2026-07-29-reel-transformacao-banheiro

Reel de transformação (pilar 1), roteiro **`base`** (o do BRIEF.md). Par usado:
`banheiro` — material real da galeria da landing. Reproduzir com:

```bash
node marketing/scripts/reel-transformacao.mjs --roteiro base --data 2026-07-29
```

> **Re-renderizado em 2026-07-29** depois que a banda deixou de ser 4:3 fixo e passou
> a se adaptar ao par (ver `bandGeometry`). O banheiro ganhou com isso: a banda foi de
> 1080×810 para 1080×702 e o corte lateral caiu de 113px para 27px — agora aparece
> praticamente o render inteiro. Frames re-inspecionados.

## Especificações técnicas (ffprobe)

| item | alvo | medido | ok |
|---|---|---|---|
| resolução | 1080×1920 | 1080×1920 | ✅ |
| frame rate | 30 fps | 30/1 | ✅ |
| codec | H.264 (libx264, crf 18) | h264 | ✅ |
| pix_fmt | yuv420p | yuv420p | ✅ |
| duração | 8–12s (alvo 10s) | 10.00s | ✅ |
| áudio | nenhum (`-an`) | sem stream de áudio | ✅ |
| tamanho | — | 1,56 MB | ✅ |

Banda 1080×702 em y=610 (aspect 1.538). Crop: antes 1289×838 de 1343×838, depois
1280×832 inteiro (sem corte).

## Linha do tempo

| t | conteúdo |
|---|---|
| 0.0–1.5s | modelo SketchUp + hook "Seu cliente não entende isso…" |
| 1.5–1.8s | transição `xfade wipeleft` 0.3s |
| 1.8–8.5s | render com Ken Burns (zoom 1.00→1.08) + "…mas entende isso." |
| 8.5–10.0s | card final: lockup + spacenode.app |

"Antes" na tela por 1,5s — dentro do máximo do brief.

## Inspeção visual dos 4 frames (`qa-frames/`)

| frame | verificado |
|---|---|
| `t0.7s.png` | hook legível em 62px, ancorado 70px acima da banda; eyebrow abaixo dela — ambos dentro da zona segura (220–1600) |
| `t2.5s.png` | payoff trocado corretamente após o wipe; "minutos" em #30D158, único uso de verde no vídeo |
| `t6.0s.png` | Ken Burns visível (enquadramento mais fechado que em t2.5s), sem estouro de borda nem pixel esticado |
| `t9.2s.png` | card final centrado, logo monocromático, fundo #0A0A0A |

- Zona segura: ✅ nenhum texto acima de y=220 nem abaixo de y=1600 (o
  `bandGeometry` levanta erro se o layout invadir)
- Cores da marca: ✅ #0A0A0A de fundo, #FFFFFF no texto, #30D158 só em "minutos"
- Sem emoji nas artes, sem gradiente, sem sombra: ✅
- Aspecto de recorte idêntico nos dois lados — a imagem não "salta" na transição: ✅
- Geometria preservada entre antes/depois (mesma câmera, mesma planta): ✅ — é o
  argumento do post, então foi conferido frame a frame

## Legenda

- Palavras-chave de busca em texto corrido: "SketchUp", "render com IA",
  "arquitetura" ✅
- Hashtags: 8, todas do pool do brief ✅
- CTA: "Teste grátis no link da bio" — ver ressalva abaixo

## Ressalvas

1. ✅ **CTA / fase da campanha — resolvido pelo dono em 2026-07-29.** O CTA
   pós-lançamento ("Teste grátis no link da bio") está aprovado, e a regra de fase
   do BRIEF.md foi corrigida (nova seção "Fase da campanha") para que a produção
   futura não volte a sair com "segue @spacenode.app".
2. ✅ **"Gerado em minutos" — aprovado pelo dono em 2026-07-29** como claim de tempo.
3. ⚠️ **Áudio.** O MP4 sai sem áudio de propósito. Adicionar um áudio em alta dentro
   do app do Instagram na hora de postar — Reels com áudio de biblioteca do IG
   distribuem melhor que áudio embutido.
