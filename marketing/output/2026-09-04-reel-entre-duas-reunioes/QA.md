# QA · R4 "entre duas reuniões" (2026-09-04)

## Spec
- `marketing/output/2026-09-04-reel-entre-duas-reunioes/spec-src.json` (cópia do kit em `spec.json`); renderizado com `node marketing/scripts/reel-spec.mjs` — **1 rodada**, aprovado no primeiro render.
- Assets: #426 `scratchpad/assets/0426-render-before.jpg` (731×837, print do modelo) → #425 `scratchpad/assets/0425-render-after.jpg` (960×1104, vega/2k, Cozinha, 2026-04-28, job 9b53068f).
- Pré-recorte exigido pelo slate: #426 → crop central 728×837 → scale 960×1104 (`src/0426-before-960x1104.jpg`), para os dois stills caírem no MESMO contain 1080×1242 @ y=340 (sem degrau na régua). Alinhamento conferido em `src/qa-blend50.jpg` (blend 50 %: lustre, quina da ilha e cadeiras sem fantasma) e `src/qa-halfhalf.jpg`. #425 entra ORIGINAL, sem reencode.
- Saída: `2026-09-04-reel-entre-duas-reunioes.mp4` — 1080×1920, 30 fps, H.264 yuv420p, 11,00 s, 2,33 MB, sem áudio.

## Timeline (tempo global)
| t | segmento | texto (overlay) |
|---|---|---|
| 0,00–1,95 | still #426 contain, Ken Burns 1,00→1,03, backdrop -0,34 | 0–1,5: **reunião de manhã: / o print.** (hook-fixed top 380, 64 px, peso 500) |
| 1,50–1,95 | xfade **wipedown 0,45 s + régua** (teto → lustre acende → ilha) | sem texto (troca em corte) |
| 1,50–8,50 | still #425 contain, Ken Burns 1,024→1,12 (=1,03 no fim do wipe) , backdrop -0,24 | 1,95–8,5: **reunião da tarde: / a imagem.** · 3,0–8,5 (base 350): sem fila. mesmo print, mesma câmera, {minutos}. |
| 8,50–11,00 | card final #1a1a1a | logo monocromático + pílula "Comece agora →" + "80 nodes grátis · sem cartão · em português"; sem URL |
- Scrim: card `html` próprio (topo 720 px / base 500 px, gradientes #1a1a1a) ligado 0–8,5 s — contínuo, para não haver pop de luminosidade quando o hook some no corte de 1,5 s. Base curta para a ilha não escurecer (o `scrim:true` do hook-fixed teria 780 px).

## Conferido frame a frame (qa-frames/)
- t0,50 / t1,50: hook inteiro, 2 linhas, sobre o teto liso do print, dentro da zona segura (texto entre y≈395 e 520); print reconhecível (grade amarela do SketchUp no piso).
- t1,72 (meio do wipe): régua horizontal em y≈1000; cordões do lustre, ilha e cadeiras continuam sem degrau entre render (acima) e print (abaixo); sem texto.
- t1,95: fim do wipe, hook "reunião da tarde" entra em corte, sem flash claro (backdrops escuros dos dois lados).
- t2,50 / t3,50 / t5,00 / t7,00: hook + apoio legíveis; apoio numa linha só, base em y≈1570 (< 1600); verde só em "minutos"; ilha e lustre sem escurecimento.
- t8,40: zoom 1,12 sobre fonte de 960 px — nitidez aceitável, sem amolecer visivelmente.
- t9,50: card final centrado, CTA da lista aprovada, microcopy factual, sem URL na arte.
- Banda: modo contain, imagem inteira sem esticar (1080×1242 = 960×1104 × 1,294).
- Linguagem: minúsculas com ponto, duas frases curtas, sem exclamação, hook ≤8 palavras, uma palavra verde por card, CTA "Comece agora" da lista.

## Versão paga
- `marketing/output/2026-09-04-reel-entre-duas-reunioes-ad/2026-09-04-reel-entre-duas-reunioes-ad.mp4` — 8,50 s, 1,59 MB. Cutdown definido no slate: corta a cena 6,0–8,5 s e entra no card final aos 6 s. Ken Burns de #425 recalibrado (1,0244→1,08 em 4,5 s) para continuar batendo 1,03 no fim do wipe. Mesmos cards e textos; QA em t0,5 / 1,5 / 1,72 / 1,95 / 2,5 / 3,5 / 5,9 / 7,2 conferido na `qa-sheet.jpg`.
- A peça orgânica (11 s) também cabe em ≤15 s e pode rodar como anúncio; o cutdown existe para o CTA aparecer antes do primeiro drop de atenção.

## Ressalvas / gating (do slate)
- Gate 1: confirmar que #426 saiu do SketchUp — se não, trocar "print do SketchUp" por "print do modelo" na legenda/copy paga e #sketchup → #visualizacaoarquitetonica (a arte não cita SketchUp, não muda).
- Gate 2: autoria/permissão do modelo da cozinha (#426) antes de veiculação paga.
- Sem horários na arte nem na copy ("em minutos" é o claim aprovado); "sem fila" descreve o nosso fluxo. Render reinterpretou cortina (cinza→taupe) e montantes da porta — a copy diz "onde você modelou" (posição), nunca "como você modelou".
- Anti-repetição: mesmo par de R7 — publicar com ≥19 dias de distância e pilar diferente.
- Botão SIGN_UP depende do evento de cadastro no Pixel; até lá, LEARN_MORE.
- Pendência do kit anotada no slate (patch `url: ""`) NÃO é necessária: o card final já omite o domínio quando `url` não é passado (`c.url ? … : ''`).
- Arquivos fora do kit: nenhum arquivo compartilhado do repo foi editado; o pré-recorte vive em `src/` dentro da pasta de saída.
