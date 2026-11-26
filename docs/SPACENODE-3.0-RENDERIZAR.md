# SpaceNode 3.0 — Renderizar em três camadas

Estudo de 26/11/2026, feito sobre `origin/main` (`fb49171c`). Nada foi implementado ainda e nenhuma chamada paga foi feita. Os preços vêm das páginas oficiais quando foi possível ler a página. Quando a fonte é um revendedor ou um blog, a linha diz isso.

## 1. Resumo

- **Hoje o Renderizar já tem as três camadas, mas fracas nas pontas.** A leitura usa o `gemini-2.5-flash`, um modelo de duas gerações atrás. A conferência é só por pixel: o geometry score com Sobel mais a escada de retry. Nenhum modelo confere o resultado contra o projeto.
- **A régua dos 75% é US$ 0,00647 por node** no Essence anual (R$ 111,75 ÷ 800 = R$ 0,1397/node; câmbio de trabalho R$ 5,40). Um render de 20 nodes pode gastar, **somando leitura, geração, retries e conferência, no máximo US$ 0,129**.
- **Dois motores atuais já ficam abaixo de 75% no Essence.** O Vega 2K (Nano Banana Pro, US$ 0,134) fica em 71–74% e o Pulsar 2K (Nano Banana 2, US$ 0,101) em 69–74%, antes de contar retry. O Quasar (Seedream 5.0 Pro na ModelArk) fica entre 82% e 91%.
- **Quem chegou e muda a conta:**
  - **Nano Banana 2.1:** US$ 0,0504 em 2K no preço oficial, metade do Nano Banana 2. Fica em 9º na Arena de edição, à frente do Nano Banana Pro, que está em 19º.
  - **MAI-Image-2.7**, da Microsoft: 1º no Artificial Analysis. Custa ~US$ 0,035 em 1K, mas ~US$ 0,14 em 2K: o preço é por token e cresce com os pixels.
  - **Seedream 5.5**, lançado em 09/11: ~US$ 0,035 em 2K mais US$ 0,008 por referência (preço de revendedor; conferir no console da ModelArk).
  - **GPT Image 2.6 Sunburst:** continua no topo de preferência, mas é o mais caro.
- **Proposta de catálogo 3.0, a ser confirmada no bench:**
  - **Padrão, 20 nodes:** Nano Banana 2.1 ou Seedream 5.5, com leitura e conferência pelo Claude Sonnet 5.5. Dá 76–78% de margem pelo mesmo preço do Quasar de hoje.
  - **Premium, 42 nodes:** GPT Image 2.6 Sunburst, com leitura pelo Opus 5.5.
  - **Rascunho, 5 nodes:** Seedream 5.0 Flash.
- **Ranking público não escolhe motor para nós.** Leaderboard mede preferência estética e não fidelidade ao print. O histórico da casa mostra isso: o Seedream 5.0 Pro ganhou do GPT Image 2 em produção, e no piloto do Orion o Flare empatou com o Sunburst. **A decisão sai do bench da seção 8, que é pago e precisa de aprovação (~US$ 80–120).**

## 2. Como o Renderizar funciona hoje

Fluxo de `app/api/generate/route.ts` no main:

1. **Leitura (briefing "PROJECT FACTS").** A rota primeiro tenta o cache: um briefing já salvo para o mesmo `input_url` da conta em `renders.config_snapshot`. Sem cache, chama `analyzeImage` (`lib/fidelity-engine.ts`) com o **gemini-2.5-flash** e um teto de 15 s. O inventário de materiais vive em `lib/ai/material-inventory.ts`. Se a análise falha, o render segue sem briefing.
2. **Prompt por motor.** `lib/ai/render-prompt-profile.ts` monta um perfil para cada motor (Vega, Pulsar, Quasar, Orion) em cima do contrato `render_only` de `lib/ai/fidelity/render-only.ts`, revisado em 30/10 (`docs/RENDER-PROMPTS-2026-10-30.md`). O briefing entra como observação falível, abaixo das instruções do usuário.
3. **Geração.** O catálogo está em `lib/engines.ts` e os parâmetros em `lib/ai/engine-params.ts`:

| Motor | Modelo | Rota | Nodes |
| --- | --- | --- | --- |
| Quasar (padrão) | Seedream 5.0 Pro Edit | ModelArk, com fal como fallback | 20 (2K) |
| Vega | Nano Banana Pro (Gemini 3 Pro Image) | Vertex, com fal no hedge de 45 s | 20 (2K) / 40 (4K) |
| Pulsar | Nano Banana 2 (Gemini 3.1 Flash Image) | Vertex e fal | 10 / 15 / 25 |
| Orion | GPT Image 2.5 Flare `high` | OpenAI | 20 / 40 |

