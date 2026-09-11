# Recipes — os 8 tipos de peça

Cada recipe traz: estrutura, durações de referência, de onde vem cada shot,
montador, roteamento de modelo e custo típico. **Adapte** — recipe é ponto de
partida, não gabarito. O que não muda são as três leis.

Custos assumem os preços medidos em `model-routing.md` e `--takes 2`.

---

## A. SKETCHUP → REALIDADE

O carro-chefe. Prova a tese do produto em 10 segundos.

```
SHOT 01  0,0–1,5   viewport do SketchUp (print cru, sem textura)
                   still · kenburns [1,1] parado · brightness -0,14
SHOT 02  1,5–2,0   TRANSIÇÃO  wipeleft 0,5s com ruler: true
SHOT 03  2,0–7,0   render SpaceNode, MESMA câmera
                   still · kenburns [1, 1.08]
SHOT 04  7,0–10,8  movimento cinematográfico no render (opcional, pago)
                   video i2v 4s · push-in lento
SHOT 05  10,8–12,0 card final: logo + CTA
```

- **Fonte:** par real do acervo (`$ACERVO`, `marketing/renders/`). Mesmo projeto,
  mesma câmera, sempre.
- **Montador:** reel-kit. A régua branca no wipe é a assinatura da fidelidade.
- **Modelo:** SHOT 04 é o único pago — e é opcional. Sem ele, custo **US$ 0,00**.
  Com ele: Kling v3 Pro 4s × 2 takes ≈ US$ 1,12.
- **Variação forte:** trocar SHOT 01–03 por `type: split` (SketchUp em cima,
  render embaixo, Ken Burns sincronizado, fio branco no meio). Mata a dúvida
  "é o mesmo projeto?" sem precisar de wipe.

## B. BEFORE / AFTER

Irmão do A, mas a virada é de **atmosfera**, não de realismo.

```
SHOT 01  0,0–1,5   estado A
SHOT 02  1,5–2,0   transição (wipe com ruler, ou cut no beat)
SHOT 03  2,0–6,5   estado B, mesma geometria
SHOT 04  6,5–9,0   dois detalhes do B (zoom em textura, junta, luz)
SHOT 05  9,0–10,2  card final
```

- Custo **US$ 0,00** se tudo vier do acervo e o movimento for Ken Burns.
- Se a transformação precisar ser **animada** (A derretendo em B): Seedance 2.0
  i2v com `image_url` = A e `end_image_url` = B. 5s @720p × 2 takes ≈ US$ 3,02.
  Só vale quando a peça é o hero de uma campanha.
- Nunca gere o "antes". O antes é o print real do arquiteto.

## C. PRODUCT DEMO

```
SHOT 01  0,0–2,0   problema nomeado (texto sobre print cru)
SHOT 02  2,0–7,0   UI da SpaceNode em ação — captura real acelerada 2x
SHOT 03  7,0–10,0  a feature específica em close (recorte do painel)
SHOT 04  10,0–13,0 o resultado saindo
SHOT 05  13,0–14,2 card final
```

- **Fonte:** `marketing/scripts/produto/` (captura do web app) — nunca recriação.
  Captura a 900×1400; ver memória do projeto para o fluxo de login.
- **Nunca mostre saldo de nodes em tela** (regra §6 do BRIEF) e nunca dados de
  usuário real — conta de demo.
- **Montador:** reel-kit. Se a UI precisar se **montar** elemento a elemento,
  aí sim Remotion.
- **Custo:** US$ 0,00. Demo de produto não precisa de IA generativa.

## D. PLUGIN SKETCHUP

```
SHOT 01  0,0–2,0   SketchUp aberto, modelo do arquiteto
SHOT 02  2,0–4,5   o painel do plugin aparecendo na lateral
SHOT 03  4,5–7,5   a ação: um clique, a vista sendo capturada
SHOT 04  7,5–11,0  o resultado gerado, na mesma tela
SHOT 05  11,0–12,2 card final
```

- **Fonte:** `marketing/scripts/plugin/capture-states.mjs` (estados do painel) e
  capturas reais do SketchUp do dono. O recorte do painel já é conhecido:
  440×780 @ (1838,146) no monitor 2560×1080, com máscara no e-mail.
