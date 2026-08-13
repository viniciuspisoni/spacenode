# SpaceNode — Auditoria e Plano: Realismo e Fidelidade de Imagem (2026-08)

> Objetivo do produto: ser a plataforma com a maior qualidade de imagem e a maior
> fidelidade possível ao projeto upado pelo usuário.
>
> Este documento é o resultado de uma auditoria completa do pipeline de imagem
> (Renderizar, Spaces, Editar v2/v3, Ampliar, Finalizar, Apresentar) com foco em
> duas perguntas: **onde perdemos fidelidade hoje** e **o que construir para
> ganhar mais realismo**. Toda afirmação cita `arquivo:linha`.

---

## 1. Sumário executivo

O núcleo do motor está bem construído e à frente do mercado: modo estrutural
`render_only` com contrato de fidelidade em fonte única
(`lib/ai/fidelity/render-only.ts`), validação geométrica pós-geração por Sobel
edge-recall (`lib/ai/fidelity/geometry-score.ts`), retry ladder com temperatura
decrescente + edge map, âncora de materiais entre gerações e recompose
server-side no Editar. Os três motores (Nano Banana Pro / NB2 / GPT Image 2)
são o estado da arte atual em edição com referência.

**A conclusão central da auditoria: os maiores ganhos de fidelidade agora não
vêm de trocar de modelo, e sim de (a) estancar perdas silenciosas no
encanamento — resolução, JPEG, prompt — e (b) ligar circuitos que já foram
construídos mas estão desconectados.** Há um conjunto de correções de dias de
esforço que muda o resultado visível antes de qualquer feature nova.

As descobertas mais graves:

| # | Descoberta | Impacto |
|---|---|---|
| 1 | Todo upload do Renderizar é reduzido a **2048 px / JPEG q0.92 no browser** antes de chegar ao servidor | O usuário paga 40 nodes por um render "4K" cuja fonte estrutural tem 2048 px |
| 2 | O Fidelity Engine de visão (`/api/analyze` + `lib/fidelity-engine.ts`) está **morto em produção** — zero callers; `PROJECT FACTS` nunca entra no prompt do Renderizar | O sinal de fidelidade mais forte (pavimentos, aberturas, materiais, câmera, elementos a preservar) não é usado no fluxo principal |
| 3 | **SEGMENTO e ESPAÇO são no-ops na Máxima Fidelidade** (o default) — `environment` nem é desestruturado e o bloco que carrega `segDesc` é omitido | A UI promete controle que não entrega; 150 entradas de `ENV_EN` são código morto no fluxo vivo |
| 4 | `/api/generate` **não passa `imageLabels`** no caminho GCP — exatamente o bug que o Spaces já corrigiu; com âncora em primeiro na lista, o modelo pode ancorar na imagem errada | Drift de papel entre âncora (materiais) e input (geometria) |
| 5 | **JPEG em toda a cadeia** (saída do gerar, re-encode a cada edição, export) | Perda geracional acumulada; artefatos em cadeias gerar → editar → editar → ampliar |
| 6 | Editar V3 gera o patch a ≤2K e o **estica sobre a imagem inteira** (regressão vs. o crop do V1), com feather de ~70 px vazando material além da seleção e gate de drift cego na borda | O "tell" mais visível de edição por IA: região editada mais mole que o entorno + material vazado no rodapé/esquadria |
| 7 | Ampliar "Alta Fidelidade" tem **fallback silencioso Topaz→Clarity** (difusão generativa) e o upscale de Vistas usa `creativity 0.3` sem negative prompt | Linhas finas e texto alucinados justamente no modo vendido como fiel |

---

## 2. Mapa do pipeline hoje