4. **Conferência.** `lib/ai/fidelity/geometry-score.ts` compara bordas fortes do original e do resultado (recall de bordas e correlação por blocos). Abaixo de `RENDER_FIDELITY_MIN_SCORE` (0,50), a rota tenta de novo com condicionamento reforçado, até `RENDER_FIDELITY_MAX_ATTEMPTS` (2, teto 3). O Orion não tem retry. O próprio harness da Planta Humanizada mostrou que esse score põe planta com parede faltando acima de planta certa. Ele mede contorno, não sentido.

**O que falta:** a conferência não sabe o que deveria estar na imagem. Ela não verifica se a janela da esquerda continua lá, se a bancada ainda é de granito ou se a luminária pendente sumiu. É exatamente isso que um LLM de visão faz bem quando recebe o checklist da camada 1.

## 3. A régua econômica

| Item | Valor |
| --- | --- |
| Receita por node, Essence anual | R$ 111,75 ÷ 800 = **R$ 0,1397** → **US$ 0,02587** (R$ 5,40) |
| Custo máximo por node com margem de 75% | **US$ 0,00647** |
| Fator de desperdício (falhas cobradas, fallback) | 1,08, o mesmo de `lib/edit-v4/pricing.ts` |
| Tentativas esperadas por entrega, E[t] | 1,3 (hipótese: 30% de reprovação na 1ª, teto de 2) |

Fórmula: `nodes = ceil( (C_leitura + E[t] × (C_geração + C_conferência)) × 1,08 ÷ 0,00647 )`

A leitura entra uma vez porque é feita por imagem de entrada e já tem cache. Re-renderizar o mesmo print não paga leitura de novo. As contas abaixo supõem cache zero, o pior caso.

**Três avisos antes de fixar preço:**

1. **Studio anual:** R$ 374,25 ÷ 4.000 = R$ 0,0936/node (US$ 0,0173). Com o mesmo custo, a margem do Studio fica ~11 pontos abaixo da do Essence: o Padrão a 20 nodes dá 64% no Studio. Se os 75% precisam valer em todos os planos, a régua passa a ser o Studio, com teto de US$ 0,00433/node.
2. **Câmbio:** com o dólar a R$ 5,80, o mesmo Padrão cai de 76% para 74%.
3. **Margem bruta aqui é sobre o preço do node,** sem Stripe (~4–5%) e sem imposto. A margem que sobra depois disso é menor.

### Margem dos motores atuais no Essence (1 tentativa, sem retry)

| Motor | Nodes | Receita US$ | Custo US$ | Margem |
| --- | ---: | ---: | ---: | ---: |
| Quasar 2K (ModelArk, faixa barata / cheia) | 20 | 0,517 | 0,047 / 0,092 | 91% / 82% |
| Vega 2K (Vertex / fal) | 20 | 0,517 | 0,136 / 0,15 | 74% / 71% |
| Vega 4K (Vertex / fal) | 40 | 1,035 | 0,24 / 0,30 | 77% / 71% |
| Pulsar 2K (Vertex / fal) | 15 | 0,388 | 0,101 / 0,12 | 74% / 69% |

## 4. Camada 1: leitura do print

**Papel:** transformar o print num **contrato verificável**, não numa descrição bonita. A saída é JSON estrito com:

- Câmera: altura do horizonte, pontos de fuga, FOV estimado, enquadramento.
- Tipo de input: SketchUp sem textura, SketchUp com textura, render, foto ou CAD.
- Inventário numerado: aberturas, marcenaria, mobiliário, bancadas, luminárias, metais e vegetação, cada item com bbox aproximada.
- Material por superfície, com a evidência visual.
- Luz: fontes, estado das luminárias e hora sugerida pela cena.
- Ambiguidades, ou seja, o que o modelo não consegue afirmar.

Esse inventário vira o checklist da camada 3.

Custo por leitura: imagem de ~1,6k tokens mais instruções, saída de ~1,5–2k tokens.

