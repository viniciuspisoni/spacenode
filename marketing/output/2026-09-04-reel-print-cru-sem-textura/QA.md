# QA — Reel `2026-09-04-reel-print-cru-sem-textura` (R15 · objeção "meu print é cru")

**Resultado:** aprovado na **3ª renderização** (a 2ª foi REPROVADA na revisão — ver "Rodadas").
9,00 s · 1080×1920 · 30 fps · H.264 crf 18 · yuv420p · sem áudio · 1,14 MB · banda 1080×608 @ y=656.

**Arquivos e uso**

| arquivo | uso |
|---|---|
| `2026-09-04-reel-print-cru-sem-textura.mp4` | **feed (Reel orgânico)**, **stories** e **anúncio (Meta, SIGN_UP)** — é um único master, ver abaixo |
| `caption.txt` | legenda do feed + bloco "qual arquivo serve a qual uso" + 3 copies pagas (A/B/C) |
| `spec-src.json` | fonte editável do Reel (o que se edita e re-renderiza) |
| `spec.json` | cópia normalizada gravada pelo kit; não editar |
| `qa-frames/`, `qa-sheet.jpg`, `probe.json` | evidência desta rodada |
| `2026-09-04-reel-print-cru-sem-textura-ad/` | **não existe e não deve ser criada** — a peça orgânica já cumpre o anúncio (≤15 s, muda, CTA embutido) |

O slug ainda diz "sem-textura" porque é o identificador do briefing (R15) e já está referenciado no índice de Reels; o texto em tela e a legenda **não** usam mais essa expressão.

## Escolha do par
- Candidatos do briefing: #23→#22 (quarto, job 03bd0c1d, 2026-09-03, vega/2k) e reserva #25→#24 (casa, mesma data).
- Ambos os originais são ~2,6:1 (3072×1193 / 3328×1280); a banda do kit trava em 16:9 e recorta o centro (mantém ~69 % da largura).
  - **Quarto (escolhido):** o recorte 16:9 preserva cama, criados-mudos, armário, porta-espelho e a parede que recebe o sol no render; perde só a mesa/cadeira da esquerda e a maior parte do vaso sanitário à direita.
  - Casa (reserva, descartada): o recorte 16:9 amputa as duas pontas do edifício.
  - Split empilhado avaliado e descartado: com 2,6:1 o kit esticaria a imagem (banda 1080×520 = 2,08:1) e o briefing pede wipe.
- Mesmo projeto / mesma câmera confirmado: mesmo `refs.id` nos dois assets; cama, porta-espelho, armário e vaso nas mesmas posições no print e no render.

