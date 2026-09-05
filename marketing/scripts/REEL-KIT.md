# REEL KIT — como montar um Reel a partir de um spec JSON

Criado em 2026-09-04 para produzir Reels a partir do acervo real do dono (renders,
vistas de Spaces, edições, vídeos do Animar). Generaliza o `reel-impacto.mjs`.

```bash
node marketing/scripts/reel-spec.mjs caminho/spec.json --plan   # imprime a timeline (sem renderizar)
node marketing/scripts/reel-spec.mjs caminho/spec.json          # renderiza (10–30s por Reel)
node marketing/scripts/reel-spec.mjs --exemplo                  # spec de exemplo completo
```

Saída em `marketing/output/<slug>/`: `<slug>.mp4` (1080×1920, 30fps, H.264 crf 18,
yuv420p, sem áudio), `qa-frames/*.png`, `probe.json`, `spec.json` (cópia do spec).

## Spec

```jsonc
{
  "slug": "2026-09-04-reel-<nome>",
  "band": { "aspect": 1.7778 },          // opcional; default = menor aspecto dos stills/vídeos em modo band (limitado a 4:3–16:9)
  "segments": [
    { "type": "still", "src": "C:/…/antes.png", "dur": 1.5, "fit": "band", "kenburns": [1, 1.0], "brightness": -0.14 },
    { "type": "still", "src": "C:/…/depois.png", "dur": 4.5, "fit": "band", "kenburns": [1, 1.08] },
    { "type": "video", "src": "C:/…/animar.mp4", "dur": 4, "start": 0, "speed": 1, "fit": "band" },
    { "type": "card",  "card": "final", "dur": 1.2 }
  ],
  "transitions": [                          // exatamente segments.length - 1 entradas
    { "type": "wipeleft", "dur": 0.5, "ruler": true },   // wipeleft/wiperight aceitam ruler (régua branca)
    { "type": "fade", "dur": 0.4 },
    { "type": "cut" }
  ],
  "cards": {
    "scrim":  { "layout": "scrim" },                                   // escurece topo/base fora da banda (camada própria!)
    "antes":  { "layout": "hook-sub", "hook": "Texto ≤8 palavras", "eyebrow": "Modelo SketchUp" },
    "depois": { "layout": "hook-sub", "hook": "…", "sub": "Apoio com {uma} palavra verde" },
    "chip":   { "layout": "chip", "text": "Animar · vídeo do render" },   // pílula logo abaixo da banda
    "abre":   { "layout": "statement", "transparent": false, "eyebrow": "Spaces", "big": "Frase<br>grande", "small": "apoio" },
    "final":  { "layout": "final", "cta": "Teste com um projeto real" }  // logo monocromático + CTA + spacenode.app
  },
  "overlays": [                             // TEMPO GLOBAL em segundos (use --plan para ver onde cada segmento começa)
    { "card": "scrim", "from": 0, "to": 9.8 },
    { "card": "antes", "from": 0, "to": 2.2 },
    { "card": "depois", "from": 2.2, "to": 9.8 }
  ],
  "qa": [0.6, 1.45, 3.0, 5.4]               // opcional; default = meio de cada segmento
}
```

- `type: "split"` (exige `"band": {"split": true}` no spec — vale para a peça inteira):
  `{ "type": "split", "top": "antes.png", "bottom": "depois.png", "dur": 5, "kenburns": [1, 1.05] }`
  → duas bandas de 520px empilhadas (antes em cima, depois embaixo), mesma câmera, Ken Burns
  sincronizado, fio branco entre elas. Card `{"layout": "split-labels", "top": "Modelo SketchUp", "bottom": "Render"}`
  põe as etiquetas. Hook em 56px/2 linhas. Ideal para o pilar fidelidade ("mesma esquadria").
  Num spec split, stills em `fit: "band"` usam a mesma geometria total (banda de 1048px) — prefira
  fechar a peça com um `still` cover/band do "depois" só se o aspecto couber; senão vá direto ao card final.
- `fit: "band"` (default): imagem inteira numa banda de 1080 de largura, centrada, sobre
  a própria imagem desfocada. Preserva o enquadramento do arquiteto. Use para qualquer
  paisagem.
- `fit: "cover"`: full-bleed 9:16 (recorte central). Só para assets já em retrato (vídeos
  1080×1920 do Animar, vistas em retrato) ou quando o recorte central é o assunto.
