# QA — 2026-09-04-reel-spaces-cenas-viram-um-space

Pilar: **coerencia-entre-angulos** (2º diferencial da landing — "Coerência entre vistas" /
"cenas viram um Space"). Peça renderizada em sessão anterior; esta sessão fez o QA visual,
a decisão de mídia paga e a redação. **Não houve re-render** (0 rodadas).

## Arquivos

| item | caminho |
|---|---|
| mp4 | `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-spaces-cenas-viram-um-space/2026-09-04-reel-spaces-cenas-viram-um-space.mp4` |
| spec | `.../spec-src.json` (idêntico a `spec.json`, a cópia que o kit grava) |
| legenda | `.../caption.txt` |
| frames | `.../qa-frames/*.png` + `.../qa-sheet.jpg` |
| frames extras deste QA | `C:/Users/Pisoni/AppData/Local/Temp/claude/C--Users-Pisoni-spacenode/19988837-c924-4b30-b28f-e9e7dc6696fa/scratchpad/qa-extra/sheet-extra.jpg` |

Render: `node marketing/scripts/reel-spec.mjs marketing/output/2026-09-04-reel-spaces-cenas-viram-um-space/spec-src.json`

Saída conferida no `probe.json`: **1080×1920, 30 fps, h264, yuv420p, 11,30 s, 2,74 MB, sem áudio**.
Banda: `1080×608 @ y=656`. Nenhum arquivo compartilhado do repo foi tocado (kit, BRIEF, roteiros, docs).

## Timeline (`--plan`)

| t | segmento | asset | texto na tela |
|---|---|---|---|
| 0,00–1,40 | still (print do modelo, `brightness −0.14`, Ken Burns parado) | `0562-vista-before.png` — print da cena **Cena2** do Space "Projeto SketchUp 01/09" (01/09/2026) | eyebrow `MODELO · SKETCHUP` (0,0→1,4) |
| 0,70–1,40 | **wipeleft 0,7 s com régua** | — | — |
| 0,70–3,90 | still (Ken Burns 1→1,04) | `0561-vista-after.png` — render da **mesma câmera** | hook (1,4→5,9) + chip `VISTA 01` (1,4→3,9) |
| 3,90–4,90 | still, corte seco | `0030-render-after.png` | chip `VISTA 02` |
| 4,90–5,90 | still, corte seco | `0026-render-after.png` | chip `VISTA 03` |
| 5,90–9,80 | still, corte seco (Ken Burns 1→1,05) | `0028-render-after.png` | payoff (5,9→9,8) + chip `VISTA 04` |
| 9,80–11,30 | card final | — | logo + `Renderize seu projeto →` + `80 nodes grátis · sem cartão · em português` |

Scrim ativo de 0,0 a 9,8. Texto em tela: hook `mesmo projeto. / mesma identidade. / [quatro vistas.]`
(6 palavras, minúsculas com ponto, 3ª linha em cinza terciário) e payoff
`cada cena do modelo / vira uma vista / do mesmo {Space}.`

## O que foi conferido frame a frame

Lidos em resolução cheia: `t0.35`, `t1.05`, `t1.60`, `t4.40`, `t5.40`, `t6.80`, `t9.90`, mais a
`qa-sheet.jpg` inteira. Extraídos e lidos à parte (ffmpeg): **0,75 / 1,36 / 3,85 / 5,87 / 9,75 / 11,25 s**.

1. **t=0,35 s — o "antes" é o print de verdade.** SketchUp cru: estante preta, mesa clara, duas
   cadeiras cinza, poltrona marrom com pufe junto do caixilho. Eyebrow `MODELO · SKETCHUP` legível,
   centralizado, em y≈1345.
2. **t=1,05 s — meio do wipe (o teste mais importante).** Régua branca em x≈510: à esquerda o
   modelo, à direita o render. Poltrona marrom, mesa e estante caem nas mesmas posições dos dois
   lados; a cadeira executiva marrom fica em x≈150–230 / y≈930–1010 tanto no modelo quanto no
   render. Os aspectos são levemente diferentes (2,574 do print × 2,600 do render), mas o crop da
   banda absorve — **sem pulo, sem desalinhamento perceptível**.
3. **t=1,36 s — fim do wipe.** Imagem praticamente toda render; ver ressalva (a).
4. **t=1,60 s — troca de texto em corte.** Hook entra inteiro (topo da 1ª linha em y≈350, base da
   3ª em y≈570) e o chip `VISTA 01` em y≈1290–1335. Nada acima de 220 nem abaixo de 1600. Nenhuma
   palavra verde no hook — `quatro vistas.` sai em cinza terciário (marcação `[ ]`), correto.
5. **t=3,85 → 4,40 s — corte para a vista 02.** Sem flash: as bordas dos dois frames têm
   luminância parecida; o que muda é o conteúdo (a vista 02 é a de sol alto, sombra dura no
   carpete). Mudança legítima de cena, não artefato — e é exatamente o que a legenda assume
   ("luz e atmosfera variam de vista para vista").
6. **t=5,40 s — vista 03.** Mesmo escritório, persiana levantada, montanha visível. Chip `VISTA 03`
   na mesma altura dos outros; hook ainda no ar, sem sobreposição.
