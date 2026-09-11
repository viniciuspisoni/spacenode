# QA — 2026-09-04-reel-zoom-cozinha-cada-peca

R7 · `fidelidade-tecnica/zoom-cozinha-cada-peca` — "forno, cafeteira, torneira. mesma posição."
Fechamento da peça em 2026-09-04 (render feito em sessão anterior; esta rodada é QA + legenda + ficha).

## Arquivos

- Orgânica: `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-zoom-cozinha-cada-peca/2026-09-04-reel-zoom-cozinha-cada-peca.mp4`
  — 1080×1920, 30 fps, H.264, yuv420p, sem áudio, **12,00 s**, 1,93 MB.
- Paga (cutdown): `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-zoom-cozinha-cada-peca-ad/2026-09-04-reel-zoom-cozinha-cada-peca-ad.mp4`
  — mesmas specs, **10,00 s**, 1,36 MB.
- Spec: `spec-src.json` (cópia efetiva em `spec.json`) · Probe: `probe.json` · Frames: `qa-frames/` · Folha: `qa-sheet.jpg`
- Legenda: `caption.txt`

Comando de referência: `cd C:/Users/Pisoni/spacenode && node marketing/scripts/reel-spec.mjs <spec>`
**Não foi re-renderizado** (nem na rodada de fechamento, nem na rodada de correção de 04/09 pós-reprovação):
os achados da revisão são de **copy**, não de arte. O texto em tela ("forno, cafeteira, torneira. mesma posição."
e "o que você modelou, onde você modelou.") fala só de posição e sobrevive aos achados; os quatro marcadores
caem sobre as quatro peças certas nos dois estados. As correções foram feitas em `caption.txt` e neste QA.

## Qual arquivo serve a qual uso

| uso | arquivo | duração | copy |
|---|---|---|---|
| **Feed (Reels)** e **Stories** — orgânico | `2026-09-04-reel-zoom-cozinha-cada-peca/2026-09-04-reel-zoom-cozinha-cada-peca.mp4` | 12,00 s | bloco **PUBLICAR** de `caption.txt` (legenda + 5 hashtags) |
| **Anúncio** (Meta Ads, Reels/Stories, som off) | `2026-09-04-reel-zoom-cozinha-cada-peca-ad/2026-09-04-reel-zoom-cozinha-cada-peca-ad.mp4` | 10,00 s | bloco **[INTERNO] VERSÃO PAGA** de `caption.txt` (A / B / C) |

A mesma peça serve feed e stories (1080×1920, texto entre y=220 e y=1600 — nada cai atrás da UI de stories).
O `caption.txt` traz um separador explícito: **só o bloco acima de "FIM DO QUE SE PUBLICA" vai para o Instagram.**
O bloco pago fica no mesmo arquivo, marcado `[INTERNO — NÃO PUBLICAR]`, porque é a ficha de veiculação da peça.

## Assets (acervo real do dono, nada gerado para o Reel)

- **#426** `thumbs/0426-render-before.jpg` → print do SketchUp (731×837), pré-processado em
  `scratchpad/prep_r7/print-728x837.png` (upscale ~1,48× por ffmpeg, sem passar pelo Ampliar — alterar o "antes" seria desonesto).
- **#425** `scratchpad/assets/0425-render-after.jpg` → render (960×1104).
- Recortes do split: `prep_r7/print-split.png` (400×251) e `prep_r7/render-split.png` (528×331),
  mesmas coordenadas normalizadas nos dois originais (x 0–58 %, y 38–62 %).
- Mesmo projeto, mesma câmera, mesmo par de R4 (anti-repetição: publicar ≥19 dias depois de R4, pilar diferente).

## Timeline efetiva (probe)

Banda de referência 1080×1048 @ y=436; stills em `contain` 1080×1242 @ y=340.

| t (s) | segmento | conteúdo | movimento |
|---|---|---|---|
| 0,0–1,2 | still #426 | print do SketchUp (guias amarelas no piso) | parado `[1, 1]` |
| 1,2–4,5 | still #425 | render, mesmo enquadramento | parado `[1, 1]` |
| 4,5–8,0 | split | MODELO em cima / RENDER embaixo, mesmo recorte | push sincronizado `[1, 1.04]` |
| 8,0–12,0 | still #425 | render inteiro | Ken Burns `[1, 1.05]` |

Transições: **três cortes secos** (nenhum xfade → sem risco de flash claro).

Overlays (tempo global):