| Candidato | Preço por 1M tokens (entrada / saída) | Custo por leitura | Observação |
| --- | --- | ---: | --- |
| **Claude Sonnet 5.5** | US$ 2 / 10 | ~US$ 0,024 | Bom em saída estruturada estrita (structured outputs) e em instrução longa. Candidato principal. |
| **Gemini 3.1 Pro** | US$ 2 / 12 | ~US$ 0,028 | 1º no MMMU (83,8%) em 07/11. A família do gerador é a mesma no caso do Nano Banana, o que importa na camada 3, não aqui. |
| Claude Opus 5.5 | US$ 4 / 20 | ~US$ 0,048 | Para o Premium. O teto de qualidade da leitura. |
| GPT-5.5 | US$ 5 / 30 | ~US$ 0,07 | 2º no MMMU (83,0%). O mais caro por leitura. |
| Gemini 3.8 Flash | US$ 0,75 / 3,75 (**dobra em 01/01/27**) | ~US$ 0,007 | A troca natural do `gemini-2.5-flash` atual, com mudança mínima de código. |
| Claude Haiku 5.5 | US$ 0,10 / 0,50 | ~US$ 0,001 | Para o Rascunho. Qualidade de leitura espacial a medir. |
| Grok 4.7 | — | — | Não achei benchmark público de visão nem preço oficial de imagem. Entra no bench só se você quiser. |

**Recomendação:** colocar no bench Sonnet 5.5, Gemini 3.1 Pro e GPT-5.5 contra uma anotação manual de 30 prints. A métrica é o recall do inventário: quantos elementos reais o modelo listou e quantos inventou. **Ganho imediato, sem esperar o bench:** trocar o `gemini-2.5-flash` pelo Gemini 3.8 Flash em `lib/gemini.ts`, que custa centavos.

## 5. Camada 2: geração

Preço de uma edição em 2K com uma imagem de entrada:

| Modelo | Arena edição (nov/26) | US$ por imagem 2K | Fonte do preço |
| --- | --- | ---: | --- |
| GPT Image 2.6 Sunburst `high` | 3º (1.481) | ~0,12–0,14 (saída ~0,115 em 2160² + entrada) | Tokens oficiais da OpenAI (US$ 30/M de saída); valor por imagem calculado por terceiros |
| GPT Image 2.6 Flare `medium` | 6º (1.461) | ~0,05–0,07 | Runway Dev e terceiros |
| MAI-Image-2.7 | 4º na Arena, **1º no Artificial Analysis** | ~0,035 em 1K; **~0,14 em 2K** | fal: US$ 34/M tokens de saída, ~1.024 tokens por MP (conferido em 26/11, ver bench) |
| **Nano Banana 2.1** | 9º (1.427) | **0,0504** (4K: 0,113) | **Página oficial do Google** |
| Seedream 5.5 | sem nota ainda | ~0,035 + 0,008/referência | Revendedores e BytePlus via terceiros; **conferir no console** |
| Seedream 5.0 Pro (Quasar atual) | 14º (1.392) | 0,045 (≤ 2,61 MP) / 0,09 | ModelArk, conferido no repositório em set/26 |
| Grok Imagine Image 2.0 | 7º (1.437) | a levantar | — |
| Seedream 5.0 Flash | — | 0,018 fixo | Vários agregadores concordam |
| MAI-Image-2.7-Flash | — | ~0,010 (estimativa) | Terceiros |
| Nano Banana 2 (Pulsar atual) | — | 0,101 | Página oficial do Google |
| Nano Banana Pro (Vega atual) | ~19º | 0,134 (4K: 0,24) | Página oficial do Google |

**Três leituras da tabela:**

1. **O Nano Banana 2.1 tira o sentido do Vega e do Pulsar como estão.** Custa metade do Nano Banana 2 e pouco mais de um terço do Pro, e está acima dos dois em preferência. Se ele empatar em fidelidade no nosso bench, os dois motores Google atuais saem.
2. **O Seedream 5.5 é o sucessor natural do Quasar** (edição em rodadas, mesma API da ModelArk). O risco é o preço, que ainda não vimos na fonte oficial.
3. **O GPT Image 2.6 Sunburst só cabe como Premium,** acima de 40 nodes.

## 6. Camada 3: conferência

Dois portões, do mais barato para o mais caro:

1. **Portão determinístico (grátis, já existe).** Geometry score, aspecto e enquadramento, mais o portão de tinta da Planta Humanizada quando o input é planta. Reprovação grosseira volta para retry sem gastar LLM.
2. **Juiz de visão com checklist.** O juiz recebe o original, o resultado, os recortes 2× das regiões do inventário e o JSON da camada 1. Ele responde item a item:

```json
{ "itens": [{ "id": 7, "presente": true, "mesma_posicao": true, "mesmo_material": false,
              "defeito": "bancada virou mármore branco", "bbox": [0.41,0.55,0.78,0.71] }],
  "camera_preservada": true, "fotorrealismo": 4, "artefatos": ["mão da cadeira deformada"],
  "veredito": "retry_localizado" }
```

