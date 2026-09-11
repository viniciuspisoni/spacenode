# QA — R9 · print, render, vídeo (casa com piscina)

Data: 2026-09-04 · Slate: `alcance-organico/print-render-video-piscina` · Pilar: demonstracao-de-ferramentas

## Arquivos

| peça | caminho | duração | tamanho |
|---|---|---|---|
| orgânico | `marketing/output/2026-09-04-reel-print-render-video-piscina/2026-09-04-reel-print-render-video-piscina.mp4` | 12,00 s | 7,27 MB |
| pago (cutdown) | `marketing/output/2026-09-04-reel-print-render-video-piscina-ad/2026-09-04-reel-print-render-video-piscina-ad.mp4` | 9,00 s | 4,71 MB |

Ambas 1080×1920, 30 fps, H.264, yuv420p, sem áudio.

## Spec usado

A peça não é um encadeamento de segmentos do kit: a régua com "passo atrás" não é um
xfade (as duas imagens ficam **paradas** e só a borda anda) e o clipe do Animar precisa
ficar na **mesma caixa** dos stills para o corte still→vídeo ser invisível. Por isso a
"cama" visual é composta em ffmpeg dentro da própria pasta da peça e entra no kit como
**um único segmento `video` em `fit: "cover"`** (passthrough 1080×1920); o kit cuida dos
cards HTML, dos overlays em tempo global e do QA. Nada do kit compartilhado, do BRIEF ou
de `roteiros.mjs` foi tocado.

- `make-bed.mjs` (local) → `bed-organico.mp4` (12,00 s) e `bed-ad.mp4` (7,40 s)
- `build-spec.mjs` (local) → `spec-src.json` (orgânico) e `spec-ad-src.json` (pago)
- render: `node marketing/scripts/reel-spec.mjs marketing/output/2026-09-04-reel-print-render-video-piscina/spec-src.json` (idem para `spec-ad-src.json`)

Caixa única de imagem: **1080×1282 em y = 320–1602**, scale-to-fill lanczos, faixas
`#1a1a1a` acima e abaixo. Os três assets entram nessa mesma caixa — é o que torna o corte
still→vídeo invisível.

