# QA — R2 · um print, cinco climas (2026-09-04)

## Arquivos e uso (qual serve pra quê)
| Arquivo | Duração | Uso |
|---|---|---|
| `marketing/output/2026-09-04-reel-um-print-cinco-climas/2026-09-04-reel-um-print-cinco-climas.mp4` | 10,00 s | **Orgânico: feed (Reel) e Stories.** Fecho como overlay sobre a noite (o loop noite→print vira gancho de novo). Legenda: `caption.txt`, bloco de cima. Em Stories, o sticker de link fica sobre o fecho — o CTA já está impresso na arte, não precisa de outro texto. |
| `marketing/output/2026-09-04-reel-um-print-cinco-climas-ad/2026-09-04-reel-um-print-cinco-climas-ad.mp4` | 8,50 s | **Anúncio pago (Meta · SIGN_UP · som off).** ≤15 s, mensagem única, card `final` sólido de 1,2 s no fim para o botão do anúncio pousar sobre fundo liso. Textos do anúncio: `caption.txt`, bloco "VERSÃO PAGA". **Não publicar no orgânico** — o hook fica fixo os 7,3 s e o fecho é o card sólido do kit. |

- Cada pasta tem `spec-src.json` (fonte), `spec.json` (cópia renderizada), `probe.json`, `qa-sheet.jpg`, `qa-frames/`.
- Gerador dos dois specs (scratchpad, fora do repo): `scratchpad/build-spec-r2.mjs` — inlina o SVG do logo no card html do fecho. **Os ajustes desta rodada foram feitos direto nos `spec-src.json`**; regerar pelo script sobrescreve as correções de overlay.
- 1080×1920 · 30 fps · H.264 crf 18 · yuv420p · sem áudio · 2,71 MB / 2,29 MB.

## Assets (originais de scratchpad/assets/, todos 2026-04-27, vega/2k, "Preservar original")
#514 print hidden-line (1342×833, "antes") · #517 dia · #515 chuva · #519 entardecer · #507 hora azul · #511 noite (todos 1312×816). Conforme o slate: #513 e #521 fora.

