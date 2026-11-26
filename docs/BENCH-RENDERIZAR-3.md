# Bench do Renderizar 3.0: como rodar

O bench que escolhe os modelos das três camadas do SpaceNode 3.0 (leitura, geração e conferência). O porquê e as hipóteses estão em [SPACENODE-3.0-RENDERIZAR.md](SPACENODE-3.0-RENDERIZAR.md). O código fica em `tests/bench3/`.

As fases `read`, `generate`, `judge` e `e2e` **são pagas**. Elas só rodam com `BENCH3=1` e com o teto de gasto aprovado em `BENCH3_APPROVE_USD`. Antes da primeira chamada, o runner calcula a estimativa da fase e recusa se ela passar do teto. Durante a execução, cada chamada reserva seu custo, e nenhuma sai depois que o teto é atingido. O runner é retomável: o que já tem arquivo em `tests/bench3/data/` não é chamado de novo.

## Antes de começar

1. **Chaves no `.env.local`** (nunca na linha de comando): `FAL_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` e **`ANTHROPIC_API_KEY`**, que ainda falta. Sem ela, os leitores e juízes Claude falham na fase `check`.
2. **Prints em `tests/bench3/data/inputs/`.** A pasta está no `.gitignore`, então os projetos de cliente não sobem para o git. O prefixo do nome define a categoria:

| Prefixo | Categoria | Quantidade sugerida |
| --- | --- | ---: |
| `interior-` | interior com marcenaria lisa e piso paginado | 20 |
| `fachada-` | fachada com esquadria fina | 15 |
| `espelho-` (`espelho-ext-` se for externo) | espelho, vidro ou cortina fechada | 10 |
| `sketchup-` (`sketchup-ext-` se for externo) | SketchUp sem textura | 10 |
| qualquer outro | outro | 5 |

3. **Outros 20 prints em `tests/bench3/data/inputs-e2e/`** para a fase D. Eles não podem repetir os prints da pasta `inputs/`.

## Ordem das fases

Todos os comandos rodam na raiz do repositório. Em PowerShell, as variáveis vão antes, com `$env:`:

```powershell
$env:BENCH3='1'; $env:BENCH3_PHASE='plan'; npx vitest run tests/bench3/bench3.test.ts --reporter=verbose
```

| # | Fase | Custo | O que faz |
| --- | --- | --- | --- |
| 1 | `plan` | grátis | Mostra o custo estimado por modelo e por fase. Sem prints, calcula para 60 casos. |
| 2 | `check` | grátis | Confere as chaves, os IDs de modelo nas APIs e quantos prints há por categoria. |
| 3 | `read` (A) | ~US$ 11 | 6 leitores × 60 prints. Grava o contrato de cada leitura em `data/reads/`. |
| 4 | `generate` (B) | ~US$ 83 | 8 motores × 60 prints × 2 repetições, sem briefing (mede o motor). Grava em `data/outputs/` com o geometry score. |
| 5 | `labels` | grátis | Gera `data/labels.html`, a página cega de rotulagem (veja abaixo). |
| 6 | `judge` (C) | ~US$ 23 | 4 juízes sobre a 1ª repetição de cada render, usando o inventário do Sonnet 5.5 (`BENCH3_INVENTORY_FROM`). Juiz da mesma família do motor é pulado. |
| 7 | `report` | grátis | Escreve `data/report.md`: aceite humano, custo por imagem aceita, precisão dos leitores, kappa dos juízes e o vencedor de cada faixa. |
| 8 | `e2e` (D) | ~US$ 10 | O harness completo (leitura → geração com briefing → portão de geometria → juiz → retry localizado ou troca de motor) em 20 prints novos. |

O total de A+B+C é **~US$ 118**, com os preços de 26/11. O `plan` recalcula com os prints reais.

Exemplo de fase paga com teto:

```powershell
$env:BENCH3='1'; $env:BENCH3_PHASE='generate'; $env:BENCH3_APPROVE_USD='90'; npx vitest run tests/bench3/bench3.test.ts --reporter=verbose
```

Para ensaiar barato antes da rodada cheia, use `BENCH3_LIMIT=3` (só os 3 primeiros prints) e `BENCH3_REPEAT=1`.

## Rotulagem humana

A página `data/labels.html` mostra o original e os renders de cada caso lado a lado, **sem dizer qual motor gerou cada um**: nem o texto, nem o atributo, nem o nome do arquivo da imagem revelam o motor, e a ordem é embaralhada por caso. Para cada render:

- **Entregaria / Não entregaria**, que responde "você mandaria isso ao cliente do arquiteto?";
- os motivos (geometria, câmera, material, objeto sumiu, objeto novo, luz, artefato, pouco realista);
- uma nota opcional.

Abaixo dos renders ficam as leituras do print, também cegas ("Leitor A…F"). Nelas você marca os itens errados ou inventados e informa quantos elementos importantes faltaram.

Os rótulos ficam salvos no navegador. Ao terminar, clique em **Exportar labels.json** e salve o arquivo em `tests/bench3/data/labels.json`. São 480 renders e 360 leituras, umas 2 a 3 horas.

Abra a página por um servidor local. Os navegadores bloqueiam parte do `file://`, e a página precisa das imagens de `data/blind/`:

```powershell
npx --yes http-server tests/bench3/data -p 8765
```

Depois acesse `http://localhost:8765/labels.html`.

## Variáveis

| Variável | Default | Para quê |
| --- | --- | --- |
| `BENCH3_READERS` | `opus55,sonnet55,haiku55,gpt55,gemini31pro,gemini38flash` | leitores da fase A |
| `BENCH3_GENERATORS` | os 8 motores de `config.ts` | motores da fase B |
| `BENCH3_JUDGES` | `sonnet55,haiku55,gemini31pro,gemini38flash` | juízes da fase C (`gpt55` é opcional e custa ~3× o Sonnet) |
| `BENCH3_REPEAT` | 2 | repetições por motor e print |
| `BENCH3_JUDGED_REPEATS` / `BENCH3_LABEL_REPEATS` | 1 | quantas repetições vão ao juiz e à rotulagem |
| `BENCH3_LIMIT` | todos | usa só os N primeiros prints |
| `BENCH3_CONCURRENCY` | 4 | chamadas em paralelo |
| `BENCH3_INVENTORY_FROM` | `sonnet55` | de qual leitor sai o checklist do juiz |
| `BENCH3_MODEL_<ID>` | — | troca o ID do modelo (ex.: `BENCH3_MODEL_GEMINI38FLASH`) |
| `BENCH3_E2E_READER` / `_GEN` / `_FALLBACK` / `_JUDGE` | `sonnet55` / `nb21` / `seedream55` / `sonnet55` | combinação da fase D |
| `BENCH3_E2E_MAX_ATTEMPTS` / `_MIN_GEOMETRY` | 2 / 0,5 | tentativas e portão de geometria da fase D |

## O que o bench não mede

- **Custo real.** A geração entra no ledger com o preço estimado da fal (`config.ts`; o asterisco marca preço não oficial). O valor cobrado de verdade sai da fatura da fal. Em produção, o Seedream vai pela ModelArk, que é mais barata.
- **O fluxo autenticado de produção.** Âncora, mapas, padding do Gemini e referências auxiliares ficam de fora: o bench chama os modelos direto.
- **Fallback de modelo.** Não há fallback de propósito: num bench, trocar de modelo em silêncio invalida a medida. Recusa e erro viram resultado com `error`.