O veredito tem três valores:

- `entregar`
- `retry_localizado`: mesmo motor, com um prompt corretivo que nomeia o item e a bbox.
- `trocar_motor`: fallback para o segundo motor da faixa.

Com no máximo 2 tentativas, o usuário recebe a melhor das duas e **nunca paga a mais**. O retry já está no preço pelo E[t].

| Candidato a juiz | Custo por conferência (~5k tokens de entrada, ~0,8k de saída) |
| --- | ---: |
| Claude Sonnet 5.5 | ~US$ 0,018 |
| Gemini 3.1 Pro | ~US$ 0,020 |
| Claude Opus 5.5 | ~US$ 0,036 |
| GPT-5.5 | ~US$ 0,049 |
| Gemini 3.8 Flash | ~US$ 0,007 |
| Claude Haiku 5.5 | ~US$ 0,001 |

**Regras do juiz:**

- **Família diferente da do gerador.** Gemini não julga Nano Banana. Isso reduz o viés de autopreferência.
- **Calibração contra rótulo humano antes de ligar.** Meta: concordância com o seu "entregaria ao cliente?" com kappa ≥ 0,6. Juiz sem calibração só troca um ruído por outro.
- **Escalonar.** O juiz barato (Haiku 5.5 ou Gemini Flash) vê tudo. Só o caso limítrofe sobe para Sonnet ou Opus. Isso derruba o custo médio sem perder o caso difícil.
- **Juiz não aprova troca de material sozinho.** Quando o usuário pede troca de acabamento, o checklist muda para a superfície nomeada, como no contrato de 30/10.

## 7. Catálogo 3.0 proposto

Custos da seção 3, com cache zero na leitura, E[t] = 1,3 e desperdício de 1,08:

| Faixa | Leitura | Geração | Conferência | Custo esperado | Nodes p/ 75% | Proposta | Margem Essence | Margem Studio |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| **Rascunho** | Haiku 5.5 | Seedream 5.0 Flash | Haiku 5.5 | US$ 0,028 | 5 | **5** | 78% | 68% |
| **Padrão** (A) | Sonnet 5.5 | Nano Banana 2.1 | Sonnet 5.5 | US$ 0,124 | 20 | **20** | 76% | 64% |
| **Padrão** (B) | Sonnet 5.5 | Seedream 5.5 | Sonnet 5.5 | US$ 0,112 | 18 | **20** | 78% | 68% |
| Padrão econômico | Gemini 3.8 Flash | Nano Banana 2.1 | Gemini 3.8 Flash* | US$ 0,090 | 14 | 15 | 77% | 65% |
| **4K** | Sonnet 5.5 | Nano Banana 2.1 4K | Sonnet 5.5 | US$ 0,213 | 33 | **35** | 76% | 65% |
| **Premium** | Opus 5.5 | GPT Image 2.6 Sunburst | Sonnet 5.5 | US$ 0,260 | 41 | **42** | 76% | 64% |

\* Viola a regra de família diferente quando o gerador é Google. Serve só de referência de piso.

O Padrão A ou B **mantém o preço que o usuário já conhece (20 nodes) e acrescenta leitura e conferência de verdade**. O Premium sobe de 20 para 42 nodes. Isso é decisão de produto: hoje o Vega e o Orion cobram 20 com margem apertada.

## 8. Plano do harness e do bench

O bench está implementado em `tests/bench3/`. Como rodar: [BENCH-RENDERIZAR-3.md](BENCH-RENDERIZAR-3.md). Com os preços da fal conferidos em 26/11, a estimativa de A+B+C é US$ 118: a fase B é maior que a previsão abaixo porque o MAI-Image-2.7 em 2K e o Seedream 5.0 Pro pela fal custam mais.

**Conjunto:** 60 prints reais, cada um com o "entregaria?" do dono. Distribuição:

- 20 interiores com marcenaria lisa e piso paginado
- 15 fachadas com esquadria fina
- 10 com espelho, vidro ou cortina fechada
- 10 SketchUp sem textura
- 5 com refinamento sobre âncora

Hoje os inputs de `tests/fidelity/bench/inputs` não estão no repositório, e esse é o primeiro bloqueio.

**Fases** (todas pagas e opt-in, como no `tests/fidelity/bench.test.ts` atual):

