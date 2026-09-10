# Orion · piloto interno do GPT Image 2.5

**Status (2026-09-10):** implementado e **medido contra a API real** (32
gerações, US$ 1,56 — ver §3). Ligado **só na máquina do dono** via `.env.local`;
migration preparada e **NÃO aplicada** em lugar nenhum. Nada commitado, nada
publicado, nenhuma flag em produção.

Falta fechar a metade que passa por banco (marcador `is_internal_test`,
histórico, saldo intacto, bloqueio de promoção pro Spaces com dado real) — tudo
depende de a migration rodar em algum lugar. Ver §7.

Orion é um motor **só do Renderizar**, **só para a equipe interna**, que roda o
GPT Image 2.5 (Sunburst e Flare) para decidir se vale entrar no produto. Não
existe no Spaces, no Editar, no plugin SketchUp, no Nodi nem no catálogo
público. Vega, Pulsar e Quasar continuam exatamente como estão.

---

## 1. Variáveis de ambiente

| Variável | Obrigatória | Default | O que faz |
|---|---|---|---|
| `ORION_INTERNAL_ENABLED` | sim | *(ausente = desligado)* | `1` liga o piloto. Qualquer outro valor mantém Orion invisível, inclusive para a equipe. |
| `INTERNAL_STAFF_EMAILS` | sim¹ | — | Lista separada por vírgula. Já existente (`lib/auth/privileged`); alternativa: `profiles.role ∈ admin/support/owner`. |
| `OPENAI_API_KEY` | sim (rota direta) | — | Chave da OpenAI. **Só no servidor.** |
| `ORION_IMAGE_PROVIDER` | não | `openai` | `openai` \| `fal`. Escolhe a rota. Configuração privada do servidor — o cliente não escolhe. |
| `FAL_KEY` | só na rota `fal` | — | A rota direta **não** precisa dela. |
| `ORION_TIMEOUT_MS` | não | `240000` | Teto da chamada ao fornecedor. O orçamento da rota (300 s de `maxDuration`) continua mandando. |
| `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID` | não | — | Repassados como headers quando presentes. |

¹ ou o `role` no perfil. As duas travas são **em série**: flag ligada **E** equipe interna.

Ao configurar na Vercel, lembrar da paridade de env (env nova no `.env.local`
também vai pra Vercel + redeploy).

---

## 2. Ativar

```bash
# 1) migration (ambiente de teste — NÃO produção)
supabase db push   # ou aplicar supabase/migrations/20260910120000_renders_orion_internal_test.sql
```

```bash
# 2) .env.local
ORION_INTERNAL_ENABLED=1
OPENAI_API_KEY=sk-...
INTERNAL_STAFF_EMAILS=viniciuspisonivargas@gmail.com
```

Reiniciar o dev server (env não recarrega sozinha). O card **Orion ·
Experimental** aparece no Renderizar, com seletores de **variante**
(Sunburst/Flare) e **qualidade** (Alta/Média).

## 3. Testar

- Gerar normalmente. A geração custa **0 nodes**: nada é debitado e nada é
  estornado — o saldo fica literalmente inalterado.
- O resultado mostra fornecedor, variante, qualidade e a **dimensão realmente
  entregue** (com a pedida ao lado quando divergem).
- O `renders.generation_log.orion` guarda modelo exato, request id, duração,
  condicionamentos usados, tokens brutos/normalizados e custo estimado em USD
  com versão e fonte da tarifa.
- Para comparar fornecedores: trocar `ORION_IMAGE_PROVIDER` para `fal` e
  reiniciar. **Não há fallback automático** — se o fornecedor escolhido falhar,
  a geração falha (de propósito: fallback mascararia o que estamos medindo).

### Comparação reproduzível (chamada REAL, paga, explícita)

```bash
FIDELITY_BENCH=1 BENCH_ENGINE=orion-sunburst npx vitest run tests/fidelity/bench.test.ts --disable-console-intercept
```

