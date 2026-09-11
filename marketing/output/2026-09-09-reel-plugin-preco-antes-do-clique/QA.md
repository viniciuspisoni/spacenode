# QA — 2026-09-09-reel-plugin-preco-antes-do-clique

Tutorial do plugin: o que o painel pergunta antes de gerar e onde o custo aparece.
Fonte: capturas REAIS do SketchUp Pro 2022 do dono (07/09, painel 440×780), versao `src/masked/`
(pilula de saldo, linha "seu saldo dá para ~N renders" e "N nodes restantes" cobertas — §6 do
prohibited-content). Custo da acao ("28 nodes" no botao) PRESERVADO: e o que a peca ensina.

- seg 0 panel-08-presets: Tipo de projeto / Segmento / Espaco / Iluminacao — blocos reais do painel.
- seg 1 panel-09-motor: Sol na captura, Descricao, Motor de IA (Vega · Premium, Pulsar · Rápido, Quasar · Especial).
- seg 2 crop-09-rodape-preco (recorte nativo 440×100 do rodape): "Residencial · Sala de Estar · Quasar 2K" +
  botao "Gerar render · 28 nodes". 28 = Quasar 2K em lib/engines.ts (conferido em 08/09).
- seg 3 gerando-timelapse-sem-saldo.mp4 (geracao real de 07/09, 3,0 s do inicio).
- seg 4 sala-de71-depois: render de716672 (Quasar 2K) — o mesmo render que o time-lapse produziu.
- Claims: "o preço aparece antes do clique" = o botao mostra o custo antes de gerar (fato da UI);
  "o custo de cada render, antes de gerar" — nao promete valor fixo entre motores.
- Sem verde (accent:false), sem emoji, texto na zona segura (hook em 250; sub do card e em ~1590).
- probe: 1080×1920, 30 fps, h264, 13,80 s, 1,6 MB.
