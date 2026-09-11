# QA — 2026-09-09-reel-plugin-camera-que-voce-enquadrou

Tutorial do plugin: aba Fotografia — a camera do render e a camera do modelo.
Fonte: capturas REAIS do SketchUp Pro 2022 do dono (07/09), versao `src/masked/` (saldo coberto).

- seg 0 su-43-center: viewport real do SketchUp (modelo RN+HOUSE, sala de jantar), eyebrow "modelo · sketchup".
- seg 1 panel-07-fotografia: Proporcao (4:3), Lente (35 mm), Altura do olho (Em pé · 1,60 m), Verticais,
  Guias de composicao (Terços), Espelhos e vidros — tudo como esta no painel.
- seg 2 crop-07-guias-espelhos (recorte nativo 440×210): guias + "Marcar espelho / Marcar vidro" + a frase do
  proprio painel "A IA preserva o que vê: proporção, lente, altura do olho e verticais retas viram parte do render."
- seg 3 panel-01-apos-capturar: a captura com as guias de tercos desenhadas no preview ("a captura já sai com as guias").
- seg 4 sala-de71-depois: render de716672, mesma camera da captura.
- Claims: "espelhos e vidros marcados" = recurso presente no painel (v0.9.0); a captura mostra "Nenhuma face
  marcada", entao o hook nao afirma que este render usou espelho marcado. "a IA preserva o que a captura
  mostra" ecoa o texto do painel.
- Sem verde, sem emoji, zona segura ok. probe: 1080×1920, 30 fps, h264, 12,17 s, 2,4 MB.
