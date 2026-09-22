# Planta Humanizada — harness (2026-09-22)

Reescrita do pipeline do módulo. Este documento é a decisão e a conta; o código
é a fonte de verdade da implementação.

## 1. O que estava errado

### 1.1 O portão de fidelidade media ruído

A rota usava `computeGeometryScore` (mínimo 0,50, até 2 tentativas) para decidir
retry. Essa métrica **foi medida e reprovada para traço fino** no bench do
Ampliar (19/09): numa planta de 1 px, com a análise a 384 px de lado maior, o
edge recall oscila ±7% entre fixtures e **inverte o vencedor**.

Reproduzido aqui em fixtures sintéticas (`tests/fidelity/ink-score.test.ts`):

| caso | ink score (novo) | geometry score (antigo) |
|---|---|---|
| planta fiel, piso claro | **1,000** | 0,882 |
| planta fiel, piso escuro | **1,000** | 0,818 |
| parede movida | **0,369** | 0,761 |
| ambiente removido | **0,562** | 0,877 |
| planta redesenhada | **0,362** | 0,733 |

A linha do ambiente removido é o resumo: a régua antiga classificava uma planta
**com parede faltando** (0,877) acima de uma planta **correta** cujo piso
escureceu (0,818). Ela media escuridão e borda grossa, não estrutura.

Consequências, todas pagas: o retry disparava por sorteio; `best` escolhia a
"melhor" tentativa por um score que era ruído; e cada retry dobrava o custo do
provedor.

### 1.2 A margem não chegava perto de 80%

Receita por geração a 20 nodes, no piso (Office anual, R$ 0,0729/node, FX 5,40):
**US$ 0,27**. Teto de custo para 80% de margem: **US$ 0,054/imagem**.

| motor · rota | US$/img | piso | Studio | Pro | Essence |
|---|---|---|---|---|---|
| Vega `nano-banana-pro` 2K (fal) | 0,150 | 44,4% | 59,4% | 63,4% | 67,3% |
| Vega 2K (Google direto) | 0,134 | 50,4% | 63,7% | 67,3% | 70,8% |
| **Vega + 1 retry do gate** | 0,268 | **0,7%** | 27,5% | 34,5% | 41,5% |
| Pulsar `nano-banana-2` 2K | 0,120 | 55,6% | 67,5% | 70,7% | 73,8% |
| Quasar Seedream 5 Pro · ark `auto_2K` | 0,090 | 66,7% | 75,6% | 78,0% | 80,4% |
| **Quasar Seedream 5 Pro · ark faixa barata** | **0,045** | **83,3%** | 87,8% | 89,0% | 90,2% |
| Quasar Seedream 5 Pro · fal faixa barata | 0,0675 | 75,0% | 81,7% | 83,5% | 85,3% |
| Qwen Image Edit 2509 @ 1,5 MP | 0,045 | 83,3% | 87,8% | 89,0% | 90,2% |
| GPT Image 2.5 (Orion) 2K | ~0,13 est. | ~52% | ~65% | ~69% | ~72% |

Fontes de preço (conferidas em 22/09/2026): fal `bytedance/seedream/v5/pro/edit`
US$ 0,0675 até 1536² e 0,135 até 2048²; ModelArk US$ 0,045 até 2,61 MP e 0,09
acima (já registrado em `lib/ai/ark/seedreamEdit.ts`); Gemini 3 Pro Image
US$ 0,134 em 1K/2K e 0,24 em 4K; Nano Banana 2 US$ 0,08 base, ×1,5 em 2K; Qwen
Image Edit 2509 US$ 0,03/MP; GPT Image 2.5 é por token (US$ 5/8/30 por 1M de
texto-in / imagem-in / imagem-out), então o valor acima é estimativa e precisa
de medição — a regra do `lib/orion/pricing.ts` vale: **dado desconhecido não
vira zero**.

### 1.3 A tipografia estava sendo comprada no lugar errado

A ferramenta pedia ao modelo de imagem que escrevesse os nomes dos ambientes em
português. Texto é a única capacidade em que o `nano-banana-pro` é claramente
superior (94–96% de acerto) — e é exatamente a que não precisa ser comprada.
Pagava-se ~3× por imagem para ter uma capacidade que um `<text>` resolve melhor.

### 1.4 Vinte controles onde cabe um

Nível (3) + tipo de projeto (5) + estilo (5) + seis interruptores + texto livre.
Quase tudo derivável da própria planta.

## 2. O harness

