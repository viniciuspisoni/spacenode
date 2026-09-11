# QA — 2026-09-05-reel-plugin-instale-em-tres-passos

Série do plugin SketchUp (novidade). Sem verde nos textos (`accent: false`).

## Peça
Três cards claros com os passos literais da página /sketchup, depois o painel conectado e com resultado. Sem URL na arte (o caminho é "no site"). Painel: o dialog.html real do plugin (v0.7.0, main), renderizado no Chromium com estados injetados pela mesma ponte Ruby→JS que o SketchUp usa (state/catalog/capture/status/result/batch). Catálogo com os presets e custos reais (lib/prompts.ts, lib/engines.ts). Nenhum elemento de UI foi desenhado à mão. Print #560 e render #559 são do Space "Projeto SketchUp 01/09". Nenhuma janela do SketchUp foi simulada — só o painel, como o dono pediu.

## Timeline
0: card 0s→1.80s · 1: card 1.8s→3.60s · 2: card 3.6s→5.40s · 3: still 5.4s→7.00s · 4: still 7s→8.60s · 5: card 8.3s→9.30s · total 9.30 s

## Specs medidas
1080×1920 · 30/1 · h264/yuv420p · 0.27 MB · sem áudio

## Conferido
- qa-sheet.jpg e frames: hook em uma linha acima do painel (inset de 200 px), painel legível em 779×1380, texto dentro da zona segura; sem verde; sem exclamação.
- Claims: só o que está na página /sketchup e no código do plugin (captura da vista, cenas em lote com mesma semente, comparador, criar Space, SketchUp 2021+, grátis / usa Nodes). Nada de "importação direta".
- Card final: CTA da lista + microcopy "plugin oficial · grátis · usa os nodes da sua conta".

## Gate
O .rbz está publicado no site (confirmado pelo dono em 05/09). Assinatura no portal da Trimble continua pendente: se algum usuário reportar bloqueio "Identified Extensions Only", responder com o caminho de liberar extensões não assinadas até assinar.
