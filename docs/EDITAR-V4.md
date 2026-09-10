# Editar V4 — seleção precisa sobre o motor Seedream

Reconstrução do Modo Editar (2026-09-10). Roda **em paralelo** ao V3, atrás de
flag e dormente por padrão: com as flags desligadas, nada muda para ninguém.

## Por que existe

**O motor.** O V3 é Google-first (`lib/ai/google/editImage.ts`, API direta do
Gemini). O projeto Google está com billing desativado desde ~07/09 e o fallback
FAL é off por padrão — na prática o Editar parou de funcionar em produção: a
última edição bem-sucedida foi 03/09, e desde 08/09 só há jobs `failed`. O V4
nasce no Seedream 5.0 Pro, que já foi A/B testado no pipeline real (8/8 casos,
50–58 s, drift fora da máscara = 0, métricas dentro da máscara iguais).

**A seleção.** O V3 só tinha pintura manual sobre um modelo de traços
vetoriais. Sem varinha, sem booleanas, sem refino de borda, sem inverter. Em
render arquitetônico — superfícies chapadas, limites retos — uma varinha boa
resolve num clique o que o pincel leva um minuto para fazer pior.

**A margem.** O preço em nodes é derivado do custo do provider. O V3 mirava
50%; o V4 mira 80%, e chega lá porque o Seedream pela ModelArk custa US$ 0,045
por edição contra US$ 0,12 do Gemini.

## Princípios (mantidos do brief do fundador)

1. Geometria intocável.
2. Apenas o solicitado.
3. Alterar somente a área selecionada.
4. Preservar câmera, proporção, perspectiva, aberturas, iluminação e composição.
5. Interface para arquiteto, não para programador.
6. Visual premium, minimalista, manual da marca.

O item 3 é **garantia técnica, não promessa de prompt**: o modelo re-sintetiza a
cena, e o resultado é **recomposto no servidor** sobre a original — só os pixels
dentro da máscara branca entram (`recomposeMasked`, PNG lossless, alpha
binarizado, ICC preservado). Fora da seleção fica idêntico, por aritmética.

## Arquitetura

```
UI     components/edit-v4/EditV4Flow.tsx        painel de vidro + orquestração
       components/edit-v4/EditV4Canvas.tsx      canvas raster: 7 ferramentas, zoom, ants
       components/edit-v4/selection/
         magic-wand.ts                          flood fill YCbCr (puro)
         mask-raster.ts                         RLE, morfologia, exportação (puro)
         contours.ts                            marching squares (puro)
       components/edit-v4/icons.tsx             reexporta os do V3 + os novos
page   app/app/editar-v4/page.tsx               rota isolada (NEXT_PUBLIC_EDIT_V4)
       app/app/editar/page.tsx                  fork ganhou o V4 no topo
API    app/api/edit-v4/route.ts                 POST: valida → gera → recompõe → afere → cobra
       app/api/edit-v4/mask/refine/route.ts     POST: colar na borda (grátis)
core   lib/edit-v4/pipeline.ts                  crop → contorno → motor → recompose → gates
       lib/edit-v4/engine.ts                    ark → fal, saída dimensionada pelo crop
       lib/edit-v4/prompt.ts                    prompts por ação + <bbox> + contorno
       lib/edit-v4/outline.ts                   desenha e detecta o contorno
       lib/edit-v4/{types,flags,pricing}.ts
db     supabase/migrations/20260910040000_edit_jobs_widen_checks.sql   (APLICADA)
```

Reuso read-only, sem tocar nos arquivos: `lib/spaces/edit-crop.ts`,
`lib/edit-v2/{mask-refine,mask-morphology,connected-components,normalizer,semantic-gate}.ts`,
`lib/ai/seedream-size.ts`, `lib/edit-v3/{ssrf,persist,buildEditPrompt}.ts`,
`lib/storage/normalize-image.ts`, `lib/spaces/edit-route-helpers.ts`.

Os adaptadores `lib/ai/{ark,fal}/seedreamEdit.ts` ganharam UM campo opcional
(`outputSize`). Quem não passa — o V3 — segue byte-idêntico.

## As 5 ações

| Ação | `action` | Seleção | Referência | Borda padrão |
|---|---|---|---|---|
| Trocar material | `swap_material` | opcional | `material` | macia |
| Remover | `remove` | opcional | — | exata |
| Inserir | `insert_element` | **obrigatória** | `object` | macia |
| Substituir | `replace_object` | **obrigatória** | `object` | macia |
| Refinar | `refine_area` | opcional | — | exata |

