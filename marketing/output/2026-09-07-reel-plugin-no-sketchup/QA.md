# QA — 2026-09-07-reel-plugin-no-sketchup

Fonte: capturas REAIS do SketchUp Pro 2022 do dono (monitor LG 2560×1080) com o plugin 0.9.x aberto,
modelo RN+HOUSE (sala de jantar com painel ripado e "Noite Estrelada"). Sem Playwright.

- Antes/depois: render 3d0d247e (renders.input_url = captura 3072×2304, output_url = Quasar 2K 2368×1776),
  mesmo projeto e mesma câmera (conferido a olho: mesa, pendentes, quadro, coluna e parede de pedra alinhados).
- Painel: recorte 440×780 dos grabs (x 1838, y 146); e-mail do dono coberto com drawbox #f5f5f5 nos estados
  com o cabeçalho "Conectado" (00–06). Comparador nas posições 100 → 75 → 50 → 25 → 0 (SketchUp vira render).
- Viewport limpo: painel arrastado para cima da bandeja e devolvido ao lugar depois do grab.
- Texto: zona segura ok (hook em 250; sub do card d em 1590). Sem verde (accent:false). Sem emoji.
- Claims: "gerado em minutos" (aprovado no BRIEF); "plugin oficial · grátis · usa os nodes da sua conta" (mesma
  microcopy dos 6 Reels de 05/09); "a IA preserva o que a captura mostra" ecoa o texto do próprio painel.
- probe: 1080×1920, 30 fps, h264, 12,63 s, 2,8 MB.
- Estado do SketchUp ao final: painel no lugar, comparador desligado, sem render novo (0 nodes gastos).

**Regerado em 2026-09-09:** todos os quadros do painel agora vêm de `src/masked/` (pílula de saldo, "seu saldo dá para ~N renders" e "N nodes restantes" cobertos; custo "28 nodes" preservado). Time-lapse = `gerando-timelapse-sem-saldo.mp4`. Resolve a pendência de §6.