Assets (todos do acervo real, nada gerado para o Reel):
`0396-render-before.jpg` (print SketchUp, 733×867) → `0395-render-after.jpg` (render,
944×1120, job 61866b0a, 2026-04-29) → `0169-video-video_out.mp4` (1320×1568, 24 fps,
5,04 s, 2026-05-22; o frame 0 do clipe **é** o render #395/#170). Mesmo projeto, mesma
câmera, cadeia print→imagem→vídeo provada pelo banco.

## Timeline

### Orgânico (12,00 s)

| t | imagem | texto em tela |
|---|---|---|
| 0,00–1,20 | print #396 parado | `um print. uma imagem. um vídeo.` (entra em corte no frame 0) |
| 1,20–3,60 | régua com passo atrás: 0 → 78 % (1,2–2,4) → 40 % (2,4–2,9) → 100 % (2,9–3,6); imagens paradas, só a borda anda | idem |
| 3,60–5,60 | render #395 parado (sem zoompan — condição do corte invisível) | hook sai em corte em 4,00; apoio entra em 4,20: eyebrow `RENDER` + `piscina, deck e espreguiçadeiras / onde você desenhou.` |
| 5,60–10,64 | corte invisível para o clipe do Animar na mesma caixa: água se mexe, câmera sobe devagar | apoio sai em corte em 5,58 (antes do corte de imagem) |
| 10,64–12,00 | último frame congelado (`tpad`) | fecho de 9,00 a 12,00: logo monocromático + pílula `Comece grátis →` + `80 nodes grátis · sem cartão · em português` |

### Pago (9,00 s)

| t | imagem | texto em tela |
|---|---|---|
| 0,00–1,20 | print parado | `um print. uma imagem. um vídeo.` |
| 1,20–2,40 | régua **reta** (sem passo atrás) | idem, sai em 3,20 |
| 2,40–3,40 | render parado | — |
| 3,40–7,40 | clipe do Animar (4 s) | 3,90–7,00: eyebrow `ANIMAR` + `a água se mexe. / o projeto, não.` |
| 7,00–7,40 | fade | — |
| 7,00–9,00 | card final sólido `#1a1a1a` do kit | logo + `Comece grátis →` + microcopy |

## O que foi conferido frame a frame

Frames em `qa-frames/` (10 no orgânico, 8 no pago), lidos em resolução cheia, mais recortes
ampliados das regiões críticas.

Rodada 1 (render anterior) — **dois defeitos reais encontrados:**

1. **t=2,40 e t=2,90 · régua vazando na faixa de baixo.** O fio branco da régua era gerado
   com a altura do QUADRO (1920) e sobreposto em y=320, então corria de y=320 a y=1920:
   sobrava um fio branco de ~318 px **pendurado na faixa `#1a1a1a` abaixo da imagem**, e
   nenhum acima — assimétrico e sujo. Confirmado em recorte ampliado da região y=1400–1920.
   Mesmo defeito no cutdown pago (t=1,80).
   → Corrigido em `make-bed.mjs`: a régua passa a ter a altura da CAIXA (`BH` = 1282), então
   atravessa exatamente y=320–1602 e morre nas duas bordas da imagem.
2. **t=4,90 e t=5,55 (e t=5,50 no pago) · eyebrow ilegível.** O eyebrow herda `#a1a1a6` do
   kit (pensado para faixa sólida escura) e caía sobre a água clara da piscina, onde o scrim
   de baixo entregava só ~27 % de escurecimento naquela altura: `RENDER` / `ANIMAR` sumiam,
   parecendo artefato de compressão.
   → Corrigido no CSS do próprio spec (`build-spec.mjs`): scrim de baixo de 640 → 700 px com
   parada intermediária mais firme (0,62 → 0,70 em 64 %) e override local
   `.r9-sub .eyebrow { color:#f5f5f7 }` + fios a 0,42. O payoff branco continua igual.

Rodada 2 (render atual) — **conferido e aprovado:**

- **t=0,60** — hook `um print. uma imagem. um vídeo.` (6 palavras, minúsculas, ponto final,
  sem exclamação, sem "IA"), branco `#f5f5f7` sobre céu escuro + scrim de topo. Topo do texto
  em y≈372, base em y≈440: dentro de 220–1600. Legível e inteiro. O print lê como SketchUp
  (linhas duras, céu chapado, grama chapada) — a origem fica óbvia sem legenda explicativa.
- **t=2,40 / t=2,90** — régua nos dois extremos do passo atrás (78 % e 40 %). Geometria casada
  pixel a pixel nos dois lados do fio: laje do beiral, borda da piscina, deck e linha do vidro
  atravessam a borda sem degrau. Mesma câmera, mesmo projeto. **Fio branco agora começa e
  termina na imagem** — nada de branco nas faixas. O passo atrás cai exatamente sobre as três
  espreguiçadeiras, que é o ponto que a peça quer que o espectador confira.
- **t=3,80** — render inteiro com o hook ainda no ar; nenhum texto sobreposto ao outro, nenhum
  resto da régua.
- **t=4,90 / t=5,55** — card de apoio. `RENDER` agora legível, com os dois fios visíveis;
  `piscina, deck e espreguiçadeiras / onde você desenhou.` em duas linhas, sem quebra órfã,
  base em y≈1528 (dentro de 1600). Zero palavra verde na peça — permitido (o teto é uma).
- **t=5,55 vs t=5,80** — o corte still→vídeo, conferido lado a lado no recorte do deck/escada:
  mesmo enquadramento, mesmas espreguiçadeiras, mesma escada de inox, mesma cor. Sem flash
  claro, sem salto de escala perceptível, sem degrau de nitidez visível em movimento. O texto
  já saiu em 5,58, então nada troca junto com a imagem.
- **t=7,50** — meio do take: a água se mexe e a câmera sobe (o céu cresce); volumes, vidros e
  espreguiçadeiras estáveis. Nenhum texto no ar — o movimento é o assunto.
- **t=9,50 / t=11,50** — fecho. Logo monocromático, pílula branca `Comece grátis →` (CTA da
  lista aprovada) e microcopy `80 nodes grátis · sem cartão · em português`, todos legíveis
  sobre o céu escurecido pelo scrim de topo, inclusive depois do tilt-up que trouxe o telhado
  para a altura da microcopy. Bloco entre y≈352 e y≈640: dentro da zona segura. Sem URL na arte.
- **Banda** — 1080 de largura em todos os assets, sem esticar: os aspectos são 0,8454 (print),
  0,8429 (render) e 0,8418 (vídeo) contra 0,8424 da caixa; o scale-to-fill corta décimos de
  pixel, não deforma. Confirmado visualmente pela continuidade da geometria na régua.
- **Linguagem** — hook e apoio em minúsculas com ponto final, duas frases curtas, eyebrow
  uppercase com fios, pílula branca com seta, faixa `#1a1a1a`: mesmo padrão da landing no ar.

## Decisão sobre a versão paga

A versão paga **já existia** e foi **re-renderizada junto**, porque herdava o mesmo defeito da
régua (visível em t=1,80) e o mesmo eyebrow ilegível (t=5,50). Nada mais mudou: o corte de 9 s
segue com régua reta, hold de 1 s e card final sólido do kit — dentro do teto de 15 s do Meta,
som off, legenda embutida, sem URL na arte. Conferidos os 8 frames: t=0,60 (hook), t=1,80
(régua limpa), t=2,90 (render cheio), t=3,35 vs t=3,60 (corte invisível, agora com o par de
frames abraçando o corte em 3,40), t=5,50 e t=6,90 (`ANIMAR` legível, texto dentro da zona
segura), t=8,20 (card final sólido). Aprovada sem novas alterações.

Três ângulos de copy paga (fidelidade / prazo / apresentação) em `caption.txt`.

## Ressalvas e gating

- **Nada de "câmera parada", "sem alterações", "tempo real" ou "sem cortes".** O take do Animar
  faz um tilt-up lento (a casa desce ~8 % do quadro) e dura ~5 s. Toda a copy diz "a câmera sobe
  devagar" e "take curto"; nenhum texto promete duração.
- **Reinterpretações honestas entre o print e o render:** as espreguiçadeiras trocam de material
  (plástico preto → fibra trançada, mesma posição), as pedras soltas da grama viram vegetação e o
  arbusto vira planta em vaso. Por isso a copy só nomeia o que se sustenta — **piscina, deck,
  espreguiçadeiras, escada e balizadores** — e a legenda diz explicitamente "o material mudou, a
  posição não". Não escrever "idêntico".
- **Motor/provedor não é citado** em nenhuma peça nem em nenhuma variação de anúncio. O clipe é de
  maio/2026 e os presets atuais roteiam para outro motor — detalhe de stack é proibido em conteúdo
  público, e afirmar qualquer coisa aqui envelheceria mal.
- **Origem do print:** o print e o render são geração real do dono na plataforma (job 61866b0a,
  2026-04-29) e o modelo é dele. A peça diz "print do SketchUp" — **gate: confirmar com o dono que
  o modelo desta casa é autoral** antes de publicar. Se houver qualquer dúvida de autoria, trocar
  "do SketchUp" por "do seu modelo" na legenda (a arte não nomeia o software).
- **Plugin de SketchUp não é citado** — nem na arte, nem na legenda, nem nos anúncios. O `.rbz`
  ainda não foi assinado no portal da Trimble e o dono ainda não fez o smoke pago da 0.7; a peça
  fala em subir o print, que é o fluxo web já validado.
- **Sem claim inventado:** nenhuma porcentagem, nenhum número de horas, nenhuma contagem de
  clientes. "em minutos" é o único claim de tempo (aprovado pelo dono) e aparece só em texto
  corrido, nunca na arte. "80 nodes grátis · sem cartão" bate com o default de `profiles.credits`
  em produção. Nada de "Lumens", nada de plano Office, nada de oferta de 50 % (encerrada em 31/08).
- **Anti-repetição do slate:** mesma casa de R1 e R10 — publicar com ≥11 dias de distância de R1;
  R10 fica para a semana 5+.
- **Ordem de publicação:** peça orgânica primeiro; a versão paga do slate é retargeting (júri deu
  conversão 6), então subir A e B para quem já visitou/cadastrou e C para frio.

## Arquivos de trabalho locais (não são do kit compartilhado)

`make-bed.mjs`, `build-spec.mjs` e os backups `make-bed.mjs.bak` / `build-spec.mjs.bak` (estado
antes das correções desta rodada) ficam na pasta da peça. `bed-organico.mp4` e `bed-ad.mp4` são
intermediários — podem ser apagados depois que os mp4 finais forem aprovados.