## Spec — como o roteiro do slate foi traduzido para o kit
- `band.aspect = 1.5` → faixa 1080×720 em y 600–1320 (crop central 1224×816 em x=44 nos renders; 1250×833 no print). Exatamente o recorte 3:2 do slate; carro inteiro e as duas árvores dentro.
- Seis `still` em `fit: band`, todos com `cut` (sem xfade). Durações 1,2 / 1,3 / 1,3 / 1,3 / 1,3 / 3,6 = 10,00 s.
- **Zoompan contínuo 1,00→1,04 sem reset:** o kit só tem Ken Burns por segmento, então os `kenburns` foram encadeados (fim de um = início do próximo, proporcional à duração): [1, 1.0048] [1.0048, 1.01] [1.01, 1.0152] [1.0152, 1.0204] [1.0204, 1.0256] [1.0256, 1.04]. Como o zoompan é linear por trecho e os trechos são contíguos, o resultado é uma única câmera avançando devagar pelos seis cortes.
- **Fundo desfocado pré-nivelado por imagem** (`brightness`): print −0,58 · dia −0,42 · chuva −0,22 · entardecer −0,36 · hora azul −0,18 · noite −0,06. Medido nos frames (luminância média 0–255 do topo/base, fora do texto): 26,9/23,5 · 25,6/25,1 · 28,1/23,5 · 26,9/23,5 · 24,1/23,5 · 23,7/26,4 → variação ≤4,6, sem flash em nenhum corte.
- Cards (linguagem da landing, minúsculas com ponto): `hook-sub` "um print. {cinco} climas." (única palavra verde da peça; 4 palavras, peso 500) · pílulas de clima MODELO / DIA / CHUVA / ENTARDECER / HORA AZUL / NOITE como cards `html` no estilo `lbl` do kit (20 px, 500, uppercase 0,14em, fundo rgba(10,10,10,.62), borda hairline), canto inferior esquerdo da faixa (x 24, y 1256) — são a legenda embutida para som off; "MODELO" é o rótulo dos comparadores da landing · apoio `hook-sub.sub` "mesma câmera. mesmo carro. mesma escada." abaixo da faixa (y≈1384) · fecho = card `html` transparente: véu rgba(26,26,26,.86) sobre a noite + logo monocromático + pílula branca "Renderize seu projeto →" + microcopy "80 nodes grátis · sem cartão · em português" em #a1a1a6.
- Fora do kit (resolvido no spec, sem tocar na lib): (1) pílula no canto da faixa — o `chip` do kit é centrado abaixo da faixa e `split-labels` exige split; (2) fecho como overlay sobre a imagem (o slate manda fechar sobre #511 para o loop noite→print virar gancho de novo; o `final` do kit é sólido) — logo inlinado no body do card html; (3) contraste do fecho — véu subido para 0,86 e microcopy forçada a #a1a1a6 por `style` inline (a classe `.micro` da lib é #8a8a8f e a lib não se toca).

## Timeline (orgânico, tempo global)
| t | imagem | overlay |
|---|---|---|
| 0,00–1,20 | #514 print | scrim · hook · pílula MODELO (0 → 1,166) |
| 1,20–2,50 | #517 dia | hook (até 2,5) · DIA (1,2 → 2,466) |
| 2,50–3,80 | #515 chuva | CHUVA (2,5 → 3,766) |
| 3,80–5,10 | #519 entardecer | ENTARDECER (3,8 → 5,066) |
| 5,10–6,40 | #507 hora azul | HORA AZUL (5,1 → 6,366) |
| 6,40–8,40 | #511 noite | NOITE (6,4 → 8,366) · apoio (6,8 → 8,366) |
| 8,40–10,00 | #511 noite | fecho (logo + CTA + microcopy); pílula e apoio já saíram no frame 250 |

Pago: 1,0 s por clima (print → dia → chuva → entardecer → hora azul), noite 2,3 s, card `final` sólido 1,2 s ("Comece grátis →" + microcopy 80 nodes) = 8,50 s. Hook fixo do frame 0 a 7,266 s; apoio na noite "gerado em minutos. sem remodelar." (5,3 → 7,266); zoompan encadeado 1,00→1,03. Mensagem única; o botão do anúncio fica sobre o card final.

## Conferido frame a frame (frames extraídos do MP4 entregue, não só do qa-frames/)
- **Método desta rodada:** além dos `qa` do spec, extraí do próprio MP4 os quatro frames em volta de cada corte (n−2, n−1, n, n+1) e li a zona da pílula (crop x16–316, y1248–1312). Orgânico: n = 36 / 75 / 114 / 153 / 192 / 252. Pago: n = 30 / 60 / 90 / 120 / 150 / 219. A folha `qa-sheet.jpg` sozinha não pega esse defeito — foi assim que a 1ª entrega passou.
- **Uma pílula por frame, em todos os cortes.** Orgânico: MODELO até n34 · DIA n36–n73 · CHUVA n75–n112 · ENTARDECER n114–n151 · HORA AZUL n153–n190 · NOITE n193–n250 · fecho a partir de n252. Pago: MODELO até n28 · DIA n30–n58 · CHUVA n60–n88 · ENTARDECER n90–n118 · HORA AZUL n120–n148 · NOITE n150–n217 · card final a partir de n219. Nenhum frame com duas pílulas, nenhum rótulo em desacordo com a imagem, nenhuma pílula/apoio/hook por baixo do fecho (o n219 do pago, que na entrega anterior trazia hook + NOITE + apoio sobre o card, agora é o card final limpo).
- **Efeito colateral aceito:** entre uma pílula e a seguinte fica 1 frame sem rótulo (2 frames no corte hora azul→noite do orgânico, n191–n192 — sem rótulo, nunca com o errado). É o preço de recuar o `to`; ver Ressalvas. A 1/30 s, em cima de um corte duro de imagem, não se percebe — e é muito melhor que duas palavras sobrepostas.
- Zona segura: hook em y≈460–520, apoio em y≈1384–1440, pílulas em y 1256–1296, fecho centrado (logo y≈840, CTA ≈1015, micro ≈1120). Tudo entre y=220 e y=1600.
- Alinhamento nos cortes (correlação de perfis de borda dentro da faixa): print→dia x 0 / y 0 px; dia→chuva −1/−1; dia→entardecer −3/−1; dia→hora azul −4/0; dia→noite +3/+1. Lâmina de concreto, quina da laje, escada e carro ficam no lugar — "mesma câmera. mesmo carro. mesma escada." se sustenta.
- Sem flash claro: fundo desfocado nivelado (tabela acima); o corte print branco→dia é o mais forte, mas só dentro da faixa (é o gancho); fecho entra por corte sobre a noite já escura; no pago, noite→card #1a1a1a por corte (escuro→escuro).
- Verde só em "cinco" (#30d158); pílulas, apoio, CTA e microcopy sem verde. Banda 3:2 não esticada (1224×816 → 1080×720, mesmo aspecto). Sem vídeo do Animar nesta peça (só stills).
- Eixos do SketchUp (azul vertical, tracejado vermelho) visíveis no frame 0 — insumo honesto, não retocado, conforme o slate.
- Linguagem: hook/apoio/fecho em minúsculas com ponto, sem exclamação; CTAs da lista aprovada ("Renderize seu projeto" no orgânico, "Comece grátis" no pago); claims só "gerado em minutos" e "80 nodes grátis · sem cartão".
- Tempos de `qa` agora caem **em cima de cada corte e no frame anterior**: orgânico 0,5 · 1,166 · 1,2 · 2,466 · 2,5 · 3,766 · 3,8 · 5,066 · 5,1 · 6,366 · 6,4 · 8,366 · 8,4 · 9,2; pago 0,5 · 0,966 · 1,0 · 1,966 · 2,0 · 2,966 · 3,0 · 3,966 · 4,0 · 4,966 · 5,0 · 7,266 · 7,3 · 8,1. A lista antiga (1,17 / 1,23 …) tangenciava o corte e deixou o defeito passar.

## Rodadas
- Orgânico: 2 renderizações — a 1ª tinha sobreposição de pílulas de 1 frame em todos os cortes (limites inclusivos no `enable` dos overlays); corrigido encerrando cada pílula 1 frame antes.
- Pago: 3 renderizações — a 1ª falhou no kit (`concat` seguido de `xfade` para o card final: "timebase 1/1000000 do not match 1/15360"), resolvido no spec trocando o fade final por `cut` e ajustando a noite para 2,3 s (total 8,50 s); a 2ª saiu com a mesma sobreposição de 1 frame do orgânico **e** com hook + pílula NOITE + apoio desenhados por cima do card final em n219; a 3ª (esta) corrige as duas coisas.

## Ressalvas / gating
- **Limitação do kit registrada:** uma sequência só de `cut` não aceita um `fade`/`wipe` no fim (concat→xfade quebra por timebase). Vale corrigir na lib (`settb`/`setpts` antes do xfade) numa rodada futura; aqui contornado com corte.
- **Limitação do kit registrada (nova — foi a causa do reprovado):** overlays com `to` igual ao `from` do seguinte acendem juntos por 1 frame (limite inclusivo no `enable`: a lib emite `between(t,from,to)`, `lib/reel-kit.mjs:437`). Enquanto a lib não usar meio-aberto `[from, to)`, todo `to` de rótulo sequencial deve ser recuado 1 frame no spec. Vale para qualquer overlay que termine onde outro começa — inclusive apoio e hook contra o card de fecho (foi o que sujou o n219 do pago).
  - Detalhe medido nesta rodada, para quem for arrumar a lib: recuar só o `to` deixa 1 frame sem rótulo — e às vezes 2, porque o lado do `from` também arredonda para cima quando o `t` do frame cai um epsilon abaixo do valor literal (aconteceu em 6,4: NOITE só acende em n193). O conserto frame-exato é ancorar `from` e `to` no **meio do frame** (corte − 1/60 s) em vez de no corte; não foi aplicado aqui porque a ordem de correção manda manter os `from` como estão.
- Divergências honestas entre os cinco renders, já previstas no slate: #517 tem três pessoas; o gradil varia (tela/chapa perfurada); a árvore da esquerda muda de porte. A peça diz "mesma câmera. mesmo carro. mesma escada.", nunca "idêntico" nem "mesma imagem relit".
- Fecho como overlay (não card sólido de 1,2 s): decisão do slate para o loop noite→print; se o dono preferir o padrão do BRIEF, basta trocar o último overlay por `{type:"card", card:"final"}`.
- Microcopy do fecho orgânico: véu subido de 0,80 para **0,86** e a linha "80 nodes grátis · sem cartão · em português" de #8a8a8f para **#a1a1a6** (inline no card html). Segue sendo o menor texto da peça (24 px), mas agora aguenta a tela do celular.
- Gate do dono: autoria do modelo .skp (sem marca d'água em #514). Sem gating técnico; pode publicar.
