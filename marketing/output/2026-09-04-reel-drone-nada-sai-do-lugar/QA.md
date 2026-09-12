# QA — R1 · nada sai do lugar (drone → chão)

**Slug:** `2026-09-04-reel-drone-nada-sai-do-lugar`
**Arquivo:** `2026-09-04-reel-drone-nada-sai-do-lugar.mp4` — 1080×1920, 30 fps, H.264, yuv420p, sem áudio, **11,50 s**, 3,40 MB
**Spec:** `spec-src.json` (gerado por `make-spec.mjs`, que também escreve o spec do cutdown pago)
**Render:** `node marketing/scripts/reel-spec.mjs marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar/spec-src.json`
**Rodadas de render:** 1 (a peça já estava renderizada; o QA visual desta sessão não encontrou defeito real — **não foi re-renderizada**)

## Fontes (acervo real, nada gerado para o Reel)

| papel | asset | tamanho | job / data |
|---|---|---|---|
| par 1 antes | `assets/0442-render-before.jpg` (print SketchUp, drone) | 728×872 | 6a2d19c1 · 2026-04-28 · vega/2k |
| par 1 depois | `assets/0441-render-after.jpg` | 944×1136 | idem |
| par 2 antes | `assets/0444-render-before.jpg` (print SketchUp, do chão) | 733×867 | 1e83b155 · 2026-04-28 · vega/2k |
| par 2 depois | `assets/0443-render-after.jpg` | 944×1120 | idem |

`derived/derive.mjs` (dentro da pasta da peça — não toca no kit) faz cover-resize dos 4 para 944×1120. Os aspectos
são praticamente idênticos (0,835 / 0,831 / 0,845 / 0,843), então é escala, não recorte criativo. O mesmo script
gera `p1-blend.jpg` / `p2-blend.jpg` (blend 50/50, para medir o registro antes/depois) e `p1-*-grid.png`
(grade de 50 px, para posicionar as cantoneiras). Upscale registrado: ~1,30× nos dois prints do SketchUp
(cores chapadas, aguenta); **nenhum upscale nos renders**.

## Timeline (probe.json)

| t | o que acontece |
|---|---|
| 0,00–1,40 | print SketchUp do drone (p1-antes), parado, brightness −0,3 |
| 0,55–0,70 | fade-in das 3 cantoneiras (opacidade 0,5 → 0,94) |
| 1,40–2,30 | **wipe 1** `wiperight` 0,9 s com régua → render (p1-depois) |
| 2,30–5,50 | hold no render; cantoneiras até 4,60 (fade-out 4,60–4,75) |
| 2,40 | entra o hook `nada sai do lugar.` |
| 3,40 | entra o apoio `espreguiçadeiras, escada e planta: onde você modelou.` |
| 5,46–5,50 | corte para o print do chão (p2-antes) — fade de 1 frame (0,04 s); o kit não aceita cut puro depois do concat |
| 6,00–6,80 | **wipe 2** `wiperight` 0,8 s com régua → render (p2-depois), push-in 1,00→1,05 |
| 8,00–10,00 | bloco de CTA `Comece grátis` + micro-linha, sobre scrim |
| 10,00–11,50 | fade 0,4 s para o card final do kit (logo monocromático + pílula `Comece grátis →` + micro-linha) |