| card | de | até | o quê |
|---|---|---|---|
| `scrimTop` (html) | 0,0 | 4,5 | gradiente #1a1a1a 62 % atrás da headline |
| `hook` (hook-fixed, top 390, 60 px) | 0,0 | 4,5 | "forno, cafeteira, torneira. mesma {posição}." |
| `m1`…`m4` (html) | 0,15 / 0,30 / 0,45 / 0,60 | 4,0 | marcadores ⌀52 px hairline: forno, cafeteira, torneira, lustre |
| `mFade1` / `mFade2` | 4,034–4,15 / 4,167–4,30 | — | saída dos marcadores em dois passos (92 % → 50 % → 22 %) |
| `scrimBase` (html) | 1,6 | 9,0 | gradiente na base |
| `apoio` (hook-fixed, bottom 360, 38 px) | 1,6 | 9,0 | "o que você modelou, onde você modelou." |
| `labels` (html) | 4,5 | 8,0 | pílulas MODELO (y 456) / RENDER (y 984), 0,18em |
| `cta` (html) | 9,8 | 12,0 | scrim 70 % + logo monocromático + pílula "Comece grátis →" + microcopy |

## Recursos resolvidos dentro do spec (registro exigido pelo kit)

O kit não tem primitiva de marcador, de scrim parcial nem de etiqueta livre. Tudo foi feito com
`layout: "html"` **dentro deste spec** — nenhum arquivo compartilhado do repo (`lib/reel-kit.mjs`,
`roteiros.mjs`, `BRIEF.md`, docs) foi tocado:

- `m1`–`m4`, `mFade1`, `mFade2`: círculos hairline 2,5 px, sem preenchimento, sem glow, com
  duplo contorno preto de 1 px para contraste tanto sobre o armário escuro quanto sobre o mármore claro.
- `scrimTop` / `scrimBase`: gradientes próprios (o `scrim` do kit escurece topo/base da *banda*, e aqui
  os stills são `contain`, não `band`).
- `labels`: pílulas MODELO / RENDER (o layout `split-labels` do kit ancora na banda `split`, que não
  cobre os segmentos `contain`).
- `cta`: card final como **overlay sobre o render**, não card preto — decisão do roteiro (R7).
- Pré-processamento em `scratchpad/prep_r7/` (upscale do print + os dois recortes do split), feito com
  ffmpeg fora do kit.

## Conferência frame a frame (Read nos PNGs, não só na folha)

Zona segura verificada: **nenhum pixel de texto acima de y=220 nem abaixo de y=1600**.
Hook ocupa ~y 390–520; apoio ~y 1530–1580; pílulas do split y 456 e 984; bloco do CTA ~y 800–1130.

- **t=0,40 s** (folha) — print no ar, headline completa, marcadores do forno e da cafeteira já dentro; cascata funcionando.
- **t=0,90 s** (PNG) — print do SketchUp confirmado (guias amarelas no piso, cortina reta, ilha sem luz).
  Os quatro marcadores estão em cima do **forno superior**, da **cafeteira**, da **torneira** e do **lustre**.
  Headline em duas linhas, inteira, legível sobre o forro cinza graças ao `scrimTop`. Verde **só** em "posição".
- **t=1,50 s** (folha) — corte seco para o render feito; nenhum frame claro entre os dois (corte, não xfade);
  os marcadores continuam exatamente nas mesmas coordenadas de tela — é a prova da peça.
- **t=3,00 s** (PNG) — render #425. Confirmado objeto a objeto: marcador 1 no forno duplo, 2 na cafeteira branca,
  3 na torneira da ilha, 4 no lustre espiral aceso. Apoio "o que você modelou, onde você modelou." legível
  sobre o piso escuro. Hook e apoio nunca se sobrepõem (topo × base).
- **t=4,10 s** (PNG) — marcadores em 50 % (`mFade1`): saída suave, sem pop. Imagem intacta.
- **t=4,70 s** (PNG) — início do split, zoom 1,00. Metades **alinhadas**: forno em x≈125–270 nas duas,
  cafeteira em x≈320, torneira em x≈683; a coifa cai a 163 px do topo do MODELO e 168 px do topo do RENDER (Δ≈5 px,
  dentro dos 4–6 px tolerados no blend). Fio hairline branco entre as metades. Pílulas MODELO / RENDER legíveis. Divergência de conteúdo registrada: backsplash central metálico no render e bica da torneira redesenhada — não afeta o alinhamento nem o claim de posição.
- **t=6,20 s** (PNG) — meio do push (≈1,02). Continua alinhado; nada de banda esticada (as duas metades
  compartilham a geometria de `splitGeometry()`, 1080 de largura útil ≈877 px, 2×518 px de altura + gap). Divergência de conteúdo registrada: backsplash central metálico no render e bica da torneira redesenhada — não afeta o alinhamento nem o claim de posição.
- **t=7,90 s** (folha) — fim do push (1,04), ainda alinhado; labels e apoio no lugar.
- **t=8,60 s** (folha) — corte seco de volta ao render inteiro, sem flash; apoio ainda no ar (sai em 9,0).
- **t=9,40 s** (PNG) — render limpo, sem texto nenhum, respiro antes do CTA. Ken Burns discreto.
- **t=10,80 s** (PNG) — card final: logo monocromático + pílula branca "Comece grátis →" + microcopy
  "80 nodes grátis · sem cartão · em português". Tudo no terço central, dentro da zona segura, sem URL na arte.