Inserir e Substituir exigem seleção porque sem âncora não existe "onde" nem
"qual" — o modelo escolheria por conta própria. As outras três aceitam edição
por instrução pura ("tirar o tapete").

## A seleção

**A mudança estrutural: a seleção é um raster** (`Uint8Array` 0/255 na resolução
da imagem), não uma lista de traços. É isso que faz varinha, booleanas,
morfologia e marching ants comporem entre si.

- **Varinha mágica** — flood fill por spans, `Int32Array`, O(N). Compara cor em
  **YCbCr com peso 0,35 na luminância**: sombra mexe em Y e pouco em croma, então
  a varinha atravessa a sombra do mesmo piso e para no rodapé. (Lab seria mais
  fiel, mas custa três `cbrt` por pixel — 24 milhões deles numa imagem de 8 MP.)
  Modos contíguo e global; média de vizinhança na semente.

  **A tolerância padrão (11) foi medida, não escolhida.**
  `scripts/edit-v4-wand-calibrate.mts` roda a varinha em imagens reais do acervo
  numa grade de tolerância × peso da luminância. O que ela mostra é um
  **penhasco**: em toda imagem existe um valor a partir do qual o preenchimento
  acha caminho pelos degradês e escapa para a cena inteira — abaixo dele as
  seleções ficam em 10–25% e sementes de materiais diferentes dão áreas
  diferentes; um degrau acima, tudo vira 70–90% e a ferramenta perde o sentido.
  O penhasco fica entre 11 e 14 numa sala fotorrealista e entre 14 e 18 num
  exterior; 11 é o maior valor abaixo dos dois. Rode o script de novo se mudar
  `LUMA_WEIGHT` ou `TOLERANCE_SCALE`.

  Verificado no browser (2026-09-10): um clique no volume envidraçado de uma casa
  seleciona o volume inteiro e para no concreto e nos pilares; um clique no piso
  de madeira de uma sala pega o piso contornando tapete, sofás e mesa de centro.
- **Manuais** — pincel, borracha, laço, polígono, retângulo.
- **Booleanas** — Shift soma, Alt subtrai.
- **Ajustes** — expandir, contrair, suavizar, tapar buracos, limpar respingos,
  inverter, selecionar tudo, desmarcar.
- **Colar na borda** — guided filter edge-aware (`refineSurfaceMaskV2`), local,
  ~100–300 ms, **zero nodes**.
- **Marching ants** — marching squares em coordenadas de imagem, traçado quando
  a seleção assenta; a animação é só `lineDashOffset`.
- **Histórico** — undo/redo com os estados guardados em RLE (máscara binária
  comprime ~100:1; sem isso, 8 estados de uma imagem de 12 MP seriam ~100 MB).

Nada disso chama modelo. Custo zero, resposta em milissegundos.

**Atalhos:** `V` varinha · `B` pincel · `E` borracha · `L` laço · `P` polígono ·
`R` retângulo · `H`/espaço mover · `Ctrl+Z`/`Ctrl+Shift+Z` desfazer/refazer ·
`Ctrl+D` desmarcar · `Ctrl+Shift+I` inverter.

## A tela

Crítica do dono na primeira olhada: *"simples e ao mesmo tempo poluído (excesso
de texto nos botões) e poucas funções, quero mais apple glass style"*. As três
partes tinham causas diferentes.

**O texto.** As ações eram cartões de duas linhas — título mais uma nota
("Piso, parede, bancada, marcenaria"). Cinco ações davam dez linhas de texto
para escolher uma coisa só, e ainda havia rótulo de campo e um parágrafo de
dica embaixo. Agora a ação é um **segmentado de uma linha** com uma palavra
cada (Material · Remover · Inserir · Substituir · Refinar), que é o que o
próprio contrato de design manda para o eixo que reconfigura o resto
(`docs/VIDRO-NO-APP.md`, seção 3, item 4). A nota morreu porque o exemplo
dentro do campo de texto ensina a mesma coisa no momento em que a pessoa vai
escrever. O rótulo do campo morreu porque o segmentado logo acima já disse o
assunto. E a dica só aparece quando é **bloqueio** — quando a ação exige
seleção e não há nenhuma; nas outras, quem conta o estado é o próprio palco
("nada selecionado" / "12% selecionado"). Saiu de ~14 linhas de texto na
superfície para 5.