```
Renderizar  GenerateClient ─▶ POST /api/generate ─▶ image-provider (GCP Vertex primário, FAL fallback)
                                   │                    │ Vega   = fal-ai/nano-banana-pro/edit → gemini-3-pro-image
                                   │                    │ Pulsar = fal-ai/nano-banana-2/edit   → gemini-3.1-flash-image
                                   │                    │ Quasar = openai/gpt-image-2/edit     (só FAL)
                                   │                    └ saída GCP re-hospedada no Storage; FAL fica no CDN
                                   ├ prompt: lib/prompts.ts (buildFidelityPrompt) + lib/ai/fidelity/render-only.ts
                                   └ gate:   geometry-score (Sobel 384px) + retry ladder (temp ↓, edge map)

Spaces      GenerationFlow ─▶ /api/spaces/[id]/generate ─▶ lib/spaces/generation.ts (mesmo provider layer)
                                   ├ DNA + briefing (Gemini vision) injetados no prompt   ← Renderizar NÃO faz
                                   ├ imageLabels por papel de imagem                       ← Renderizar NÃO faz
                                   └ audit semântico pós-geração (preserve-validate)       ← Renderizar NÃO faz

Editar v3   EditV3Flow ─▶ /api/edit-v3/google ─▶ Gemini direto (3.1-flash-image / 3-pro-image)
                                   └ máscara como 2ª imagem + recompose server-side (PNG) + gates de pixel

Ampliar     /api/upscale ─▶ FAL topaz | clarity | nafnet | photo-restoration
Finalizar   WebGL2 client-side (Lightroom-like), export JPG/PNG/WebP
Apresentar  humanized-plan/isométrica (NB Pro + gate geométrico próprio) + moodboard/carrossel (texto)
```

Dois fatos estruturais importantes:

- O **Spaces tem hoje um contrato de fidelidade mais forte que o Renderizar**
  (briefing no prompt, labels por imagem, audit semântico, `preservation_warning`
  na UI). O fluxo carro-chefe é o mais fraco dos dois — a maioria das melhorias
  P0 é "trazer o Renderizar ao nível do Spaces".
- O provider layer (`lib/ai/image-provider.ts`) já suporta `seed`,
  `imageLabels`, `aspectRatio` e `temperature` — vários callers simplesmente
  não passam esses campos.

---

## 3. Perdas silenciosas no fluxo Renderizar (P0)

### 3.1 Downscale destrutivo no upload

`app/app/generate/GenerateClient.tsx:124-148` + `:441` — `compressImage(sourceUrl, 2048, 0.92)`
reduz **qualquer** input a 2048 px no lado maior, re-encodado JPEG q0.92 num
canvas (downscale bilinear default, sem `imageSmoothingQuality`). Motivo
histórico: o base64 viaja no body JSON (cap de ~4,5 MB da Vercel).

- Um export 4K do SketchUp/Enscape perde metade da resolução linear **antes**
  do modelo ver a imagem. Linhas finas (esquadrias, brises, juntas de
  paginação) chegam degradadas — e o gate geométrico valida contra esse
  original já degradado.
- O Spaces já resolve isso: Vista Mestre sobe **em resolução cheia até 15 MB**
  via upload direto assinado (`lib/spaces/vista-mestre-upload.ts:16-18`). A
  infraestrutura genérica existe e é usada por 6 áreas
  (`lib/storage/direct-upload.ts:48-124`).

**Correção:** migrar o Renderizar para direct upload (área nova
`render-source`, 15 MB, probe de dimensões com sharp) e enviar `inputUrl` em
vez de `imageBase64`. Cap de sanidade server-side por megapixel (ex.: 24 MP)
com downscale **Lanczos** via sharp — nunca canvas no browser.

### 3.2 Fidelity Engine de visão morto no fluxo principal

- `/api/analyze` (`app/api/analyze/route.ts`) → `analyzeImage()`
  (`lib/fidelity-engine.ts:103`) produz o `BriefingArquitetonico` (pavimentos,
  aberturas, materiais aparentes, câmera, entorno, `elementos_preservar[]`).
