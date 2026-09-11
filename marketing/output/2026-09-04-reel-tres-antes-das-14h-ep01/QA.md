# QA — R8 · três antes das 14h · ep. 01 (2026-09-04)

Rodada 2: peça REPROVADA na revisão em 04/09 e re-renderizada com as correções listadas em
"Correções da revisão" abaixo. Os dois mp4 (esta pasta e a pasta `-ad`) são os arquivos válidos.

## Arquivos e uso (qual peça serve a qual canal)
| uso | arquivo | specs |
|---|---|---|
| **Feed (Reels orgânico)** e **Stories** | `marketing/output/2026-09-04-reel-tres-antes-das-14h-ep01/2026-09-04-reel-tres-antes-das-14h-ep01.mp4` | 1080×1920, 30 fps, H.264 yuv420p, sem áudio, 11,50 s, 1,83 MB |
| **Anúncio (Meta · som off · SIGN_UP/LEARN_MORE)** | `marketing/output/2026-09-04-reel-tres-antes-das-14h-ep01-ad/2026-09-04-reel-tres-antes-das-14h-ep01-ad.mp4` | 1080×1920, 30 fps, H.264 yuv420p, sem áudio, 9,50 s, 1,16 MB |

- Stories usa o MESMO arquivo do feed, sem recorte: todo o texto vive entre y=270 e y=1586, fora da
  interface do Stories (topo/base ~250 px). Link vai no sticker (a arte não traz URL).
- O anúncio é o cutdown (sem recap, sem eyebrow de episódio) e usa as copies A/B/C do `caption.txt`,
  nunca a legenda orgânica.
- Specs: `spec-src.json` em cada pasta (o kit copia para `spec.json`). Legenda, copies pagas e o mapa
  arquivo→uso também estão em `caption.txt` (esta pasta).
- Rodadas de render: 2 (orgânico) + 2 (pago) — a 2ª é a das correções da revisão.

## Assets (acervo, geração real do dono, 2026-04-28, vega/2k)
- #430 `assets/0430-render-before.jpg` (print, 739×835) → #429 (01 · sanca quente),
  #431 (02 · cimento queimado e piso escuro), #435 (03 · mármore polido), todos 976×1104.
  #433 e #427 excluídos como manda o slate.