| Fase | O que mede | Volume | Custo estimado |
| --- | --- | --- | ---: |
| A. Leitura | Recall e alucinação do inventário contra anotação manual | 30 prints × 4 leitores | < US$ 10 |
| B. Geração | Fidelidade (geometria, material e luz separados, pior caso), latência, custo por imagem **aceita** | 60 × 6 motores × 2 repetições = 720 imagens | US$ 45–60 |
| C. Juiz | Concordância com o rótulo humano (kappa), falsos aprovados | 720 saídas × 3–4 juízes | US$ 15–35 |
| D. Ponta a ponta | O harness inteiro, com retry, numa amostra nova de 20 prints | 20 × 3 faixas | ~US$ 10 |

Os 6 motores da fase B são: Nano Banana 2.1, Seedream 5.5, Seedream 5.0 Pro (controle), GPT Image 2.6 Sunburst, MAI-Image-2.7 e Grok Imagine 2.0.

**Total: ~US$ 80–120.** Os rótulos humanos são o gargalo de tempo: ~2–3 h do dono para 720 imagens com uma interface de "aprovar / reprovar + motivo".

**Critério de decisão:** em cada faixa, vence o combo com a **maior taxa de aceite humano** entre os que fecham ≥ 75% no Essence. Em empate de até 3 pontos, vence o mais barato. O número que importa é o **custo por imagem aceita**, não o custo por chamada.

## 9. Decisões pendentes do dono

1. **Os 75% valem no Essence ou em todos os planos?** No Studio a mesma tabela dá 64–68%.
2. **Aprovar o bench pago** (~US$ 80–120) e separar os 60 prints de teste.
3. **Premium a ~42 nodes.** Aceita subir, ou o Premium sai do catálogo?
4. **Grok entra no bench?** Não há evidência pública de visão que justifique por enquanto. O Grok Imagine 2.0, como gerador, tem.
5. **Retry absorvido pela margem.** Proposta: o usuário nunca paga a 2ª tentativa.

## 10. Ganhos rápidos, antes do 3.0

- Trocar o `gemini-2.5-flash` da leitura pelo Gemini 3.8 Flash (`lib/gemini.ts`, `lib/fidelity-engine.ts`).
- Testar o Nano Banana 2.1 como substituto do Pulsar. Ele derruba o custo de US$ 0,101 para US$ 0,050 com o mesmo preço em nodes, e a margem do Pulsar 2K sobe de ~74% para ~87%.
- Conferir no console da ModelArk o preço real do Seedream 5.5 e do 5.0 Flash.

## Fontes

- Preços oficiais do Google (Nano Banana 2.1, 2, Pro; Gemini 3.8 Flash, 3.1 Pro): [aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing)
- Preços oficiais da OpenAI (GPT Image 2.6 e 2.5, GPT-5.5): [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing)
- Preços da Anthropic (Opus 5.5, Sonnet 5.5, Haiku 5.5): tabela da skill `claude-api`, em cache de 03/11/2026
- Arena, edição de imagem: [arena.ai/leaderboard/image-edit](https://arena.ai/leaderboard/image-edit)
- Artificial Analysis via [benchmarklist](https://benchmarklist.com/arenas/artificial_analysis_image_editing/) e [llm-stats](https://llm-stats.com/leaderboards/best-ai-for-image-editing)
- MAI-Image-2.7: [Azure AI catalog](https://ai.azure.com/catalog/models/MAI-Image-2.7), [OpenRouter](https://openrouter.ai/microsoft/mai-image-2.7), [Hermes](https://hermes-ai.net/news/microsoft-s-mai-image-2-7-tops-editing-charts-at-one-sixth-the-cost/)
- GPT Image 2.6 por imagem: [Runway Dev](https://dev.runway.com/learn/gpt-image-2-6-api), [Treza Labs](https://www.trezalabs.com/blog/gpt-image-2-6-api-pricing-through-a-pipeline)
- Seedream 5.5: [Apiyi (preço Volcano Ark)](https://help.apiyi.com/en/seedream-5-5-api-pricing-generation-editing-layers-en.html), [BeatAPI](https://beatapi.io/blog/seedream-5-5-api-pricing)
- Seedream 5.0 Flash e Pro: [Atlas Cloud](https://www.atlascloud.ai/blog/tips/seedream-5.0-flash-vs-pro), [Digital Applied](https://www.digitalapplied.com/blog/gpt-image-2-6-vs-gemini-flux-seedream)
- MMMU nov/26: [pricepertoken](https://pricepertoken.com/leaderboards/benchmark/mmmu)
- Grok: [docs.x.ai](https://docs.x.ai/docs/models), [G2](https://www.g2.com/articles/xai-grok-api-cost)