**O vidro.** Não era gosto, eram dois defeitos mecânicos. O `/app/editar`
envolve o editor num `<main>` com `background: var(--color-bg)` — cor chapada
que pinta por cima do papel de parede do `<Ambient/>`; e o palco do canvas
tinha fundo sólido. Vidro sem nada atrás é cinza. Agora: o V4 sai antes desse
`<main>` no fork, o palco é **transparente**, a tela chama
`useAmbient(imagem)` — o papel de parede passa a ser o próprio render, borrado
— e a imagem ganha sombra para flutuar sobre ele. O painel virou **uma
superfície de vidro contínua** (`.spn-glass--chrome`) que abraça o próprio
conteúdo em vez de esticar: esticado, abria um vazio de ~200 px entre a última
linha e o dock.

**O canvas parou de repintar à toa.** O item 6 do contrato proíbe vidro sobre
canvas que repinta em rAF, e as barras de ferramentas flutuam sobre o palco.
O laço agora só pinta quando algo mudou, e o tracejado anda a ~12 fps em vez de
60. Medido no browser: **0 repinturas em 2 s com a tela parada** (antes eram
todas as que o rAF permitisse).

**`?source=`.** A página aceita uma imagem já escolhida em outra tela, com a
mesma allowlist de origem que a rota de edição usa — é o contrato que o
`/app/upscale` já tinha, e é o que permite um "editar esta imagem" vindo do
Histórico ou do resultado de um render.

## O motor

