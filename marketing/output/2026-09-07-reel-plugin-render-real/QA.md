# QA — 2026-09-07-reel-plugin-render-real

Versão com a GERAÇÃO REAL gravada no SketchUp Pro 2022 do dono (autorizada: 28 nodes, saldo 6291 → 6263).
Render de716672 (Quasar 2K, Sala de Estar), gerado às 21:32 pelo botão "Gerar render" do painel.

- Time-lapse (seg 2, 4,4 s): 53 frames escolhidos de 327 grabs (0,6 s de intervalo) entre o início do overlay
  (f6.9 s) e o resultado (f151 s), passo 5 (≈3,4 s reais por frame) a 12 fps + 8 frames de hold no resultado.
  Frames 223–224 (flash claro enquanto o <img> carregava) descartados. Geometria idêntica ao contain inset 200
  (664×1180 em 208,370 sobre #1a1a1a), então a troca still → vídeo → still não pula.
- Fases visíveis no time-lapse: Renovando sessão → Capturando a vista → Enviando o projeto → Analisando
  composição → Aplicando fotometria → Gerando versão final → Ajustando iluminação → Refinando materiais →
  resultado. Contador chega a ~2:27 (ModelArk com cauda longa nesta geração).
- Comparador regravado com o render NOVO (100 → 50 → 0) para não misturar com o render anterior.
- Antes/depois em alta = renders.input_url (3072×2304) e output_url (2368×1776) de de716672, mesma câmera.
- E-mail do dono coberto em todos os quadros do painel (drawbox #f5f5f5).
- Texto na zona segura; sem verde; sem emoji. Claims iguais à v1.
- probe: 1080×1920, 30 fps, h264, 14,97 s, 2,9 MB.
- Estado final do SketchUp: painel no lugar com o render novo, comparador desligado.

**Regerado em 2026-09-09:** todos os quadros do painel agora vêm de `src/masked/` (pílula de saldo, "seu saldo dá para ~N renders" e "N nodes restantes" cobertos; custo "28 nodes" preservado). Time-lapse = `gerando-timelapse-sem-saldo.mp4`. Resolve a pendência de §6.