Checklist da casa: texto inteiro e legível ✔ · zona segura ✔ · antes/depois do mesmo projeto e mesma câmera ✔ ·
alinhamento no split ✔ · sem flash claro nos cortes ✔ · **uma** palavra verde ("posição") ✔ · banda não esticada ✔ ·
hook em minúsculas com ponto final, 6 palavras, sem exclamação ✔ · "IA" não é o assunto ✔ · sem emoji ✔.

Ressalva estética (não corrigida de propósito): entre 4,5 e 8,0 s a moldura do split deixa ~435 px de fundo
escuro no topo. É a geometria do `split` do kit com recorte 16:10; alargar o recorte borraria a cafeteira
(decisão 2 do slate). Não é defeito — não motivou re-render.

Pendência estética para a PRÓXIMA rodada de render (não aplicada agora, para não re-renderizar por motivo cosmético):
mover `m1` de `left:28px` para `left:44px` em `spec-src.json` — os três blocos `cards.m1`, `cards.mFade1` e
`cards.mFade2` usam a mesma coordenada. A 28 px da borda o marcador do forno lê como recorte acidental no celular.

## Versão paga

Conferida a `qa-sheet.jpg` da pasta `-ad` (frames 0,90 / 1,50 / 3,00 / 6,20 / 7,90 / 9,00).
É o mesmo spec com três diferenças, exatamente o cutdown previsto no slate:

- segmento 4 cai de 4,0 s para 2,0 s e o Ken Burns de 1,05 para 1,03;
- `scrimBase` / `apoio` saem em 8,0 s (em vez de 9,0);
- `cta` entra em **8,0 s** e vai até 10,0 — total 10,00 s (≤15 s, requisito de anúncio).

Nada mais mudou: marcadores, split, hook e alinhamento são os mesmos frames já aprovados acima.
**Decisão: aprovada como está, sem re-render.** Os três ângulos de copy (fidelidade / prazo / apresentação)
estão em `caption.txt`, bloco "[INTERNO] VERSÃO PAGA"; botão SIGN_UP em A e B, LEARN_MORE em C.

**Correções de copy da revisão de 04/09 (só texto, o mp4 não mudou):**
- Título A: "seu modelo, iluminado. não redesenhado." → "seu modelo, iluminado. peças no lugar." (38 de 40).
- Texto primário C: "…mesma ilha, mesma torneira, mesmo lustre." → "…mesma ilha, mesmo lustre, cada peça no lugar." (109).
  Motivo: a bica da torneira foi redesenhada no render (ver §"Ressalvas e gating") — "mesma torneira" era falso
  no nível de geometria; "cada peça no lugar" reivindica só posição, que é o que o frame prova.

## Ressalvas e gating

- **Material e geometria NÃO são preservados em dois pontos visíveis no split:** o trecho central do backsplash
  sai de mármore preto (modelo) para painel metálico escovado (render), e a bica da torneira sai de angular para
  curva. Ambos ficam lado a lado entre 4,5 e 8,0 s. Esta peça só pode reivindicar POSIÇÃO — nenhuma linha de copy,
  orgânica ou paga, pode dizer que material ou geometria foram mantidos.
- **Permissão do modelo / origem do print:** o par #426→#425 é geração real do dono na plataforma, mas o
  modelo de SketchUp é de projeto de cliente. Publicar só com o aval do dono sobre autoria/uso da imagem.
- **Não prometer que a luz é do modelo.** O render clareou o forro, acendeu spots e lustre, colocou luz de janela,
  fita de LED sob os armários e dois vasos extras — é interpretação. A legenda diz isso explicitamente
  ("Luz, acabamento e reflexo são leitura do render; a posição das peças, não." — linha reescrita em 04/09 para
  cobrir também acabamento e reflexo, não só a luz).
- **O absoluto "não é redesenho" saiu da copy publicada** (revisão de 04/09). Além do backsplash e da torneira,
  o render acrescentou fita de LED sob os armários, trocou os dois potes brancos por panelas metálicas na bancada
  e mudou a vegetação da janela. Falamos dos **quatro** objetos marcados, nunca de "todos os objetos", e nunca
  como regra do produto.
- **O print já era texturizado** (mármore, lustre e cafeteira modelados). Não vender como "do clay ao render".
- **Plugin de SketchUp não é citado** — o .rbz ainda não foi assinado na Trimble e o dono não fez o smoke pago
  da 0.7. SketchUp aparece só como insumo (#sketchup e o rótulo MODELO).
- **Sem números inventados:** o único número da peça é "80 nodes grátis" (valor vigente, `lib/plans.ts`).
  Sem oferta de 50 % (encerrada em 31/08), sem "Lumens", sem plano Office, sem % ou horas economizadas.
- **Sem metadados do banco** na arte (engine, resolução, id, prompt do usuário).
- **Anti-repetição:** mesmo par de R4. Publicar com ≥19 dias de distância e pilar diferente.