## Correções da revisão (rodada 2)
1. **Claim não verificável.** `caption.txt` linha 3: "um print do SketchUp" → **"um print do modelo"**.
   O banco não registra software de origem de #430 (renders.json / assets.json / vistas.json não têm o
   campo), então a atribuição não é comprovável. A formulação nova é a da landing ("a partir de modelos,
   prints e referências"). `#sketchup` continua **fora** das hashtags. Só volta a "print do SketchUp"
   (e aí `#sketchup` entra) se o dono confirmar por escrito a origem de #430.
2. **Etiqueta 02 ambígua.** Card `lbl02` nos DOIS specs: "02 · cimento queimado" →
   **"02 · cimento queimado e piso escuro"**, mesma ordem da legenda. Arte e legenda passam a dizer a
   mesma coisa: o cimento queimado é a parede atrás das cortinas, o piso escuro é o que domina o quadro.
   Medido no frame renderizado: a pílula vai de x=54 a x≈620 (imagem em x 18–1062) — folga de ~440 px.
3. **Piscada de 1 frame no corte 01→02 (orgânico).** `lbl01` `to` 3.58 → **3.57** e `lbl02` `from` 3.6 → **3.58**.
4. **Piscada de 1 frame no corte 02→03 (pago).** `lbl02` `to` 4.38 → **4.37** e `lbl03` `from` 4.4 → **4.38**.
5. **Copies pagas.** `caption.txt`: variante C "Título: Três leituras da mesma sala" →
   **"Título: três leituras da mesma sala."** (28 caracteres, limite 40); variantes B e C
   "Descrição: Cadastro grátis, sem cartão" → **"Descrição: cadastro grátis, sem cartão."**
   (28 caracteres, limite 30), alinhadas com a descrição da A.
6. **Gating da versão paga** (autoria/permissão do modelo): ver "Ressalvas / gating" — é decisão do dono,
   não conserto de arquivo, e segue **aberto**.

### Desvio dos números pedidos na revisão (3,56 / 4,36) — e por quê
A revisão pediu `lbl01.to = 3.56` (orgânico) e `lbl02.to = 4.36` (pago). Aplicados ao pé da letra, esses
valores criariam **uma piscada nova um frame antes**: a 30 fps o frame 107 cai em t=3,5667 e o frame 131 em
t=4,3667 — ambos DENTRO da folga 3,56–3,58 / 4,36–4,38, ou seja, ficariam sem etiqueta nenhuma. Usei
**3,57** e **4,37**: mesmo efeito pretendido (a folga passa a não conter frame algum — entre 3,5667 e 3,60
não existe frame, idem entre 4,3667 e 4,40) e a regra "nunca duas etiquetas no mesmo frame" continua de pé.
Conferido frame a frame depois de renderizar (ver abaixo).

### Defeito adicional encontrado nesta rodada (não estava na revisão)
Ao conferir TODOS os cortes frame a frame, o **frame 222 (t=7,40, início do recap)** também estava sem
etiqueta — mesmo arredondamento binário de 3,6 e 4,4. Corrigido junto: `lbl03` `to` 7.38 → **7.37** e
`lbl01` (recap) `from` 7.4 → **7.38**. Os cortes em 1,4 / 5,5 / 7,8 / 8,2 (orgânico) e 1,4 / 2,9 (pago)
já estavam limpos e não foram tocados.

## Como o kit foi adaptado (registrar, pedido do briefing)
O slate pede a imagem em y≈220–1441 com apoio+CTA numa faixa sólida abaixo (sem scrim sobre o mármore). O
`fit: "contain"` do kit centra a imagem (ficaria em y 350–1570, sem espaço para texto abaixo). Solução
dentro do spec, sem tocar na lib:
- `canvas/*.png`: cada original foi colocado, sem recorte, num canvas 2160×2760 (= 2× do contain máximo
  1080×1380): imagem 2088×2360 no topo, margens laterais de 36 px e faixa sólida #1a1a1a de 400 px embaixo.
  Escala do print 739→2088 (lanczos) e dos renders 976→2088; o kit reescala para 2160×2760 (identidade). Em
  1×: imagem 1044×1180 em x 18–1062 / y 270–1450; faixa 1450–1650. Os quatro canvases têm a MESMA geometria
  → wipe alinhado ao pixel.
- Card `frame` (html): retângulos sólidos #1a1a1a em y 0–270 e 1450–1920, cobrindo o fundo desfocado do kit.
- Card `hook` (html): scrim gradiente só sobre o topo da imagem (270→870) + eyebrow do kit (`.eyebrow`, fios
  de 0,5 px) em y≈314 + `.hook` (Geist 500, 60 px, 2 linhas) em y 378–513.
- Cards `lbl01/02/03` (html): etiqueta no estilo `lbl` do kit (uppercase 22 px, 0,14em, fundo
  rgba(26,26,26,0.8), fio 0.22) no canto inferior esquerdo da imagem com inset 36 px (y 1368–1414).
- Card `cta` (html): apoio "mesmo print. gerado em {minutos}." (34 px, 400) em y 1470 + pílula
  "Comece agora →" (27 px, 500) em y 1528–1586, na faixa sólida. Verde só em "minutos".
- **Fronteiras de overlay**: `between()` do ffmpeg é inclusivo E o t do frame sofre arredondamento binário
  (3,6 / 4,4 / 7,4 chegam como 3,5999…). Regra desta peça: o `to` de uma etiqueta e o `from` da seguinte
  caem numa folga que **não contém frame algum** (os frames são múltiplos de 1/30). Sempre conferir frame a
  frame depois de renderizar — a folha de QA por tempo não pega isso.
- Ken Burns desligado ([1,1]) em todos os stills: com zoom, a base da imagem invadiria a faixa do CTA e a
  assinatura da série é o corte seco sobre a mesma câmera.

## Timeline (orgânico, 11,5 s)
| t | segmento | texto |
|---|---|---|
| 0,00–1,40 | print #430 (parado) | eyebrow TRÊS ANTES DAS 14H · EP. 01 + "reunião às 14h. / três acabamentos." (sai em corte aos 1,40) |
| 1,40–1,70 | xfade wipeleft 0,3 s com régua → #429 | etiqueta 01 · sanca quente entra aos 1,40 |
| 1,70–3,60 | hold #429 | 01 · sanca quente |
| 3,60–5,50 | corte seco → #431 | 02 · cimento queimado e piso escuro |
| 5,50–7,40 | corte seco → #435 | 03 · mármore polido |
| 7,40–7,80 / 7,80–8,20 / 8,20– | recap 3×0,4 s: #429 → #431 → #435 | 01 / 02 / 03 |
| 8,60–10,00 | hold #435 | apoio "mesmo print. gerado em {minutos}." + pílula "Comece agora →" na faixa sólida |
| 10,00–11,50 | card final do kit | logo mono + "Comece agora →" + "80 nodes grátis · sem cartão · em português"; sem URL |

Timeline (pago, 9,5 s): print 0–1,4 (hook sem eyebrow) → wipe → 01 1,4–2,9 → 02 2,9–4,4 →
03 4,4–8,0 (apoio+CTA a partir de 5,5) → card final 8,0–9,5. Etiquetas 01/02/03 mantidas como legenda
embutida (som off).

## O que foi conferido frame a frame
**Rodada 2 — cortes, etiqueta por etiqueta.** Frames extraídos direto do mp4 final, faixa y 1310–1460
(onde vive a etiqueta), lidos em tira:
- Orgânico, frames 41–44 (wipe 1,4): 41 = print sem etiqueta (ainda no hook), 42–44 = 01 com etiqueta e
  régua. Limpo.
- Orgânico, frames 106–109 (corte 3,6): 106–107 = imagem 01 com etiqueta 01; **108 = imagem 02 com etiqueta
  02** (era o frame nu da reprovação); 109 = 02. Nenhum frame com duas etiquetas.
- Orgânico, frames 163–166 (5,5), 220–223 (recap 7,4), 232–235 (7,8), 244–247 (8,2): em todos, a etiqueta
  troca no mesmo frame em que a imagem troca. **222 agora tem etiqueta 01** (defeito extra achado e
  corrigido nesta rodada).
- Pago, frames 41–44 (1,4), 85–88 (2,9) e 130–133 (4,4): **132 = imagem 03 com etiqueta 03** (era o frame nu
  da reprovação). Demais cortes limpos.
- Resultado: nenhum frame das duas peças, entre 1,4 s e o card final, fica sem etiqueta ou com duas.

**Rodada 1 — segue valendo (a arte não mudou fora do texto da etiqueta 02).**
- `qa-sheet.jpg` (9 frames: 0,7 / 1,55 / 2,5 / 4,5 / 6,5 / 7,6 / 8,0 / 9,2 / 10,7) e em tamanho real t0.70,
  t1.55, t7.60, t9.20, t10.70; no pago, a folha (7 frames) e t0.70.
- 0,70 s: eyebrow e hook inteiros, legíveis sobre o teto do print com o scrim; topo do texto em y≈314 (> 220).
- 1,55 s (meio do wipe): régua em x≈480; à esquerda o print, à direita a opção 01 — mesa, cadeiras, pendentes
  e cortinas batem ao pixel. Hook já saiu; etiqueta 01 presente.
- 2,5 / 4,5 / 6,5 s: etiquetas 01/02/03 inteiras, contraste ok sobre tapete/piso escuro/mármore. Cortes secos
  sem frame claro intermediário. Em 4,5 s a etiqueta nova ("02 · CIMENTO QUEIMADO E PISO ESCURO") termina em
  x≈620, dentro da imagem, e fecha com o que está na tela (parede de concreto + piso escuro).
- 7,6 / 8,0 s: recap com etiquetas acompanhando (01 aos 7,6; 02 aos 8,0).
- 9,2 s: apoio e pílula centrados na faixa sólida; base da pílula em y≈1586 (< 1600). Verde apenas em
  "minutos" (#30d158). Nenhum scrim sobre o mármore.
- 10,7 s: card final do kit, sem URL.
- Zona segura: nada acima de y=270 nem abaixo de y=1586. Banda sem esticar (aspecto 0,884 preservado).
  Linguagem: minúsculas com ponto, duas frases curtas, eyebrow uppercase 0,22em com fios, hook Geist 500,
  CTA da lista aprovada ("Comece agora"), microcopy padrão.
- Não há vídeo do Animar nesta peça (só stills), então o teste de movimento não se aplica.

## Ressalvas / gating
- **ABERTO — bloqueia a versão paga:** autoria/permissão do modelo da sala de jantar (#430 → #429/#431/#435),
  `prohibited §6`. O anúncio só sobe com `permission_status = granted` confirmado **por escrito** pelo dono.
  É decisão do dono, não conserto de arquivo. O orgânico não depende disso (acervo da própria conta), mas se
  a permissão vier negada as duas peças caem.
- **RESOLVIDO nesta rodada:** origem SketchUp de #430 não está no banco → a legenda diz "um print do modelo"
  e `#sketchup` não é usado. Só reabrir com confirmação escrita do dono.
- Legenda na versão sem promessa de cadência ("toda segunda" não aparece).
- "reunião às 14h" e "o cliente pediu" são dispositivo narrativo; nenhum tempo total além de "gerado em
  minutos". Piso, parede e tapete mudam entre as opções — a copy diz "três leituras de acabamento", nunca
  "só trocar o acabamento".
- Trilha: arquivo sem áudio; escolher no app do IG (cortes em 1,4 / 3,6 / 5,5 / 7,4 / 7,8 / 8,2 s pensados
  para beat).
- Anti-repetição: mesmo ângulo de produtividade de R4 — publicar ≥3 semanas depois (slate: Qui 01/10).