- **Nenhum código chama `/api/analyze`** (grep sem resultados fora da própria
  rota) e o `GenerateClient` nunca envia `briefing` — logo
  `preservationBlock()` (`lib/prompts.ts:747`) é código morto no Renderizar.
  O briefing só vive no Spaces (`lib/spaces/dna.ts:154`) e no Animar.

**Correção:** chamar `analyzeImage(inputUrl)` **server-side dentro do
`/api/generate`**, em paralelo ao débito (custo ~1 chamada gemini-2.5-flash,
&lt; US$ 0,01; timeout 20 s já embutido, fallback conservador já existe). Cachear
por hash do input para não re-analisar variações do mesmo original. Ganho:
locks específicos ("2 pavimentos", "3 janelas verticais no superior", "casa
vizinha à direita") em todo render Máxima.

### 3.3 Segmento e Espaço não entram no prompt da Máxima

`lib/prompts.ts:790` não desestrutura `environment`; o retorno da Máxima
(`:888-900`) omite `intent` — o único carregador de `segDesc`. Resultado: os
seletores 2 e 3 da UI não alteram nada no nível default, e `ENV_EN`
(150 entradas, `:267-405`) só é consumido pelo legado `buildGenerationPrompt`
que nenhuma rota chama.

**Correção (escolher uma):**
1. Incluir uma linha de contexto neutra no head da Máxima — ex.
   `Scene context (for understanding only, not license to change): {segDesc} {envDesc}.`
   — ajuda o modelo a nomear o que vê (materiais/mobiliário típicos) sem
   licença de redesign; **ou**
2. Ocultar Segmento/Espaço quando `fidelityLevel === 'maximum'` (honestidade de
   UI) e mantê-los só em balanced/creative.

A opção 1 é melhor para realismo (contexto semântico correto reduz
alucinação de uso do espaço) e mantém a UI estável.

### 3.4 `imageLabels` ausente — o bug que o Spaces já corrigiu

`app/api/generate/route.ts:337-344` chama `generateImage` sem `imageLabels`;
`lib/spaces/generation.ts:296` passa. O próprio provider documenta o risco
(`lib/ai/image-provider.ts:76-81`): sem o rótulo textual imediatamente antes de
cada imagem no caminho GCP, o modelo escolhe sozinho qual imagem é âncora — e
tende a ancorar na mais acabada. O Renderizar é justamente o fluxo que põe a
âncora **primeiro** em `image_urls` (`route.ts:269-271`).

**Correção (1 linha + labels):** passar
`['MATERIAL & ATMOSPHERE ANCHOR (image #1)', 'GEOMETRY SOURCE (image #2)', 'STRUCTURAL EDGE MAP']`
conforme a composição de `imageUrls`, espelhando `lib/spaces/references.ts:73-83`.

### 3.5 Aspect ratio nunca fixado

`falParamsForEngine` (`route.ts:68-84`) não envia `aspect_ratio`, embora o
provider aceite e encaminhe para `imageConfig.aspectRatio`
(`image-provider.ts:220, 324`) e o endpoint FAL do NB Pro aceite o parâmetro.
Hoje o drift de formato é apenas **punido depois** pelo `aspectDelta`
(`geometry-score.ts:220-222`), podendo queimar um retry inteiro por algo que um
parâmetro previne.

**Correção:** medir o aspecto do buffer original (já disponível em
`route.ts:259`) e passar o `aspect_ratio` mais próximo suportado.

### 3.6 JPEG hardcoded em toda a cadeia

- Saída da geração: `output_format: 'jpeg'` (`route.ts:74, 82`;
  `lib/spaces/generation.ts:66, 72`) — inclusive no 4K de 40 nodes.
- Editar: gates medem drift no PNG lossless, mas o que é **entregue e vira
  input da próxima edição** é um re-encode JPEG q92 do frame inteiro
  (`lib/edit-v3/pipeline.ts:163-177`), com fallback que chega a **reduzir a
  resolução** (`width * 0.85` até 6×) sem sinalizar.
- Ampliar: resultado fica no CDN da FAL sem verificação nem re-encode
  (`app/api/upscale/route.ts:153`).

Cadeia realista de uso (gerar → 3 edições → ampliar → finalizar) acumula 4-5
gerações JPEG: ringing em montantes de esquadria, blocking em céu/gradientes —
o oposto do posicionamento premium.

**Correção:** padrão **master lossless interno** (PNG ou WebP lossless) por
render/edição, com derivado JPEG/WebP q~90 apenas para exibição. Toda operação
subsequente (editar, ampliar, finalizar, comparador) consome o master. Custo de
storage é real mas controlável (WebP lossless ≈ 40-60% do PNG); no mínimo,
oferecer "Download PNG" no 2K/4K e manter o master até o fim da cadeia de
edição.

### 3.7 Sem normalização de espaço de cor

`recomposeMasked` (`lib/spaces/edit-crop.ts:449-453`) compõe o RGB cru do
modelo dentro do buffer do original e preserva o ICC do original
(`keepMetadata()`). Gemini devolve sRGB sem tag. Se a fonte é Display-P3/Adobe
RGB (comum em exports de V-Ray/Corona/Lightroom), o patch editado sofre shift
de saturação/matiz exatamente dentro da seleção.

**Correção:** `.toColorspace('srgb')` na entrada de todos os pipelines (gerar,
editar, ampliar) e tag sRGB explícita na saída.

---

## 4. Editar V3 — fidelidade local (P0)

O V3 é o fluxo de edição ativo e tem a garantia certa (recompose server-side:
fora da máscara é pixel-idêntico por construção). Mas quatro regressões versus
V1/V2 degradam o resultado **dentro e na borda** da seleção:

| # | Problema | Onde | Correção |
|---|---|---|---|
| 4.1 | **Patch gerado a ≤2K esticado sobre a imagem inteira** — `resolveResolution` força 2K no plano standard (`lib/edit-v3/pricing.ts:96-107`) e o V3 usa `fullRegion` (`pipeline.ts:311`), então numa fonte 6000×4000 a região editada é upscalada ~3× bilinear (`edit-crop.ts:434-438`). V1 cropava bbox+25% (`planCrop`, `edit-crop.ts:348-390`) e gastava o budget do modelo na região de interesse | pipeline.ts:311 | Restaurar o caminho de crop do V1 no V3 (código já existe e é testado em produção) |
| 4.2 | **Feather proporcional à imagem, não à seleção** — `featherSigma = min(W,H)*0.012` (`edit-crop.ts:423`); em 3000×2000 → σ24 ≈ raio 70 px de vazamento de material sobre rodapés/esquadrias em `swap_material`/`insert_element` | edit-crop.ts:423 | Derivar σ do bbox da máscara (ex. `max(2, min(bboxW,bboxH)*0.015)`) |
| 4.3 | **Gate de drift cego na borda** — `softEdges: true` incondicional (`pipeline.ts:323`) + blur da máscara na medição (`edit-crop.ts:512-517`) exclui uma faixa de ~100-200 px originais ao redor da seleção; o vazamento do 4.2 passa invisível | pipeline.ts:323 | `softEdges` só nas ações de blend; medir com máscara dura |
| 4.4 | **Sem retry, sem normalizer, sem gate semântico, sem segmentação** — `buildStrictRetryPrompt` é código morto (`buildEditPrompt.ts:232-240`, nunca chamado); PT cru interpolado no prompt EN (`app/api/edit-v3/google/route.ts:247`); `semantic-gate.ts` e a pilha SAM2/guided-filter do V2 não são usados | vários | Religar normalizer + semantic gate + 1 retry com o prompt estrito já escrito; retomar segmentação assistida para `swap_material` |

No modo **sem máscara**, os únicos limites são 0,4% (no-op) e 92% (blow-up) de
pixels alterados — **um restyle completo do ambiente passa** (`pipeline.ts:334-343`).
O gate semântico é indispensável aí.

---

## 5. Ampliar e Finalizar (P1)

**Ampliar:**
- Fallback silencioso Topaz→Clarity no modo "Alta Fidelidade"
  (`lib/upscale/orchestrator.ts:81-92`): troca um upscaler preservador por
  difusão generativa sem avisar o usuário nem ajustar o preço. Sinalizar na
  resposta/UI e considerar re-tentar Topaz antes de cair.
- Dois presets Clarity divergentes: conservador
  (`presets/clarity-conservative.ts:28-36`, creativity 0.15 + negative) vs. o
  upscale de Vistas (`app/api/vistas/[vistaId]/upscale/route.ts:93-101`,
  creativity **0.3**, `dynamic 6`, **sem negative**) — exatamente a config que
  entorta montantes e inventa fiada de tijolo. Unificar no conservador.
- Topaz chamado sem seleção de modelo (`providers/topaz.ts:28-32`) — o endpoint
  expõe variantes; **High Fidelity** é a certa para render arquitetônico. Também
  fixar `output_format`.
- Sem teto de resolução (8 MP × 8x = pedido de 512 MP; `types.ts:34-42` +
  `route.ts:40`) e sem verificação do output (atingiu o fator? dimensões?).
  Adicionar cap `input_MP × factor² ≤ N` e probe do resultado + re-hospedagem.

**Finalizar** (WebGL2 client-side — polimento que separa "render bom" de "foto"):
- FBOs 8-bit em 6 passes encadeados (`engine/renderer.ts:679`) → banding em
  céus/gradientes. Pedir `EXT_color_buffer_float` + `RGBA16F` com fallback.
- Máscaras rasterizadas a meia resolução (`engine/masks.ts:23`) → halo de 2-4 px
  em arestas duras no export 4K. Rasterizar a resolução cheia no export.
- Gamma aproximado `pow 2.2` (`engine/shaders.ts:34-35`) em vez da curva sRGB
  piecewise → sombras profundas plastificadas ao levantar exposição.
- Export silenciosamente capado a 8192 px (`export.ts:97-103`) contra a promessa
  "resolução original" — no mínimo avisar; ideal: tile rendering para acima do cap.

---

## 6. Capacidades já construídas e desligadas (ligar = ganho barato)

| Capacidade | Onde existe | Onde falta |
|---|---|---|
| Audit semântico pós-geração (Gemini multi-imagem, threshold 0.7) | Spaces (`lib/spaces/preserve-validate.ts:119`) | Renderizar e Editar V3 |
| `preservation_warning` visível ao usuário | Spaces (`generation.ts:388-394`) | Renderizar — a API retorna `fidelityScore`/`fidelityAttempts` (`route.ts:541-542`) e o client **ignora ambos** (`GenerateResult` nem declara os campos) |
| `seed` (reprodutibilidade + retry controlado) | Suportado no provider (`image-provider.ts:219, 319`) | Nenhum caller passa |
| Labels por papel de imagem | Spaces (`references.ts:73-83`) | Renderizar (§3.4) |
| Briefing de visão no prompt | Spaces (DNA) | Renderizar (§3.2) |
| Prompt estrito de retry no Editar | Escrito e exportado (`buildEditPrompt.ts:232-240`) | Nunca chamado |
| Normalizer PT→EN + `requiresStrictGeometry` | Edit V2 (`normalizer.ts`) | Edit V3 |
| Link do render do autopilot | Nodi lê `renderRecord.id` (`v4/executor.ts:48`) | Rota retorna `renderId` (`route.ts:531`) — nunca linka |

Higiene relacionada: `geometryLock` (85) e `fidelityMode` ('strict') continuam
sendo enviados, persistidos em `config_snapshot` e exibidos — mas são inertes na
Máxima. Remover ou reaproveitar (ex.: mapear para `minScore` do gate).

---

## 7. Novas capacidades (roadmap de diferenciação)

### 7.1 Condicionamento estrutural mais forte

1. **Edge map desde a 1ª tentativa** quando o input é CGI sem âncora (hoje só
   entra no retry — `getFidelityAttemptParams`, `render-only.ts:210-214`).
   Custo zero (sharp local). Validar por A/B com o geometry score já logado.
2. **Depth map como segundo canal de condicionamento**: gerar via
   `fal-ai/imageutils/depth` (ou Depth Anything v2) e anexar com label
   `DEPTH MAP (structural constraint)`. Edges seguram contornos; depth segura
   **volumes e perspectiva** — cobre o caso "vanishing points" que hoje pontua
   0.564 e passa no gate de 0.50.
3. **Subir a régua do gate com dados**: o default 0.50 deixa passar mudança de
   câmera (0.693) e de pontos de fuga (0.564) — calibração documentada em
   `tests/fidelity/geometry-score.test.ts:7-11`. Com telemetria de produção
   (`generation_log.fidelity` já persiste tudo), subir gradualmente para
   0.75-0.80 na Máxima.

### 7.2 Score de fidelidade v2 (medir o que o Sobel não vê)

- **ΔE de materiais por região**: histograma Lab em grade 12×12 comparando
  original × gerado nas células estruturalmente estáveis → detecta recolor e
  troca de material (edge recall é cego a cor). Gate + telemetria.
- **Contagem de aberturas via visão**: reaproveitar `geminiMultiVisionJson`
  (`lib/gemini.ts:181`) com rubrica "compare: nº de janelas, portas, pavimentos,
  mobiliário movido" — igual ao `checkArchitecturalPreservation` do Spaces, mas
  com verdicts numéricos somados ao score.
- Subir a resolução de análise do Sobel de 384 px para 768 px (janela movida de
  ~20 cm hoje cai dentro da tolerância de ±2 px em 384 px).

### 7.3 Fidelidade de materiais por referência visual

Hoje materiais são **texto livre** (`buildMaterialsBlock`,
`lib/prompts.ts:630-668`) — exatamente onde modelos inventam veios, paginação e
rejunte. O Gemini 3 Pro aceita até 14 imagens de referência e a infra de upload
com probe já existe (`retocar-reference`, `lib/storage/direct-upload.ts:96-102`):

- Campo de material ganha um **slot de amostra** (foto do porcelanato, da
  madeira, do tecido). Cada amostra entra em `image_urls` com label
  `MATERIAL SAMPLE — floor: reproduce this exact material`.
- No Spaces, virar **kit de materiais do projeto** persistido no DNA e
  reutilizado em toda vista/render do mesmo Space.

É provavelmente a feature de maior impacto percebido por arquiteto: o produto
passa a acertar o *spec* real do projeto, não uma aproximação verbal.

### 7.4 Realismo fotográfico de acabamento

- **Preset "Look Fotográfico" no Finalizar** (determinístico, sem IA → zero
  risco de drift): grain fino, curva de tom S suave, vinheta sutil, leve
  aberração cromática opcional. 1 clique pós-render. É o que separa "render
  limpo demais" de "foto".
- **Passe opcional de micro-detalhe** no 4K de entrega: SeedVR2 ou Topaz com
  creativity 0 + verificação dimensional — apenas quando o usuário pedir, e
  nunca no caminho que alimenta edições.
- **Rubrica VLM de realismo** por render (nota 1-10 "parece fotografia?" +
  razões), gravada em `generation_log` — cria o dataset para A/B de prompts
  (hoje o tuning de negativos é empírico e sem medição, cf. histórico em
  `render-only.ts:31-34`).

### 7.5 Fidelidade como diferencial visível de produto

- **Selo de fidelidade no resultado** (score já retornado pela API) +
  **heatmap de diferenças** no comparador (os edge maps já são computados;
  renderizar o diff como overlay). Transforma engenharia invisível em confiança
  vendável — nenhum concorrente mostra isso.
- **"Corrigir drift" em 1 clique**: re-roda com edge map + temperatura 0 +
  mesmo seed, cobrando como retry (ou grátis se score < gate).

### 7.6 Processo: benchmark de regressão

Mudança de prompt hoje vai para produção sem medição comparável. Proposta:

- Suíte com 15-30 inputs reais (SketchUp cru, Enscape, foto de obra, interiores
  e fachadas) + golden metrics por caso (geometry score, ΔE, rubrica VLM).
- Harness gated por env (`FIDELITY_BENCH=1`) que roda a suíte contra a API real
  e imprime deltas vs. baseline — usar antes de cada mudança em
  `lib/prompts.ts`/`render-only.ts`.
- Dashboard interno (dados já em `renders.generation_log`): p50/p95 do
  fidelity score por engine × resolução, taxa de retry, % abaixo do gate.
  Meta sugerida: p50 ≥ 0.85 na Máxima com gate em 0.75.

---

## 8. Priorização sugerida

**Fase 1 — Quick wins (dias, sem migração):** ✅ **IMPLEMENTADA (2026-08-13)**
1. ✅ `imageLabels` no `/api/generate` (§3.4) — rótulos de papel por imagem
   (âncora/geometria/edge map), espelhando `lib/spaces/references.ts`.
2. ✅ `aspect_ratio` derivado do original (§3.5) — `lib/ai/aspect-ratio.ts`
   pina só quando o aspecto bate (≤2%) com valor suportado por FAL e Vertex.
3. ✅ Briefing server-side no `/api/generate` (§3.2) — body → cache do
   histórico (mesmo `input_url`) → `analyzeImage` com teto de 15 s; não roda
   em `creative` (FACTS travariam materiais contra o propósito do nível).
4. ✅ Contexto Segmento/Espaço na Máxima (§3.3) — bloco `SCENE TYPE` com nome
   curto do ambiente (nunca a descrição prescritiva do `ENV_EN`).
5. ✅ Presets Clarity unificados no conservador (vistas upscale incluído) +
   Topaz com `model: 'High Fidelity V2'` e clamp do fator em 4 (teto do schema
   FAL — antes, 8x falhava direto pro Clarity).
6. ✅ `fidelityScore`/`fidelityWarning` na resposta e na UI do Renderizar
   (aviso abaixo do limite; selo discreto com score ≥ 0.8) + `seed` fixa por
   request no caminho GCP (retries controlados; registrada no
   `generation_log`).
7. ✅ Fallback Topaz→Clarity sinalizado (`fallbackUsed` na resposta + aviso na
   UI do Ampliar).

**Fase 2 — Correções estruturais (1-2 semanas):** ✅ **IMPLEMENTADA (2026-08-13)**
1. ✅ Upload direto no Renderizar (área `render-source`, 15 MB) — fim do
   downscale de 2048 px; preview via objectURL; regeneração reusa `inputUrl`
   (ativa o cache de briefing). `imageBase64` segue aceito (Nodi/legado).
2. ✅ Normalização de entrada (`lib/storage/normalize-image`): rotação EXIF +
   ICC→sRGB + teto 4096 px/9 MB via Lanczos no Renderizar; só EXIF+ICC no
   Editar (o crop limita o que vai ao modelo). Pass-through byte-idêntico
   quando nada é necessário.
3. ✅ Master lossless: geração FAL pede `output_format: 'png'` (alinha com o
   GCP, que já devolvia PNG); Editar V3 entrega o PNG do recompose enquanto
   couber no bucket (JPEG só como fallback de tamanho); download do Renderizar
   nomeia a extensão real.
4. ✅ Editar V3: crop bbox+25% restaurado (`planCrop`/`extractCrop` do v1,
   com o feather derivado da região → proporcional à seleção); medição de
   drift com `softEdges` por ação (padrão v1 — o gate volta a enxergar a borda
   da seleção); retry único com `buildStrictRetryPrompt` em rejeição por
   drift; normalizer PT→EN do V2 religado (+ `requiresStrictGeometry` força
   preservação máxima); gate semântico Gemini — rejeita SEM máscara (fecha o
   "restyle completo passa"), warning COM máscara. Kill-switches:
   `EDIT_V3_NORMALIZER=0`, `EDIT_V3_SEMANTIC_GATE=0`.
5. ✅ Ampliar: teto de output 256 MP checado antes do débito; dimensões reais
   do resultado medidas pós-pipeline (`achieved_factor` em `upscale_meta`,
   dimensões reais na UI).

**Fase 3 — Diferenciação:** 🟡 **PARCIALMENTE IMPLEMENTADA (2026-08-13)**
1. ✅ Edge map na 1ª tentativa para input sem âncora (default ON, kill-switch
   `RENDER_FIDELITY_EDGE_FIRST=0`; A/B via `edge_map_used` na telemetria).
   ✅ Depth map como condicionamento extra — experimental, **default OFF**
   (`RENDER_FIDELITY_DEPTH_MAP=1`; endpoint via `RENDER_DEPTH_ENDPOINT`,
   default `fal-ai/image-preprocessors/depth-anything/v2`).
2. ✅ Score v2: `meanColorDelta`/`worstCellColorDelta` (ΔE Lab por célula) em
   todo geometry score — telemetria sempre; gate opcional via
   `RENDER_FIDELITY_MAX_COLOR_DELTA` (só quando o usuário não pediu mudança de
   luz/material/refinamento). ✅ Auditoria semântica de visão no Renderizar
   (reusa `checkArchitecturalPreservation` do Spaces): roda nos casos
   limítrofes (score < 0.80) por default, `RENDER_SEMANTIC_AUDIT=1` força
   sempre, `=0` desliga; resultado em `generation_log.fidelity.semantic_audit`
   e `semanticWarning` na resposta/UI. ⏳ Subir o gate para 0.75-0.80 continua
   aguardando dados de produção (agora existentes na telemetria).
3. ✅ Amostras visuais de material no Renderizar: slot "+ amostra" por campo
   (área `render-material`), anexadas como referências rotuladas por
   superfície (cap 4) com bloco `MATERIAL SAMPLES` de escopo fechado;
   persistidas em `config_snapshot.material_refs`. ⏳ Kit por Space (DNA)
   fica para a integração Spaces.
4. ✅ Heatmap estrutural no comparador: `GET /api/renders/[id]/diff` renderiza
   o original esmaecido com as bordas NÃO encontradas no render em vermelho
   (mesma lógica do edgeRecall); toggle "Ver mapa de diferenças estruturais"
   na UI. ⏳ "Corrigir drift" em 1 clique fica para a próxima rodada.
5. 🟡 Benchmark: o drop-folder `tests/fidelity/real/` (pares
   `<caso>-original|generated`) já roda no geometry-score.test e agora imprime
   também os ΔE. ⏳ Harness contra a API real + dashboard de telemetria.
6. ⏳ Finalizar (float FBOs, máscara full-res, sRGB piecewise) — não iniciado.

Custo marginal das chamadas novas por render: briefing ≈ US$ 0,001 (Gemini
Flash), depth map ≈ US$ 0,002 (FAL), audit semântico ≈ US$ 0,002 — desprezível
contra 20-40 nodes cobrados.

---

## 9. O que **não** fazer agora

- **Trocar de família de modelo**: NB Pro (Gemini 3 Pro Image) segue o topo do
  mercado em edição com referência e o Vertex GA já é o caminho primário. FLUX.2
  com conditioning estrutural nativo é interessante apenas como experimento de
  4º motor para casos extremos de geometria — não como substituição.
- **ControlNet clássico via Imagen**: a API de Controlled Customization do
  Imagen foi descontinuada pelo Google (shutdown 2026-06-24, migração para
  Gemini Image) — o caminho atual (edge/depth como imagem de referência +
  contrato no prompt) é o correto para a família Gemini.
- **Upscale generativo como etapa padrão**: creativity > 0 em cadeia padrão
  contradiz o contrato de fidelidade; manter opt-in.