Cards próprios da peça (todos `layout: html`, escritos dentro do spec — nada foi acrescentado ao kit):
`faixas` (#1a1a1a de y 0–320 e 1602–1920), `marcas` / `marcas50` (cantoneiras hairline de 1,5 px),
`scrimTop` / `scrimBottom` (gradientes em camada própria), `hook`, `sub`, `cta`.

## Conferência frame a frame

- **t=0,90 s** — print SketchUp inteiro na caixa 4:5 (y 320→1602), faixas #1a1a1a limpas. As três cantoneiras
  encaixam nos objetos certos: espreguiçadeiras (235,520 → 910,1230), escada da piscina (252,1047 → 435,1287),
  pote da planta (97,806 → 194,892). Nenhuma cantoneira sobre os pavers (que mudam de material no render). Sem texto.
- **t=1,85 s** — meio do wipe 1 (régua em x≈555). A espreguiçadeira 1, à esquerda (render), e as 2 e 3, à direita
  (print), ocupam as mesmas coordenadas; borda da piscina, escada e o canteiro da planta atravessam a régua sem degrau.
  Cantoneiras **paradas** durante o wipe (overlay separado, como manda o BRIEF).
- **t=2,20 s** — wipe quase no fim (régua em x≈960); a faixa remanescente de print casa com o render no deck e no
  volume de concreto. Sem flash no corte: os dois lados carregam o mesmo `brightness: -0.3`.
- **t=3,00 / 4,20 / 5,20 s** — hook em y≈372–430 e apoio terminando em y=1560: **zona segura respeitada**
  (nada acima de y=220 nem abaixo de y=1600). Texto #f5f5f7 sobre scrim, legível sobre o deck claro. Hook e apoio
  nunca disputam a mesma altura. `nada sai do lugar.` = 4 palavras, minúsculas, ponto final, sem exclamação — padrão da landing.
- **t=4,20 vs t=5,20 s** — confirma o fade-out das cantoneiras em 4,60: em 4,20 ainda estão em 0,94; em 5,20 sumiram.
- **t=5,70 s** — print do chão (p2-antes) inteiro na mesma caixa. O céu chapado é bem mais claro que o render
  anterior, mas o corte é seco e curto: **não é flash**, é troca de cena.
- **t=6,40 s** — meio do wipe 2. Recorte ampliado 2× em volta da régua (x 280–800, y 400–920): a quina interna da
  casa (concreto × volume ripado) cai **exatamente sobre a régua**, com o topo da laje no mesmo y dos dois lados.
  Confirma o que `p2-blend.jpg` mostra: cobertura, borda da piscina, deck e espreguiçadeiras registram.
- **t=8,60 s** — bloco de CTA: `Comece grátis` (54 px) com fio verde #30d158 embaixo + micro-linha
  `80 nodes grátis · sem cartão · em português` em #a1a1a6, base em y=1560. **O fio é o único verde da peça** —
  nenhuma outra marca verde antes ou depois, e o card final também não tem verde.
- **t=10,20 s** — meio do crossfade para o card final. O CTA sobre a imagem sai em 10,00, então não há dois CTAs
  simultâneos; durante ~0,4 s a micro-linha do card fica translúcida sobre a foto. É crossfade normal, não defeito.
- **t=11,00 s** — card final: ConstellationN + wordmark monocromáticos, pílula branca `Comece grátis →`,
  micro-linha. Sem URL na arte. Tudo entre y≈800 e y≈1130.

**Banda:** a peça inteira usa `fit: "contain"` na mesma caixa 1080×1282 @ y=320 — nenhuma imagem esticada, nenhum
aspecto forçado; o que existe fora da caixa é faixa sólida #1a1a1a, não blur.

## Versão paga

- **Renderizada:** `C:/Users/Pisoni/spacenode/marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar-ad/2026-09-04-reel-drone-nada-sai-do-lugar-ad.mp4`
  — **6,00 s**, 1,21 MB, mesmas specs técnicas. É o cutdown que o slate define para placements curtos: cenas 1–3
  (print → wipe → hold), hook em 2,40 s, CTA em 4,00 s, **sem o par do chão e sem card final** (o botão SIGN_UP do
  Meta faz esse papel). QA do cutdown em `qa-frames/t4.80s.png`: hook no topo, cantoneiras ainda encaixadas, CTA com
  o fio verde, tudo dentro da zona segura.
- **11,5 s serve como criativo longo sem duplicar arquivo:** a peça orgânica já está abaixo do teto de 15 s do Meta
  e termina com CTA da lista aprovada + oferta explícita. Usar o próprio mp4 orgânico nos placements de feed/Reels.
- **8,5 s: NÃO produzido — decisão registrada.** O slate previa um corte de 8,5 s (mantém o par do chão, corta o card
  final), mas a peça sem o card final dá 10,4 s; para chegar a 8,5 s seria preciso tirar ~1,9 s do hold do render do
  drone, que é exatamente o tempo em que hook e apoio ficam legíveis. Com 6 s e 11,5 s cobrindo os dois extremos, o
  corte do meio não paga o custo de legibilidade. Se o dono quiser mesmo o 8,5 s, o caminho é encurtar o par do chão
  (p2-depois de 4,4 → 2,5 s), nunca o hold do hook.

## Ressalvas e gating

- **Claim.** A headline fala de **posição**, não de identidade. Nada de "idêntico", "pixel a pixel", "nada muda",
  "sempre", "em segundos". Os pavers mantêm o arranjo mas mudam de material (por isso ficaram sem cantoneira) e o
  escritório do térreo em #443 virou reflexo/vegetação — fora dos marcadores.
- **"planta", não "vaso".** No print o objeto é um arbusto preto; o pote é o que se lê dos dois lados, então a
  cantoneira foi dimensionada pelo pote e a copy diz "planta" — é o que o espectador confere no celular.
- **"IA" não aparece** na arte nem na legenda. O **plugin de SketchUp não é citado** (o .rbz ainda não foi assinado
  na Trimble e o dono não fez o smoke pago da 0.7): a peça mostra o fluxo público de print → render.
- **Oferta.** "80 nodes grátis · sem cartão · em português" é a microcopy da landing no ar. Nenhuma menção a desconto
  de 50% (encerrado em 31/08), a "Lumens" ou ao plano Office. Nenhum número inventado.
- **GATE do dono, antes de veicular pago:** confirmar a autoria do modelo SketchUp da casa com piscina (jobs
  6a2d19c1 e 1e83b155, 28/04/2026). Origem dos prints e renders: acervo real da conta do dono na plataforma —
  nada foi gerado para o Reel.
- **Anti-repetição no orgânico:** a mesma casa aparece em R9 e R10 do slate — manter ≥2 semanas de distância.
- **Suavidade.** Originais de 944 px de largura: o upscale de ~1,3× no print aparece de leve nas ripas do deck em
  celular topo de linha. Aceito e registrado.