- Vídeo em retrato (aspect < 1) vira cover automaticamente.
- `kenburns: [de, até]` zoom linear na banda (máx. 1.08). `[1, 1]` = parado (bom para o "antes").
- Texto: `{palavra}` = a única palavra em verde (#30D158). Máx. 1 por card. Sem emoji.
- Todos os cards da mesma peça compartilham a geometria da banda (o hook fica 76px acima
  da banda; o sub 64px abaixo). `bandGeometry` levanta erro se invadir a zona segura.

## Regras que NÃO mudaram (BRIEF.md)

- O wipe atravessa a IMAGEM, nunca o TEXTO: texto sempre em `overlays` (global), trocando
  em corte. Nunca ponha hook e payoff visíveis ao mesmo tempo na mesma altura.
- O scrim é overlay próprio, sempre presente enquanto houver texto.
- "Antes" na tela no máximo ~1,5s. Terminar com o card final (logo + CTA), 1,2s.
- Zona segura: nenhum texto acima de y=220 nem abaixo de y=1600.
- Antes/depois SEMPRE do mesmo projeto e mesma câmera. Nunca gerar imagem nova para o
  Reel: só o que está no acervo.
- QA obrigatório: abrir os `qa-frames/` (Read) e conferir texto legível, zona segura,
  verde só na palavra marcada, sem flash claro no corte, banda alinhada no wipe.

## Linguagem atual (set/2026) — já embutida nos cards
- Cards sólidos usam `#1a1a1a` (faixa escura da landing). `"theme": "light"` em `statement`/`hook-sub`/`final`
  espelha as faixas claras (#fafafa, texto #1a1a1a, verde #30b46c).
- `[trecho]` dentro de qualquer texto vira cinza terciário (é a 2ª linha do título do hero:
  `"big": "Visualização arquitetônica<br>[que respeita seu projeto.]"`). `{palavra}` continua sendo o verde.
- `eyebrow` sai uppercase 0.22em com fios de 0.5px dos dois lados, como na landing.
- `final`: logo monocromático + pílula `CTA →` + microcopy (default "80 nodes grátis · sem cartão · em português";
  `"micro": ""` remove). Sem URL na arte por padrão (`"url": "spacenode.app"` liga). Títulos em minúsculas com ponto final ("três passos. do estudo à apresentação.").

## Modos adicionados em 2026-09-04 (tarde)
- `fit: "contain"` (still): a imagem INTEIRA dentro da zona segura (1080 × até 1380), qualquer aspecto —
  é o modo para retratos 3:4 / 4:5 sem recorte. Dois stills contain com o mesmo aspecto ficam alinhados
  pixel a pixel (bom para wipe). O texto vai por cima com `hook-fixed`.
- `layout: "hook-fixed"`: hook em posição fixa (`top`, default 300) e/ou `sub`/`eyebrow` ancorados na base
  (`bottom`, default 360), independentes da banda; `"scrim": true` escurece topo e base para garantir contraste
  sobre imagem clara. `size` (hook, default 60) e `subSize` (default 38). Use em contain/cover.
- `pan: [x0, x1]` (still em `fit: "cover"`, imagem paisagem): a janela 9:16 desliza da fração x0 à x1 da
  largura sobrando (0 = borda esquerda, 1 = direita). Combina com `kenburns`.
- Régua (`ruler: true`) agora também em `wipeup` / `wipedown` (linha horizontal).
- Validação: `transitions` precisa ter exatamente segments−1 entradas e cada xfade precisa de `dur` ≤ duração
  dos dois segmentos vizinhos (o kit levanta erro explicando). Tempos de `qa` além do total são truncados.

## Gotchas de execução
- O diretório de trabalho em `%TEMP%/spacenode-marketing/<slug>/` é **apagado no início de cada
  render**. Um render interrompido no meio deixava segmentos truncados que faziam a execução
  seguinte falhar com `Error splitting the input into NAL units` ou `cards/x.png: No such file`.
- `concat` seguido de `xfade` exige `settb=AVTB` nos dois ramos (o kit já faz) — sem isso o
  ffmpeg recusa juntar timebases diferentes (1/1000000 vs 1/15360).
- Se um agente/processo for morto durante a escrita, o `.mp4` final pode ficar corrompido mesmo
  existindo em disco. Confira com `ffprobe` antes de dar a peça por pronta:
  `ffprobe -v error -show_entries format=duration -of csv=p=0 arquivo.mp4`.
- `pan: [x0, x1]` e `panY: [y0, y1]` agora valem em qualquer `still` (band, contain, cover): centro do
  zoom em fração da folga (0 = esquerda/topo, 0.5 = centro, 1 = direita/base). Com `kenburns: [6, 1]`
  + `pan: [0.74, 0.5]` + `panY: [0.88, 0.5]` a peça abre num detalhe de textura e afasta até a imagem
  inteira — o "mistério" do Reel "o que é isso?".
- `accent: false` no topo do spec neutraliza o verde de `{palavra}` em todos os cards (rodada orgânica
  de 05/09 foi inteira sem verde, a pedido do dono).

## Specs versionados (`marketing/specs/`)
- Caminhos de imagem usam `$ACERVO` (raiz do acervo baixado, fora do repo — `SPACENODE_ACERVO`,
  default `../acervo`) e `$REPO` (raiz do repositório). `reel-spec.mjs` expande os dois ao ler o spec.
- O acervo é gerado por `marketing/scripts/acervo/inventory.mjs --download` + `pairs.mjs`; os estados
  do painel do plugin por `marketing/scripts/plugin/capture-states.mjs`. Ver `marketing/specs/README.md`.
