# QA — 2026-09-05-reel-plugin-comparador-no-painel

Série do plugin SketchUp (novidade). Sem verde nos textos (`accent: false`).

## Peça
Estados reais do comparador do painel (#compareButton + #compareRange em 28/50/72%). Painel: o dialog.html real do plugin (v0.7.0, main), renderizado no Chromium com estados injetados pela mesma ponte Ruby→JS que o SketchUp usa (state/catalog/capture/status/result/batch). Catálogo com os presets e custos reais (lib/prompts.ts, lib/engines.ts). Nenhum elemento de UI foi desenhado à mão. Print #560 e render #559 são do Space "Projeto SketchUp 01/09". Nenhuma janela do SketchUp foi simulada — só o painel, como o dono pediu.

## Timeline
0: still 0s→1.40s · 1: still 1.4s→2.60s · 2: still 2.6s→3.80s · 3: still 3.8s→5.20s · 4: still 5.2s→6.40s · 5: card 6.1s→7.10s · total 7.10 s

## Specs medidas
1080×1920 · 30/1 · h264/yuv420p · 0.23 MB · sem áudio

## Conferido
- qa-sheet.jpg e frames: hook em uma linha acima do painel (inset de 200 px), painel legível em 779×1380, texto dentro da zona segura; sem verde; sem exclamação.
- Claims: só o que está na página /sketchup e no código do plugin (captura da vista, cenas em lote com mesma semente, comparador, criar Space, SketchUp 2021+, grátis / usa Nodes). Nada de "importação direta".
- Card final: CTA da lista + microcopy "plugin oficial · grátis · usa os nodes da sua conta".

## Gate
O .rbz está publicado no site (confirmado pelo dono em 05/09). Assinatura no portal da Trimble continua pendente: se algum usuário reportar bloqueio "Identified Extensions Only", responder com o caminho de liberar extensões não assinadas até assinar.
