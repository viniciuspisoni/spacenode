# Ampliar — medições que decidiram o motor (2026-09-18)

Tudo aqui saiu de chamadas **reais** ao FAL, medidas com
`computeGeometryScore` (`lib/ai/fidelity/geometry-score.ts`) e com nitidez
(desvio-padrão do laplaciano). O objetivo era responder três perguntas que
estavam sendo decididas por intuição no código.

Fonte: recorte 640×480 de `tests/fidelity/bench/inputs/interior-mezanino-comercial.jpg`
(SketchUp cru: tijolo aparente, guarda-corpo de barras finas, esquadria) — a
classe de imagem que domina a base da SpaceNode.

Leitura das colunas: **score** e **recall** medem preservação de estrutura
(quanto mais alto, mais fiel ao original); **ΔE** mede desvio de cor (quanto
mais baixo, melhor); **nitidez** é energia de alta frequência.

---

## 1. `output_format` — o achado de maior impacto

O default do FAL é `jpeg`. Ninguém o sobrescrevia, então **todo upscale já
entregue pelo módulo saiu recomprimido em JPEG**.

| variante | score | recall | ΔE médio | ΔE pior | nitidez |
|---|---|---|---|---|---|
| Lanczos (referência burra) | 0,9969 | 0,9976 | 0,173 | 0,770 | 20,46 |
| High Fidelity V2 — **jpeg** | 0,9903 | 0,9904 | 0,514 | 1,526 | 38,36 |
| High Fidelity V2 — **png**  | **0,9923** | **0,9926** | **0,414** | **1,221** | **39,68** |

Mesmo pedido, mesma imagem: o PNG sobe o score, sobe a nitidez e **derruba o
desvio de cor em 20%**. Era detalhe pago e jogado fora na saída.
→ `output_format: 'png'` (com teto: acima de 64 MP de saída volta a jpeg,
senão o arquivo passa de 150 MB e quebra download e re-hospedagem).

## 2. `model` — o `CGI` foi testado e reprovado

A descrição da Topaz diz que `CGI` mira "art and rendered graphics", o que
descreve literalmente a entrada da SpaceNode. Não se sustentou:

| modelo | score | recall | ΔE médio | ΔE pior | nitidez |
|---|---|---|---|---|---|
| **High Fidelity V2** | **0,9923** | 0,9926 | **0,414** | **1,221** | **39,68** |
| CGI | 0,9906 | 0,9978 | 0,976 | 2,375 | 33,10 |

O `CGI` tem recall alto mas o pior `worstBlockDelta` (0,0502 contra 0,0231),
**mais que o dobro do desvio de cor** e menos nitidez. Na inspeção 1:1 ele
afina as barras do guarda-corpo e estoura o contraste do tijolo — ou seja,
altera geometria e cor, os dois itens do contrato do módulo.
→ **`High Fidelity V2` mantido.** A escolha que já estava no código estava
certa; agora está medida.

## 3. `recover` — o Clarity era pior que não fazer nada

Experimento com **verdade de campo**: degradou-se o recorte nítido para
320×240 em JPEG qualidade 35 (a cara de um print de WhatsApp), recuperou-se a
2× e comparou-se contra o original conhecido.

| motor | score | recall | ΔE médio | ΔE pior | tempo |
|---|---|---|---|---|---|
| Lanczos (referência burra) | 0,9802 | 0,9825 | 3,200 | 8,441 | 0 s |
| **Clarity (era o primário)** | **0,9307** | **0,9207** | 3,205 | 6,785 | 38,4 s |
| Topaz Low Resolution V2 | 0,9684 | 0,9752 | **1,777** | **5,267** | 19,3 s |
| **Topaz High Fidelity V2** | **0,9821** | **0,9854** | 1,904 | 5,674 | 23,3 s |

O Clarity ficou **abaixo de um Lanczos burro**: perdeu 8% das arestas
estruturais do original. Na inspeção 1:1, as barras do guarda-corpo viram um
borrão preto sólido e a laje some. É o comportamento esperado de difusão
(Stable Diffusion) — ela inventa quando falta informação — e é exatamente o
que o módulo promete não fazer. Ainda por cima era o mais lento.

O `Low Resolution V2` tem a melhor cor mas suaviza demais (barras somem).
→ **`recover` migrou para Topaz High Fidelity V2 + `fix_compression: 0.6`.**
O Clarity ficou só como fallback de emergência, com aviso na UI.

## 4. `face_enhancement` — desligado por contrato, não por número

Default do FAL: **`true`, com `face_enhancement_strength: 0.8`**. Nunca foi
desligado.

Medido neste recorte, ligar ou desligar dá **resultado idêntico** (0,9923 /
ΔE 0,414 nos dois casos) — porque não há rosto nele. A diferença que parecia
vir daqui era, na verdade, do formato de saída (item 1).

Fica em `false` assim mesmo: render arquitetônico é cheio de figura humana de
escala, e "melhorar rosto" é redesenhar rosto — o elemento inventado que o
módulo promete não produzir. É um parâmetro cujo custo de estar errado é alto
e cujo custo de estar desligado é zero.

## 5. Tempo — depende do INPUT, não do output

| entrada | fator | saída | tempo |
|---|---|---|---|
| 640×480 (0,31 MP) | 2× | 1,2 MP | 15–17 s |
| 2207×857 (1,89 MP) | 2× | 7,6 MP | 32,4 s |
| 2207×857 (1,89 MP) | **4×** | **30 MP** | **33,2 s** |