| estágio | onde | custo |
|---|---|---|
| 1. **Leitor de planta** — `gemini-2.5-flash` devolve tipo de projeto, ambientes com nome PT-BR + caixa, se há texto impresso, se há área externa | `lib/apresentar/plan-reader.ts` | ~US$ 0,002 |
| 2. **Humanização** — prompt POR AMBIENTE derivado do brief, sem pedir texto, na faixa barata, 1 tentativa | `lib/apresentar/humanized-plan-prompt.ts` | US$ 0,045 |
| 3. **Portão de tinta** — black-hat morfológico + recall local; só então decide retry | `lib/ai/fidelity/ink-score.ts` | US$ 0 |
| 4. **Rótulos vetoriais** — compostos no cliente nas posições do estágio 1, com a Geist embutida no PNG | `lib/apresentar/plan-labels.ts` | US$ 0 |

**Total ~US$ 0,047 → 82,6% no piso, 87% no Studio**, a 20 nodes, sem mexer no preço.

O estágio 1 nunca derruba a geração: falha de visão vira brief `degraded` e o
pipeline segue com o prompt genérico antigo (e aí, se o usuário pediu nomes, é o
modelo que escreve — porque sem posição não há como desenhar).

### Por que o ink score funciona onde o geometry score falha

1. Cinza **sem blur** (blur a 1 px é o que apaga o traço), lado maior 1024.
2. **Black-hat** `closing(g) − g`: acende em estrutura escura e FINA, e é cego
   ao nível global — parede preta sobre piso bege e sobre piso marrom dão a
   mesma resposta. É o que permite medir uma saída humanizada e colorida contra
   um original em traço.
3. `lineRecall` global **mais** `worstRegionRecall` (pior decil de uma grade
   16×16). O componente espacial é o que decide, e a razão é aritmética: uma
   divisória deslocada é pouca tinta no total (o recall global só cai de 1,00
   para 0,82), mas é **toda** a tinta das células onde ela estava.

Sem o componente espacial a distância entre "mesma planta" e "planta diferente"
era 0,08 — pior que a do geometry score. Com ele, passa de 0,5.

## 3. Envs

| env | default | efeito |
|---|---|---|
| `SEEDREAM_CHEAP_TIER` | *(off)* | **Precisa ser `1`.** Sem ela o pedido vai em `auto_2K` e o custo dobra (US$ 0,09): a margem no piso cai de 83% para 67%. |
| `SEEDREAM_ROUTE` | `fal` | `ark` usa a ModelArk (mais barata e mais rápida). Já em prod. |
| `HUMANIZED_PLAN_READER` | ligado | `0` desliga o estágio 1 (volta ao prompt genérico, sem rótulos). |
| `HUMANIZED_PLAN_FIDELITY_GATE` | ligado | `0` desliga validação e retry. |
| `HUMANIZED_PLAN_MIN_INK_SCORE` | `0.55` | Limite do portão de tinta. |
| `HUMANIZED_PLAN_MAX_ATTEMPTS` | `2` | Teto 3. |

O limite de 0,55 é **conservador de propósito**: as fixtures são sintéticas e
alinham pixel a pixel (fiel = 1,00), enquanto saída de modelo real vai pontuar
abaixo disso. O retry custa uma geração inteira — a 10% de disparo a margem no
piso fica em 81%, a 50% cai para 72%. Calibrar com
`config_snapshot.fidelity.attempts` antes de subir o limite.

## 4. Compatibilidade

O plugin do SketchUp (1.8.0, em produção) manda `projectType/style/level/options`
e **continua funcionando**: quando `look` não vem, a rota exige e usa os campos
soltos exatamente como antes. O web manda `look` no caminho simples e cai nos
campos soltos quando o usuário mexe no ajuste fino — é o mesmo contrato, sem
caminho novo para manter.

## 5. Pendente

- **Smoke pago logado** em `/app/apresentar/planta-humanizada` com plantas reais.
  Nada passou pela rota autenticada (débito `consume_workspace_nodes`, insert em
  `renders`) em nenhum ambiente.
- **`SEEDREAM_CHEAP_TIER=1` na Vercel** — sem isso a margem alvo não é atingida.
- **Bench comparativo** Quasar × Vega × Pulsar × Orion com plantas reais:
  `tests/fidelity/bench.test.ts` já roda as células; falta um caminho que use o
  ink score no lugar do geometry score para material de traço.
- **Aferir a precisão das caixas** do leitor com plantas reais. O rótulo só é
  tão bom quanto o centróide: `layoutLabels` já descarta ambiente pequeno demais,
  mas caixa errada põe o nome no cômodo errado.