- **Montador:** reel-kit, `fit: contain` para o print do SketchUp inteiro.
- **Custo:** US$ 0,00.
- Gotcha: o CEF do SketchUp ignora Ctrl+= (zoom) — não conte com zoom de UI.

## E. ARCHITECTURAL SHOWCASE

A peça mais "filme" do conjunto. Zero produto, só projeto.

```
SHOT 01  0,0–4,0   hero render, push-in muito lento
SHOT 02  4,0–7,0   movimento cinematográfico (paralaxe, luz)   ← pago
SHOT 03  7,0–9,5   detalhe: textura, junta, caixilho
SHOT 04  9,5–13,0  volta ao wide, respiro
SHOT 05  13,0–14,5 assinatura de marca, discreta
```

- **Montador:** cinema-kit se for 16:9; reel-kit se for 9:16.
- **Modelo:** este é o caso onde vídeo de IA se paga. Seedance 2.0 i2v, 5s @720p,
  ancorado se possível. × 2 takes ≈ US$ 3,02 por shot animado.
- Texto mínimo ou nenhum. Deixe a arquitetura falar.
- Fidelidade: máxima atenção — é a peça que mais tenta o movimento ambicioso.

## F. FEATURE RELEASE

```
SHOT 01  0,0–2,0   hook — o problema que a feature resolve
SHOT 02  2,0–4,5   reveal da feature (nome na tela, uma vez só)
SHOT 03  4,5–8,5   como funciona — captura real, 2 a 3 passos
SHOT 04  8,5–11,5  o output
SHOT 05  11,5–12,7 CTA
```

- Confirme que a feature **está em produção** antes de anunciar. Fonte: memória
  do projeto e o código, não suposição. Já houve feature anunciada antes do merge.
- Nome da feature aparece **uma vez**, grande, e some.
- **Custo:** US$ 0,00 (captura real).

## G. META ADS PERFORMANCE

```
0,0–2,0    pattern interrupt — o print cru que ele reconhece
2,0–4,0    problema nomeado, em texto
4,0–8,0    solução acontecendo — produto em ação
8,0–11,0   prova — antes/depois com geometria travada
11,0–12,0  benefício + marca
```

- **Tem que funcionar mudo.** Texto carrega a narração.
- Zona segura mais apertada na base (y≈1500) — o botão de CTA do Meta come espaço.
- Sempre produza **3 variantes** de hook/first frame sobre o mesmo corpo. O
  reel-kit faz isso com 3 specs quase idênticos, custo zero de geração.
- Entrega: `mp4` + `caption.txt` + instrução de upload manual — **vídeo local não
  sobe pela API daqui**.
- Ver `paid-social.md` inteiro antes de montar.

## H. BRAND FILM

```
ABERTURA   preto 0,8s, respiro
ATO 1      arquitetura — o ofício, o desenho, o espaço
ATO 2      tecnologia — a ferramenta, discreta, a serviço
ATO 3      filosofia — o projeto continua seu
FECHO      statement de marca + logo
```

- 30–60s, 16:9 master com corte 9:16 pelo patch `"vertical"` do cinema-kit.
- Texto raro, grande, com respiro. Ritmo lento. Fades longos (0,6–0,8s).
- Referência já existente no projeto: o filme "Mesma Geometria" (57s, 16:9,
  set/26), montado com cinema-kit a partir de 37 capturas 4K. Custo de IA: baixo,
  porque o material era real.
- Aqui o áudio importa — ver `sound-design.md`.

---

## Como escolher quando o pedido é vago

| O dono disse | Recipe provável |
|---|---|
| "faz um Reel" | A (é o que mais performa) |
| "mostra a plataforma" | C |
| "lancei tal coisa" | F |
| "preciso de um criativo pro Meta" | G |
| "um vídeo bonito desse projeto" | E |
| "vídeo do plugin" | D |
| "algo pra marca" | H |
| "compara antes e depois" | A ou B — pergunte se a virada é realismo ou atmosfera |

Na dúvida entre dois, proponha o mais barato primeiro e ofereça o outro como
upgrade no mesmo plano.