7. **t=5,87 → 6,80 s — troca hook→payoff.** Acontece no mesmo instante do corte de imagem (5,90),
   em corte seco. Em nenhum frame os dois textos aparecem juntos.
8. **t=6,80 e 9,30 s — payoff.** `Space` é a **única** palavra verde da peça (#30D158); o resto em
   branco. Três linhas dentro da zona segura (y≈350–570).
9. **t=9,75 → 9,90 s — entrada do card final.** Corte de um frame já escurecido pelo scrim para o
   card `#1a1a1a`: sem flash claro. Logo monocromático + pílula branca `Renderize seu projeto →` +
   microcopy, bloco entre y≈800 e y≈1130.
10. **t=11,25 s — último frame.** Card final ainda na tela; **não há frame preto no fim**.
11. **Banda.** Os cinco stills passam pelo mesmo crop de banda (`1080×608 @ y=656`); nenhum está
    esticado — o Ken Burns nunca passa de 1,05.
12. **Linguagem.** Hook e payoff em minúsculas com ponto final, frases curtas, sem exclamação, sem
    hype; "IA" não é assunto na arte. Etiquetas `MODELO · SKETCHUP` e `VISTA 0N` no padrão da
    landing (uppercase, tracking largo, fios). CTA da lista aprovada.

**Conclusão do QA visual: nenhum defeito real. Não re-renderizei.**

## Versão paga — decisão

**Não foi gerado cutdown "-ad".** A peça orgânica tem **11,30 s (≤ 15 s)**, texto embutido, som
dispensável, e o card final já traz um CTA da lista ("Renderize seu projeto →") compatível com o
botão `SIGN_UP`. O briefing não define cutdown específico — pede só 3 copies. Então **o próprio mp4
roda como anúncio**, com os três textos (fidelidade / prazo / apresentação) no `caption.txt`.
Botão: `SIGN_UP`; enquanto o evento de cadastro do Pixel/Google Ads não existir, rodar como
`LEARN_MORE`.

## Ressalvas e gating

a) **Eyebrow atravessa o wipe.** `MODELO · SKETCHUP` fica no ar de 0,0 a 1,4 s, ou seja, durante
   todo o wipe (0,70–1,40). Em t=1,36 a imagem já é ~95 % render e o rótulo ainda diz MODELO por
   ~0,15 s. É a convenção do formato (o rótulo descreve a origem do wipe) e cortá-lo no meio da
   transição leria como falha. **Não corrigi.** Se o dono preferir o corte estrito: no spec, o
   overlay `modelo` passa a `"to": 1.05`.

b) **Vistas 01 e 03 são quase a mesma câmera.** `0561` (vista 01) e `0026` (vista 03) enquadram o
   mesmo canto; o que separa as duas é a luz (persiana fechada × levantada). Reforça a mensagem de
   coerência, mas deixa a sequência um pouco repetitiva. Mantive porque estão separadas pela vista
   02 e porque no acervo de 01/09 não existe ângulo mais distinto — a única outra imagem do projeto
   (`0559`) é ainda mais parecida com a `0026`.

c) **Procedência das quatro vistas (ler antes de publicar).** Só a `0561` (e o print `0562`) é linha
   do Space **"Projeto SketchUp 01/09"** (`axis_label` "Cena2"). A `0030`, a `0026` e a `0028` são
   linhas da tabela de **renders** de 01/09/2026 (ambiente "Sala de Estar", engine vega 2k, aspecto
   2,6) — mesmo escritório, mesmo dia, todas geração real da conta do dono. Os chips `vista 01…04`
   enumeram as vistas mostradas, não linhas do banco, e **a legenda foi escrita para afirmar só o
   que é literalmente verdade** ("as quatro cenas são do mesmo escritório, geradas aqui no mesmo
   dia"). Se o dono quiser fidelidade estrita ao registro do Spaces, o corte alternativo é de duas
   vistas (`0560/0559` + `0562/0561`) — mas perde o "quatro vistas" do briefing.

d) **Permissão.** Todas as imagens são geração da conta do próprio dono (acervo), não de cliente.
   Não há nome, e-mail, saldo ou marca identificável em tela — nenhuma linha de
   `content_projects.permission_status` se aplica. Confirmar mesmo assim antes de publicar.

e) **Plugin do SketchUp não é citado** em nenhum ponto da arte nem da legenda: `MODELO · SKETCHUP`
   rotula a origem do modelo, não o plugin. Esta peça **não** depende do gating do `.rbz` (ainda
   não assinado na Trimble, smoke pago da 0.7 pendente).

f) **Números.** O único número na arte é o microcopy padrão do kit, "80 nodes grátis · sem cartão ·
   em português" — bate com o grant de cadastro vigente (80 nodes). Nada de "Lumens", plano Office,
   oferta de 50 % ou métrica inventada. Léxico proibido: zero ocorrências (verificado no
   `caption.txt`).

g) **Anti-repetição.** Nenhum Reel de 29/07 usa este projeto nem o formato "uma câmera + três cortes
   secos com chip de vista"; o gancho ("mesmo projeto, quatro vistas") não repete nenhum dos ganchos
   das outras peças de hoje.