Credenciais saem do `.env.local` — **nunca** passe chave na linha de comando.
`BENCH_ENGINE` aceita `orion-sunburst`, `orion-flare`, `quasar`, `vega`,
`pulsar`; `BENCH_ORION_QUALITY=high|medium`; `BENCH_REPEAT` (default **3**).

Cada rodada agrega média/mínimo/máximo/amplitude por célula, acumula em
`tests/fidelity/bench/runs.json` (rodar outro motor não apaga o anterior) e
salva as imagens em `tests/fidelity/bench/outputs/`. Tudo gitignored.

**Repetir importa.** Com `BENCH_REPEAT=1` a comparação entre motores é
cara-ou-coroa: em 2026-09-10, duas conclusões tiradas de uma amostra só se
inverteram ao repetir. O default 3 existe por isso.

Nenhum outro teste chama fornecedor: `npm test` é 100 % mockado.

### Medições de 2026-09-10 (32 gerações reais, US$ 1,56)

Rota OpenAI direta, `high`, prints crus do SketchUp.

| eixo | resultado |
|---|---|
| custo | **US$ 0,0414** em 2048×800 (1,64 MP) · **US$ 0,0921** em 1648×2048 (3,37 MP) |
| tempo | Sunburst 32,6 s · **Flare 24,0 s** (Δ 8,6 s ± 3,5 — conclusivo) |
| dimensão | pedida = entregue em **100 %** das gerações |
| Sunburst × Flare | 0,761 × 0,795 — **Δ +0,034 ± 0,054, cruza zero: sem vencedor** |
| variação por cena | 0,68 → 0,89 — **a cena pesa mais que a variante** |

Dois achados que afetam decisão de produto:

1. **Retrato custa 2,2× mais.** O preset 2K fixa o *lado maior*, então uma
   entrada 1280×1600 vira 1648×2048. Se Orion virar produto, a tabela de nodes
   precisa olhar **megapixel**, não o rótulo "2K".
2. **Escolher variante por fidelidade não se sustenta** com os dados atuais. Se
   for preciso escolher hoje, escolha por velocidade (Flare).

### ⚠️ Bloqueio legal antes de qualquer uso além de imagem própria

A OpenAI **não** consta nas cláusulas 4–6 de `/privacidade`, que nomeiam os
operadores (Supabase, Vercel, Google Cloud, fal.ai, BytePlus, Stripe). Enviar
render de **cliente** ao Orion sem atualizar a política é sub-operador não
declarado. Mesmo procedimento aplicado à BytePlus na PR #174. Enquanto isso, o
piloto só roda com imagens do próprio dono.

## 4. Desativar

Remover `ORION_INTERNAL_ENABLED` (ou pôr `0`) e reiniciar. O card some, a rota
passa a responder **404** para `engine: 'orion'` e nada mais executa o piloto.
Não é preciso reverter a migration: sem a flag, nenhuma linha nova com
`is_internal_test` é criada, e as regras dos motores públicos ficam iguais.

---

## 5. Onde o piloto está isolado

| Fronteira | Como |
|---|---|
| Catálogo público | `EngineId`/`ENGINE_ORDER`/`ENGINES` **não** mudaram. Orion vive em `RenderEngineId` (`lib/orion/config`). |
| Autorização | `canUseOrion` na página **e** na rota, antes de upload, débito ou chamada paga. Requisição forjada (cookie ou Bearer do plugin) cai no mesmo gate. |
| Config salva | `resolveInitialConfig` só aceita `EngineId` → config antiga nunca ressuscita Orion. E Orion nunca é gravado em `profiles.project_config`. |
| Cobrança | `nodesToCharge = 0` decidido no servidor **após** a autorização. Sem débito e sem refund (a flag `debited` só liga com nodes > 0). |
| Banco | `is_internal_test` gravado pelo servidor; CHECK exige `orion → is_internal_test AND nodes_charged = 0 AND resolution = '2k'`. Motores públicos mantêm `nodes_charged > 0`. |
| Equipe | `workspace_generations` e `workspace_member_usage` ignoram linhas internas. `node_usage_daily` já ignorava `nodes_charged = 0`. |
| Spaces | `/api/spaces/from-render` recusa render Orion (409) olhando o **motor do resultado**; galeria e CTAs escondem. `spaces`/`vistas` não foram tocadas. |
| Histórico | `engineDisplayLabel` prioriza o motor persistido; `gpt-image-2.5` → Orion, `gpt-image` (sem 2.5) segue Quasar (renders antigos). |
| Custo acessório | Depth map (chamada FAL paga) desligado no piloto; edge map e geometry score são locais. `generation_log.orion.conditioning` registra o que foi usado. |

