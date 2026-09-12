# QA — 2026-09-04-reel-lareira-render-video (R13 · print → render → vídeo, sala com lareira)

## Spec usado
`marketing/output/2026-09-04-reel-lareira-render-video/spec-src.json` (cópia renderizada em `spec.json`). Kit: `marketing/scripts/reel-spec.mjs`, 3 rodadas.

Assets (originais do acervo, geração real do dono em 2026-09-04, job 38136ab5, vega/2k):
- #3 `assets/0003-render-before.png` 3072×1228 — print do modelo (já com materiais)
- #2 `assets/0002-render-after.png` 3264×1312 — render
- #0 `assets/0000-video-video_out.mp4` 1920×1080, 24 fps, 6,0 s, veo3.1 — Animar gerado a partir de #2

Banda: `band.aspect = 16/9` → 1080×608 em y=656 para stills E vídeo. Os stills (≈2,5:1) recebem recorte central 16:9 (2183×1228 e 2332×1312), que é exatamente o enquadramento do vídeo: SSIM do frame 0 do vídeo vs recorte central de #2 = **0,957** (vs 0,60 contra a imagem inteira). Fundo = a própria imagem desfocada; ken burns [1,1] nos dois stills (alinhamento do wipe + corte invisível).

## Timeline (10,80 s · 1080×1920 · 30 fps · H.264 crf 18 · yuv420p · sem áudio · 1,8 MB)
| t | visual | texto em tela |
|---|---|---|
| 0,00–0,90 | #3 parado, brightness -0,14 | hook "o render parado. [agora anda.]" + eyebrow "Modelo · Sala de estar" |
| 0,90–1,50 | wipeleft 0,6 s com régua branca (#3 → #2) | idem |
| 1,50–3,80 | #2 parado | hook idem; eyebrow vira "Render · Sala de estar" em 1,50 |
| 3,80–3,90 | fade de 3 frames #2 → vídeo #0 (lê como corte) | hook sai em 3,85 |
| 3,85–9,40 | vídeo #0 na mesma banda (fogo se mexe, câmera abre devagar, sofá entra em ~9 s) | chip "Animar · vídeo do render" (3,85); apoio "fecha a apresentação com {movimento} — / sem sair do projeto." (4,30–9,40) |
| 9,40–9,80 | fade para o card final | scrim até 9,80 |
| 9,40–10,80 | card final: logo monocromático + pílula "Veja no seu próprio projeto →" + "80 nodes grátis · sem cartão · em português" | — |

"Antes" puro na tela: 0,9 s (+0,6 s de wipe) ≤ 1,5 s.

## Conferido frame a frame (qa-sheet.jpg + qa-frames/)
- t0,50 / t1,70 / t3,78: hook legível, uma linha, peso 500, "[agora anda.]" em cinza terciário; topo do hook em y≈510 (> 220). Eyebrow com fios em y≈1340.
- t1,20 (meio do wipe): TV, juntas dos painéis, bancada e linha do piso alinhados dos dois lados da régua — mesma câmera, mesmo projeto. Sem flash claro.
- t3,78 → t3,92 (corte still → vídeo): mesmo enquadramento; SSIM da banda entre 3,70 s (still) e 3,86 s (1º frame do vídeo) = **0,974**. O fade de 3 frames dilui o resto.
- t5,00 / t7,50 / t9,20: chip abaixo da banda (y≈1292–1342), apoio em duas linhas com quebra forçada após o travessão, base do texto em y≈1580 (< 1600). Verde só em "movimento". Vídeo em movimento: SSIM da banda 5,0 s vs 9,2 s = 0,564 (fogo + câmera abrindo, sofá entra embaixo).
- t10,20: card final correto, CTA da lista aprovada, microcopy padrão, sem URL na arte.
- Banda não esticada (escala uniforme 1080/2332 e 1080/2183; conferido no wipe).
- Linguagem: minúsculas com ponto, duas frases, sem exclamação; etiquetas Modelo/Render como no comparador da landing; hook 5 palavras.

## Rodadas
1. Erro do kit: `cut` (concat) seguido de xfade quebra no ffmpeg ("timebase 1/1000000 vs 1/15360"). Resolvido no spec: still→vídeo virou `fade` de 0,1 s (3 frames) — visualmente um corte, e as duas imagens já são quase idênticas. Não editei o kit.
2. Apoio quebrava com órfã "do projeto." → `<br>` após o travessão.
3. Eyebrow "Modelo · SketchUp" → "Modelo · Sala de estar": a origem do print #3 não está registrada no inventário; não afirmar SketchUp sem o dono confirmar.

## Ressalvas
- A régua do wipe é uma linha de 6 px na altura inteira do frame (comportamento do kit): por 0,6 s ela passa por cima do hook e do eyebrow. Igual aos Reels de julho; não há como restringi-la à banda de dentro do spec.
- Do corte em diante o vídeo é mais macio que o still (compressão do Veo); com o fade de 3 frames o degrau não aparece nos frames conferidos.
- O take faz pull-back (a câmera abre e um sofá entra no quadro). Copy e legenda dizem "a câmera abre devagar"; nunca "câmera parada" nem "aproxima". Não nomeamos motor/provedor.
- O "antes" já tem textura: a legenda fala em luz/fogo/realismo, não em "do cinza ao render".

## Versão paga
A peça orgânica tem 10,8 s ≤ 15 s, texto embutido, CTA no card final: **o mesmo mp4 serve** para o Meta (SIGN_UP). 3 copies no bloco final de `caption.txt` (primário ≤125 visível, título ≤40, descrição ≤30).

## Gating antes de veicular
- Dono confirmar autoria/permissão do modelo da sala com lareira (job 38136ab5, 2026-09-04).
- Se confirmar que o print saiu do SketchUp, pode trocar o eyebrow de volta para "Modelo · SketchUp" e acrescentar #sketchup.
- Evento de cadastro no pixel do Meta configurado antes do pago.