## Timeline (tempo global)
| t | segmento | overlay de texto |
|---|---|---|
| 0,00–1,60 | still #23 (modelo), banda 16:9, Ken Burns parado, backdrop **-0,52** | hook **"modelo cru."** + eyebrow MODELO (card `modelo`) |
| 1,00–1,60 | xfade **wipeleft** 0,6 s, **sem régua** (#23 → #22) | idem (texto não é wipado; scrim em camada própria) |
| 1,60–2,80 | still #22 (render), Ken Burns 1,00→1,05, backdrop -0,24 | hook 2 linhas **"modelo cru. / [render com material.]"** + eyebrow RENDER (card `render`) |
| 2,80–7,10 | idem | + apoio "gerado em {minutos}. geometria preservada." (card `renderSub`) |
| 7,10–7,40 | fade 0,3 s para o card final | sem texto |
| 7,40–9,00 | card final #1a1a1a: logo monocromático + pílula "Comece grátis →" + "80 nodes grátis · sem cartão · em português" | — |

"Antes" na tela: 1,6 s contando o wipe (1,0 s inteiro + 0,6 s de wipe).

## Conferido frame a frame (3ª rodada — `qa-sheet.jpg` + `qa-frames/`)
- **t=0,50** hook "modelo cru." em 1 linha, Geist 500 72 px, topo em y≈430 (> 220). Eyebrow MODELO em y≈1340. Backdrop escuro atrás do texto.
- **t=1,30 (meio do wipe)** **nenhuma régua na tela**: o hook está inteiro e legível, sem fio cortando a tipografia. A costura do wipe é a própria borda entre as duas imagens dentro da banda; armário, cabeceira, painel de madeira e linha do piso coincidem dos dois lados.
- **Backdrop no meio do wipe — medido, não estimado.** YAVG de blocos 400×300 acima da banda: esquerda (modelo, -0,52) **51,5** vs direita (render, -0,24) **42,7**. A diferença **não** é uma costura do wipe: em t=0,50, que é 100 % modelo, a mesma medição dá 51,5 / 44,2, e em t=1,70, 100 % render, dá 55,9 / 46,3 — as duas imagens têm o **mesmo** gradiente natural esquerda→direita (~9 níveis de luma), porque o quarto é mais claro do lado esquerdo. Comparando o mesmo lado entre as duas fontes: esquerda modelo 51,5 vs render 55,9 (Δ4,4); direita modelo 44,2 vs render 42,7 (Δ1,5). Os dois backdrops estão casados dentro de ~2–4/255. O que resta é uma rampa suave comum às duas metades — não o "cinza médio contra quase preto" da rodada anterior.
- **t=1,70 (troca de texto pós-wipe)** linha 1 do hook **não se move** (cards `html` com `top:418px` fixo) e a 2ª linha "render com material." entra em cinza terciário; eyebrow troca MODELO → RENDER na mesma posição.
- **t=3,20 (apoio entra)** "gerado em minutos. geometria preservada." em 1 linha, 42 px, verde #30d158 **só** em "minutos"; base do texto ≈1430 (< 1600).
- **t=6,00 vs t=1,70** Ken Burns visível (cama ligeiramente maior aos 6 s) — leve, como pedido.
- **t=7,25** fade a meio: imagem escurecendo sob logo + pílula; nenhum texto do hook sobreposto.
- **t=8,40** card final: logo, "Comece grátis →", microcopy padrão, sem URL na arte.
- Banda não esticada (recorte central 2121×1193 / 2276×1280 → 16:9 exato antes do Ken Burns). Nenhum texto fora da zona segura 220–1600. Sem emoji, sem exclamação, minúsculas com ponto, hook ≤8 palavras por linha, ≤1 palavra verde por card.
- Linguagem = landing: eyebrows MODELO/RENDER como nos comparadores, hook 500 + 2ª linha em cinza terciário como o hero, apoio "gerado em minutos" (claim aprovado) + "geometria preservada", CTA da lista.

## Rodadas
1. Primeira renderização: backdrop do "antes" claro demais atrás do hook.
2. brightness do antes -0,14 → -0,38, do depois -0,20 → -0,24. Peça montada com o hook "sem textura no modelo." e régua ligada. **REPROVADA na revisão** por três motivos, todos procedentes:
   - claim falso: o print #23 **tem** textura (piso em tábua corrida, madeira na cama, nos criados-mudos e no armário, palhinha visível no espelho) — o que falta é parede, teto, luz e acabamento. A frase era desmentida pelo próprio frame em 0,5 s;
   - a régua do wipe (fio branco de altura total) cortava o hook no meio da palavra "textura" em t=1,30;
   - este QA afirmava "mesmo nível de escuro fora da banda" e "sem flash claro", o que não se sustentava no frame.
3. **Esta rodada.** Quatro correções, todas dentro do próprio spec (nenhum arquivo compartilhado do kit foi tocado):
   - `cards.modelo.body`: "sem textura no modelo." → **"modelo cru."**;
   - `cards.render.body` e `cards.renderSub.body`: → **"modelo cru. / [render com material.]"** (5 palavras, paralelo, minúsculas com ponto, 2ª linha em cinza terciário);
   - `transitions[0].ruler`: `true` → **`false`** — ver "Régua" abaixo;
   - `segments[0].brightness`: -0,38 → **-0,52**.
   Reconferido em t=1,30 depois de re-renderizar, com medição de luma (acima).

## Régua: por que ela saiu em vez de ser clipada
A régua é desenhada pelo kit compartilhado (`marketing/scripts/lib/reel-kit.mjs`, bloco `if (rulerExprs.length)`): uma barra branca de **6 × 1920 px** aplicada por `overlay` **depois** de todos os overlays de card, como último filtro antes do `format=yuv420p`. Como ela entra por último, nenhum card do spec (nem o `scrim`) consegue mascará-la, e o spec não expõe altura nem `y` da régua. Confinar o fio à banda (y=656→1264, altura 608, como o comparador da landing) exigiria editar o kit — proibido nesta tarefa. Portanto: **`"ruler": false`**. O `wipeleft` sozinho lê bem — a fronteira entre print e render é a própria borda das duas imagens dentro da banda, e o frame t=1,30 confirma a leitura.

*Registro para o kit (a fazer por quem for dono do arquivo compartilhado): a régua deveria aceitar `y`/`h`, ou herdar a geometria da banda, em vez de assumir a altura total do quadro.*

## Versão paga
A peça orgânica tem 9 s (≤ 15 s), sem áudio, com hook, apoio e CTA embutidos na arte → **o mesmo mp4 serve como anúncio**; a pasta `-ad` não foi criada. As 3 copies (fidelidade / prazo / apresentação) estão em `caption.txt`, todas com 1ª linha do texto primário ≤125 caracteres, título ≤40 e descrição ≤30, botão SIGN_UP.

O título da copy A passou de "Modelo cru. Render com material." para **"Mesma câmera. Mesma geometria."** (30 caracteres): depois da correção do hook, o título anterior repetia literalmente o texto em tela; o novo soma argumento e é verificável no próprio vídeo, que é um antes/depois da mesma câmera.

## Ressalvas / gating
- **Costura do colchão (menor, não bloqueante).** Em t=1,30 o topo do colchão do modelo e o do render têm ~15 px de desvio vertical na costura; cama, criado-mudo, armário, painel de madeira e vaso batem. Vem dos aspectos de origem diferentes (2,575 vs 2,600) — o kit alinha pelo centro da banda, então o erro cresce em direção às bordas. **Regra para peças futuras:** ao montar wipe com par de aspecto desigual, medir o desvio no meio do wipe; acima de ~20 px, preferir `fit: "contain"` (alinha pixel a pixel quando os dois stills têm o mesmo aspecto) ou recortar os dois originais para o mesmo aspecto numa subpasta `src/` do próprio Reel antes de montar.
- Vaso sanitário do banheiro anexo aparece parcialmente na borda direita da banda (é o projeto real; ficou fora da área de leitura). O kit não tem recorte deslocado — só mudaria com asset alternativo.
- Autoria/permissão do modelo do quarto: geração real do dono na plataforma (2026-09-03); confirmar permissão de uso da imagem do usuário antes de subir no pago.
- Legenda e copies pagas em caixa de frase (padrão do slate); texto em tela em minúsculas com ponto (padrão da landing).
- Nada do kit compartilhado foi editado. Os cards de texto usam `layout: "html"` (não `hook-sub`) para ancorar hook e eyebrow pelo topo — evita o salto da linha 1 quando a 2ª linha entra.