ModelArk primeiro, fal como **fallback por erro** — nunca em paralelo: hedge
neste endpoint é cobrança dupla comprovada (as duas pernas cobram, PR #178/#190).

**A saída é dimensionada pelo crop.** No V3 um crop de 251×225 era gerado em
2 MP: pagava a faixa cara e voltava esticado. Aqui a saída pede ~2× o lado do
crop, clampada em `[1.048.576 px, 2.359.296 px]` — o piso é o schema da fal, o
teto é a faixa barata dos **dois** provedores. Efeito: sempre a faixa barata
(ganhe quem ganhar a chamada) e crop pequeno volta mais rápido, porque dentro da
mesma faixa pedir menos pixels não economiza dinheiro, economiza tempo.

**Localização da edição.** O Seedream não aceita máscara em pixels. O V4 usa os
dois recursos nativos do Pro ao mesmo tempo: a tag `<bbox>` (0–999) e a
**marcação desenhada** — o contorno da seleção pintado em magenta sobre a imagem
enviada. A caixa sozinha não descreve um sofá em diagonal; o contorno descreve.
O prompt tem cláusula própria mandando não renderizar a linha, e um gate mede
vazamento de magenta no resultado (`outlineLeakRatio`). `EDIT_V4_OUTLINE=0`
desliga tudo isso e volta ao bbox puro.

## Preço

Derivado, não tabelado (`lib/edit-v4/pricing.ts`). Margem-alvo 80%, teto de
segurança amarrado ao preço do render padrão em `lib/engines.ts` — se o render
mudar de preço, o teto acompanha e "editar < gerar" não pode ser quebrado por
esquecimento.

| | Custo | Nodes | Margem (piso do node) | Margem (mediana) |
|---|---|---|---|---|
| ModelArk, sem referência | US$ 0,045 | **18** | 81,5% | 86,5% |
| ModelArk, com referência | US$ 0,048 | 18 | 80,2% | — |
| Queda para a fal | US$ 0,0675+ | 18 | ~70% | — |

18 nodes é o mesmo número que o V3 já cobrava: a virada não é aumento de preço.
Seleção e refino de borda custam **0 nodes**.

**Sem retry pago.** No V3, reprovar no gate disparava uma segunda geração que
nós pagávamos e o usuário não. Com máscara + recompose o drift externo é ~0 por
construção, então o retry quase só existia para o modo sem seleção. Refazer
continua grátis — a decisão passou a ser do usuário.

## Flags

| Var | Default | Efeito |
|---|---|---|
| `EDIT_V4_ENABLED` | off | Liga `/api/edit-v4`. Desligada → **404**. |
| `NEXT_PUBLIC_EDIT_V4` | off | Liga a página. ⚠️ inlinada no **build** — mudar exige redeploy. |
| `EDIT_V4_CHARGE` | **off (fail-safe)** | Debita nodes **só com `=1` explícito**. |
| `EDIT_V4_ROUTE` | `ark` | Rota primária do Seedream (`ark` ou `fal`). |
| `EDIT_V4_OUTLINE` | **on** | Desenha o contorno da seleção. `=0` volta ao bbox puro. |
| `EDIT_V4_FAST` | off | Modo rápido de prompt do Seedream (~13% mais rápido). |
| `EDIT_V4_NORMALIZER` | on | Traduz a instrução PT→EN. Depende do Gemini; degrada sozinho. |
| `EDIT_V4_SEMANTIC_GATE` | on | Verificação visual pós-geração. Mesma dependência. |
| `EDIT_V4_DEBUG` | off | Expõe o bloco `debug` (rota, USD, métricas). |

O preço em nodes desce da página como prop (`nodesPerEdit`), derivado por
`nodesForEdit()` — não é buscado por uma chamada seca à API, que só criava um
estado "— nodes" na tela enquanto a resposta não chegava.

Obrigatórias para o motor: `ARK_API_KEY` (rota ark), `FAL_KEY` (rota fal /
fallback), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Ligar local** (`.env.local`): `EDIT_V4_ENABLED=1`, `NEXT_PUBLIC_EDIT_V4=1`,
`EDIT_V4_CHARGE=0`, `EDIT_V4_DEBUG=1` — depois `npm run dev` e
`http://localhost:3000/app/editar-v4`.

**Rollback:** remover `NEXT_PUBLIC_EDIT_V4` + redeploy. O fork de `/app/editar`
volta ao V3 sem tocar em código.

## Banco

Grava em **`edit_v3_jobs`** — a mesma tabela do V3, de propósito: é dela que a
aba Edições do Histórico lê, e tabela nova exigiria refazer aquela integração
para não ganhar nada.

A migration `20260910040000_edit_jobs_widen_checks.sql` (aprovada pelo fundador
e **aplicada em produção em 10/09**) alarga dois CHECKs:
`provider` passa a aceitar `'ark'` e `action_type` passa a aceitar
`'replace_object'`. Sem o primeiro, toda edição pela ModelArk saía certa para o
usuário mas ficava presa em `processing`, sem `result_image_url` — e sumia do
Histórico.

## Gates

| Gate | Quando | O que faz |
|---|---|---|
| `out_of_mask_drift` | com seleção | Para-quedas: o recompose já garante ~0. |
| `no_change` | sempre | O modelo devolveu a entrada. |
| `framing_changed` | sem seleção | O modelo mudou o enquadramento. |
| `global_redesign` | sem seleção | Trocou a imagem inteira. |
| `outline_leak` | contorno ligado | O magenta do marcador vazou para o resultado. |
| `semantic_*` | com instrução | Visão compara original × resultado. Advisory com seleção; decisivo sem. |

Reprovou → **nada é cobrado** e a mensagem diz isso.

## Testes

`tests/edit-v4/` — 74 casos: preço (margem ≥ 80% em toda faixa, teto sempre
abaixo do render, arredondamento de ponto flutuante), dimensionamento da saída
(envelope das duas rotas, faixa barata garantida, entrada degenerada), varinha
(atravessa sombra, para no material vizinho, contígua × global, ruído na
semente, booleanas) e raster (RLE ida e volta, morfologia, contornos).

## O bug que só a execução real encontrou

Registrado porque é o tipo de coisa que volta: o efeito que carrega a imagem no
canvas dependia dos callbacks vindos do pai. Como qualquer pai escreve
`onSelectionChange={info => …}`, a identidade da função mudava a cada render, a
mudança subia pela cadeia `notify → commit → efeito`, o efeito rodava de novo e
`maskRef.current = new Uint8Array(...)` **apagava a seleção**. Na prática:
digitar uma letra no campo de instrução limpava a marcação recém-feita.

Passou por `tsc`, por `eslint`, pelos 400 testes e pelo `next build` — só
apareceu ao clicar de verdade. Hoje os callbacks do pai vivem num ref
(`cbRef`) e o efeito depende só de `imageUrl`.

## Pendências

- Smoke pago do dono (1 edição real, ~US$ 0,045).
- A/B do contorno desenhado × bbox puro antes de considerá-lo assentado.
- Aposentar o V3 depois que o V4 rodar em produção.
- SAM2 por clique e seleção por texto: as libs já existem
  (`lib/spaces/engines/`), ficaram fora desta entrega por decisão de escopo.