## 6. Contrato dos fornecedores (conferido em 2026-09-10)

**OpenAI `POST /v1/images/edits`** — `model`, `prompt`, `image[]` (até 16, em
ordem), `size` (`LARGURAxALTURA`, múltiplos de 16, ≤3840/lado, aspecto 1:3–3:1),
`quality` (`low|medium|high|xhigh|max|auto`), `n`, `output_format`. Resposta:
`data[].b64_json` + `usage{input_tokens, input_tokens_details, output_tokens,
total_tokens}`.
Tarifa (Sunburst e Flare, por 1M tokens): texto in **US$ 5** (cache 1,25),
imagem in **US$ 8** (cache 2), imagem out **US$ 30**.

**fal.ai `openai/gpt-image-2.5/{sunburst,flare}/edit`** — `prompt`,
`image_urls`, `image_size` (`{width,height}`), `quality`, `num_images`,
`output_format`. Não devolve tokens: o custo estimado sai **`null`**, nunca 0.

O preset **2K** do SpaceNode vira lado maior **2048 px** com o lado menor
derivado do aspecto do original e arredondado para cima em múltiplo de 16
(ex.: 16:9 → `2048x1152`). Nunca `auto`, nunca upscale silencioso.

**Não enviamos** `input_fidelity`, `moderation`, `seed`, `thinking_level` nem
`resolution`: ou são de outro motor (Gemini/Seedream/GPT Image 2), ou a doc dos
2.5 não confirma o comportamento — a comparação roda no default.

## 7. Arquivos

```
lib/orion/config.ts     catálogo, listas fechadas, preset 2K → dimensão explícita
lib/orion/access.ts     canUseOrion (flag + isInternalStaff)
lib/orion/provider.ts   rota direta OpenAI (bytes) + rota fal, sem fallback
lib/orion/pricing.ts    tarifas, uso de tokens e custo estimado (null ≠ 0)
lib/ai/engine-params.ts falParamsForEngine extraído da rota (produção + bench)
supabase/migrations/20260910120000_renders_orion_internal_test.sql
tests/orion/*.test.ts   mockado; roda no npm test
tests/orion/smoke-real.test.ts  chamada real, só com ORION_SMOKE=1
tests/helpers/env-local.ts      carrega .env.local nos testes de fornecedor
tests/fidelity/bench.test.ts  chamada real, só com FIDELITY_BENCH=1
```

## 7. O que falta

A migration `20260910120000_renders_orion_internal_test.sql` não tem onde rodar
isolada: o `.env.local` aponta pro Supabase de **produção** e não existe stack
local (`supabase/config.toml` não existe). Enquanto ela não roda, o `INSERT` no
histórico falha para Orion — a imagem é entregue, o registro não é gravado — e
estas verificações seguem em aberto:

- gravação e integridade do marcador `is_internal_test`;
- render Orion aparecendo corretamente no Histórico (e só pra equipe);
- saldo do usuário comprovadamente inalterado no banco;
- `/api/spaces/from-render` recusando render Orion com dado real.

Duas saídas: aplicar em produção (a migration é aditiva e não muda nenhuma
regra dos motores públicos) ou subir um Supabase local com Docker. **Decisão do
dono — pendente.**

Também não medido, por decisão do dono em 2026-09-10: Vega e Quasar nas mesmas
cenas (gastaria nodes de produção).