**4× custa praticamente o mesmo tempo que 2×.** O modelo que a UI usa para
estimar é `≈ 12 s + 11 s por megapixel de entrada`.

Consequência de projeto: um 8× em duas passadas (4× e depois 2×) **não é
viável** — a segunda passada receberia 30 MP de entrada, o que projeta ~285 s
sozinha, acima do `maxDuration` de 300 s da rota. Foi por isso que 8× saiu da
oferta em vez de virar pipeline de dois passos.

## 6. Teto real de escala (schema OpenAPI do FAL, 18/09/2026)

`upscale_factor` tem `maximum: 4` **nos dois** motores (Topaz e Clarity).
A UI oferecia 8×, o custo cobrava 5× a base (50 nodes na Alta Fidelidade), o
Topaz devolvia calado uma imagem 4× (trabalho de 20 nodes) e o fallback
Clarity, se chamado, nem rodava — 8 > `maximum` derruba o request antes.
→ `MAX_UPSCALE_FACTOR = 4` virou fonte única de UI, custo e validação.

---

## Como repetir

As sondas foram scripts descartáveis (não versionados). O essencial:

1. Schema vigente de um endpoint:
   `curl "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/topaz/upscale/image"`
2. Rodar variantes com `fal.subscribe` e `FAL_KEY` do `.env.local`.
3. Medir com `computeGeometryScore(originalBuffer, resultadoBuffer)`.
4. Para o caminho `recover`, degradar um original conhecido e comparar o
   resultado **contra o original**, não contra a degradada — sem verdade de
   campo o teste não distingue "recuperou" de "inventou bonito".

---

# Validação final — imagens reais pelo caminho da rota (18/09/2026)

Três casos percorreram o mesmo encadeamento de `app/api/upscale/route.ts`
(`normalizeSource` → teto → custo → `runUpscalePipeline` → verificação do
output), com renders reais de `tests/fidelity/bench/inputs/` e o FAL de verdade.

| caso | entrada | saída | PNG | nodes | motor | rota inteira | score | ΔE méd |
|---|---|---|---|---|---|---|---|---|
| mezanino 2× | 2207×857 (1,89 MP) | 4414×1714 (7,6 MP) | 12,1 MB | 10 | 16,2 s | **21,4 s** | 0,9938 | 0,446 |
| mezanino 4× | 2207×857 (1,89 MP) | 8828×3428 (30,3 MP) | **39,7 MB** | 20 | 31,0 s | **35,7 s** | 0,9933 | 0,452 |
| sala 4× | 1280×1600 (2,05 MP) | 5120×6400 (32,8 MP) | 37,5 MB | 20 | 35,9 s | **51,9 s** | 0,9944 | 0,380 |

Fator atingido = fator pedido nos três (2,00× e 4,00×), sem recorte. Folga
grande contra o `maxDuration` de 300 s: o pior caso usou 17% do orçamento.

O passo de verificação do output (baixar o PNG + `sharp().metadata()`) custou
2,8–14,6 s — variação do CDN da FAL, não do tamanho: os 39,7 MB baixaram em
2,8 s e os 37,5 MB em 14,6 s. O `sharp().metadata()` em si custa 1–2 ms
(lê só o cabeçalho, não decodifica).

## 7. Perfil de cor — o provider preserva, então não se mexe

A primeira versão do `normalizeSource` convertia perfis fora de sRGB para sRGB
"para não perder cor". Dois experimentos derrubaram a ideia:

**A detecção não funcionava.** `sharp.metadata().space` descreve o layout de
canais, não o espaço do perfil: um PNG marcado como Display P3 reporta
`space: 'srgb'` igual a um sRGB. A condição `meta.space !== 'srgb'` nunca era
verdadeira para RGB — o ramo era código morto.

**E se funcionasse, pioraria.** Um recorte real marcado como Display P3
atravessou o pipeline:

| | ICC | bytes | descrição |
|---|---|---|---|
| entrada | sim | 480 | `mluc enUS s P 3 C` (Display P3) |
| saída do Topaz | sim | 480 | `mluc enUS s P 3 C` |

O perfil volta idêntico. Números e perfil viajam juntos, a cor já chega certa,
e converter na entrada só recortaria o gamut de uma origem wide-gamut à toa.
→ `normalizeSource` trata **apenas orientação EXIF**, que é necessária porque a
saída é PNG e PNG não tem tag de orientação.

## 8. O PNG de 40 MB é entregável

`Content-Length: 41.653.666` · `content-type: image/png` ·
`access-control-allow-origin: *` — o `fetch` + `blob()` do botão Baixar
funciona (não cai no `window.open`). Medido em Chromium real:

| | carregar+decodificar | modo 100% | download (fetch+blob) | erros |
|---|---|---|---|---|
| desktop 1366×768 | 12,0 s | 8828 px, sem estouro | 9,0 s · 39,7 MB | nenhum |
| mobile 390×844 | 11,3 s | 8828 px, sem estouro | 4,0 s · 39,7 MB | nenhum |

Ressalva honesta: um bitmap 8828×3428 decodificado ocupa ~121 MB de memória de
raster, que **não** aparece em `performance.memory` (só o heap JS, 14 MB). O
Chromium headless aguentou; aparelho de baixo custo é risco não medido.
