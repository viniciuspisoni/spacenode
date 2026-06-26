# EDITAR v2 — AUDITORIA E PLANO (2026-06-12)

> Metodologia: 9 auditores em paralelo sobre o repositório (somente leitura) — router/pipeline, engines, rotas de API, UI, cobrança, banco, integração GCP — mais 2 pesquisas externas (preços oficiais FAL via API autenticada da conta + docs oficiais Google). Nenhum arquivo de produto foi alterado. Complementa `docs/AUDITORIA-SPACENODE-2026-06-09.md` (que continua válida para o resto da plataforma).

---

## 0. NORTE DO PRODUTO (diretriz do fundador, 2026-06-12)

> **"Editar v2 é o novo editor arquitetônico da SpaceNode: mais simples na superfície, mais preciso no resultado e mais poderoso por trás."**

O Editar v2 **não é uma refatoração técnica** do Editar atual — é um novo modelo de edição. Antes: um editor experimental baseado em tentativa. Agora: um editor arquitetônico **preciso, guiado e confiável**. O objetivo não é "editar imagem"; é permitir que arquitetos e designers façam ajustes precisos em imagens de projeto **sem perder controle sobre a arquitetura original**.

**Prioridade absoluta (nesta ordem):** 1. simplicidade para o usuário · 2. precisão no resultado · 3. preservação do projeto · 4. custo controlado · 5. poder técnico oculto atrás de uma interface enxuta.

**Regras de desempate (valem para toda decisão de arquitetura, UX, copy, pricing, logs, roteamento, máscara, referências e fallback):**
- Mais opções × fluxo mais claro → **clareza**.
- Imagem mais bonita × preservar o projeto → **preservar o projeto**.
- Expor poder técnico × entregar simplicidade → **esconder a complexidade no backend**.

**Tradução prática (o que isso fixa no plano):**
- A tela tem só: o que fazer (5 tipos) → selecionar área quando necessário → referência opcional → custo em Nodes → gerar. Nada além disso.
- **Zero nomes de modelo, provider ou parâmetro técnico na UI** — "Alta precisão" nunca vira "Gemini Pro"; erros e explicações em linguagem de arquiteto, não de API.
- O usuário **não vê** "v2": para ele é "o novo Editar" da SpaceNode (comunicação de lançamento, não versionamento).
- Toda a inteligência (roteamento de modelo, escolha GCP/Vertex×Gemini×fallback, normalização de prompt, controle de máscara, papéis de referência, gates de qualidade, retry) vive no servidor e aparece para o usuário como **uma única promessa**: o que você pediu, onde você pediu, sem mexer no resto.
- Por design, o gate prefere **rejeitar sem cobrar** a entregar um resultado que alterou o projeto — confiabilidade vale mais que taxa de sucesso aparente.

---

## 1. DIAGNÓSTICO DO MODO EDITAR ATUAL

### O que existe hoje
O Editar atual **não é um rascunho** — é um sistema v1 razoavelmente maduro com peças boas:

- **Roteador**: `routeEdit()` (`lib/spaces/edit-router.ts:316`, função pura) decide endpoint + custo (0–6 nodes) + free-fix ANTES do débito. Roteamento "Google-first" é default ON (`EDIT_GOOGLE_FIRST !== '0'`).
- **Pipeline**: `runEdit()` (`lib/spaces/edit-pipeline.ts`) com crop por bounding-box da máscara (teto de megapixels), recomposição server-side (o output do provider só entra DENTRO da máscara, com feather), e quality gate (drift fora da máscara >2%, ou >8% para blend; no-op <1% dentro da máscara = não cobra) + 1 retry automático grátis com prompt restritivo.
- **UI**: standalone (`components/spaces/RetocarStandaloneFlow.tsx`, 2.153 linhas) + overlay embebido no Spaces (`RetocarOverlay.tsx`, 988 linhas) — ~700 linhas duplicadas entre os dois. 8 intenções de edição, canvas de máscara compartilhado, preview de custo server-side com debounce.
- **Cobrança**: débito atômico antes (`consume_workspace_nodes`), refund em falha técnica E em rejeição do gate; tiers centralizados em `NODE_COST`; free-fixes mensais por plano.
- **Telemetria**: `image_edit_attempts` (a melhor tabela de telemetria do produto) com tool, endpoint, provider, custo, máscara, referências, deltas do gate, retry.

### Onde estão os providers — a descoberta central
**"Google-first" hoje é Google só no nome.** Apenas 1 engine fala com o Google de verdade (`vertex-imagen-edit.ts`), e ele está **desligado** (flag `VERTEX_IMAGEN_ENABLED` ausente, envs `GOOGLE_VERTEX_*` não provisionadas, nunca smoke-testado). Todo o resto vai via **FAL**:

| Engine | Endpoint FAL real | Máscara |
|---|---|---|
| nano-banana-2-edit.ts (motor padrão) | **`fal-ai/nano-banana/edit`** (NB1!) | 2ª imagem + texto |
| nano-banana-pro-edit.ts (premium) | `fal-ai/gemini-3-pro-image-preview/edit` | 2ª imagem + texto |
| nano-banana-edit.ts | `fal-ai/nano-banana/edit` | 2ª imagem + texto |
| vertex-imagen-edit.ts | `imagen-3.0-capability-001` (Vertex direto) | **máscara real em pixels** — DESLIGADO |
| flux-* (4 engines) | flux-pro/fill, kontext-lora/inpaint, flux-pro/kontext | só no caminho legado/fallback |

Três problemas graves nesta camada:
1. **O "NB2" chama o endpoint do NB1**: `nano-banana-2-edit.ts:27` assina `fal-ai/nano-banana/edit` (Gemini **2.5** Flash, $0,0398) achando que é o 3.1 — mas o endpoint `fal-ai/nano-banana-2/edit` ($0,08) existe e está ativo na FAL hoje (confirmado pela API oficial de pricing). O motor padrão do Editar está rodando num modelo de geração anterior.
2. **Telemetria mente o provider**: `endpointProvider()` grava `provider='google'` para os IDs `google/gemini-*`, mas o tráfego real é FAL.
3. **Nenhum modelo do caminho Google-first recebe máscara de verdade**: nos nano-banana a máscara vai como 2ª imagem + instrução de texto (o modelo pode ignorar); a preservação fora da máscara é garantida **só** pela recomposição server-side. O único inpaint com máscara em pixels (Vertex) nunca rodou.

### Onde Fal.ai/Flux são usados
- **FAL**: 100% do tráfego de edição em produção (nano-banana*, gemini-3-pro-image-preview) + segmentação (SAM2 $0,00125/s, EVF-SAM $0,005/req) + todo o Renderizar/Ampliar/Animar.
- **Flux**: já está FORA da rota principal — só entra com `EDIT_GOOGLE_FIRST=0` (rollback legado) ou `EDIT_FLUX_FALLBACK=1` (fallback do retry, default OFF). A diretriz "Flux só por feature flag" **já está implementada**.
- **Markup da FAL vs Google direto** (API oficial de pricing da conta, 11/06/2026): NB1 ~0%; NB2 +19% (1K/2K); NB Pro +12% (1K/2K) e +25% (4K). O Batch API do Google (−50%) não existe na FAL.

### Como a máscara funciona hoje
- Canvas (`RetocarCanvas.tsx`): strokes guardados em **pixels de display** sem normalização → **bug confirmado**: redimensionar a janela entre pintar e gerar desloca a máscara exportada. Sem zoom/pan. Undo só Ctrl+Z.
- Cobertura é re-medida **no servidor** (`measureServerMaskCoverage`) — o cliente não forja tier (bom).
- `assertMaskMatchesImage` rejeita máscara com proporção divergente >3% antes de gastar provider (bom).
- Recompose + feather + gate de drift funcionam — são o verdadeiro mecanismo de preservação.
- Caso estranho: `swap_material` com referência e sem pincel gera **máscara branca 1×1 automática** (sentinela), coverage = 1.0 → tier global de 4 nodes (commit da9d5c8).
- Máscara usada É salva (`edits.mask_url` / `vistas.edit_mask_url` — colunas só em produção).

### Como a cobrança funciona hoje — abaixo do custo
Tiers: 0 (grátis) / 1 / 2 / 3 / 4 / 5 / 6 nodes. Com os **preços reais da FAL** (a tabela `ENDPOINT_COST_USD` do código está desatualizada — assume NB2 $0,045 quando a FAL cobra $0,08 em 1K e $0,12 em 2K):

| Tier | Nodes | Receita no piso (US$0,0135/node) | Custo real típico | Margem no piso |
|---|---|---|---|---|
| Sem máscara ("instruct") | 4 | $0,054 | NB1 $0,0398 | +26% (e era para ser NB2 $0,08 → **−48%**) |
| Localizada | 2 | $0,027 | NB1 $0,0398 | **−47%** |
| Média | 3 | $0,0405 | NB1 $0,0398 | ~0% |
| Premium | 5–6 | $0,068–0,081 | NB Pro $0,15–0,30 | **−85% a −122%** |
| Free fix | 0 | $0 | $0,04 | custo puro |

E o retry grátis do gate pode **dobrar** o custo de qualquer linha. Existem ainda **free-fixes mensais** (2–80/mês por plano; fallback de plano desconhecido = 20/mês) — em contradição com a nova diretriz "não criar edições gratuitas".

### Como as imagens são salvas no histórico
- **Resultado sempre re-hospedado no Supabase Storage** (bucket público `space-mestres`) — o Editar é o ÚNICO módulo que não depende do CDN da FAL. Ponto forte.
- Standalone → tabela `edits` (**sem DDL no repo** — existe só em produção; RLS inauditável; o GET não filtra por user_id). Sem vínculo de versão (não há parent_edit_id).
- Embebido → nova `vista` com `parent_vista_id` + `edit_chain_root_id` (cadeia de versões real — mas essas colunas também só existem em produção) e `engine:'flux-fill'` **hardcoded mentindo** para satisfazer um CHECK divergente.
- Versões na UI standalone: só memória da sessão (refresh perde a strip).
- `provider_cost_usd` é estimativa gravada 1× e nunca reconciliada; sem request_id, sem duração.

### Principais problemas (consolidado)
1. **[P0] Mispricing estrutural** — tiers abaixo do custo real; tabela de custos interna desatualizada vs preço FAL real.
2. **[P0] Motor padrão errado** — "NB2" chama o endpoint do NB1 (modelo de geração anterior).
3. **[P0] Vertex (único inpaint real) nunca validado** — envs ausentes, `models.editImage` jamais executado.
4. **[P1] Bug de máscara no resize da janela** — edição cobrada aplicada em área errada.
5. **[P1] SSRF** — `source_image_url`/`mask_url`/referências aceitam URL arbitrária fetchada pelo servidor.
6. **[P1] Sem `maxDuration`** em nenhuma rota do Editar (pior caso: 2 gerações + gate + uploads).
7. **[P1] Refund nunca verificado** — `{error}` do supabase-js ignorado; status `refunded` existe e nunca é gravado.
8. **[P1] Duplicação dupla** — 2 rotas de API (~450 linhas cada) e 2 UIs (~700 linhas) repetindo o mesmo fluxo, já divergindo (overlay sem fidelity_mode, sem borracha, saldo nunca atualizado).
9. **[P1] Drift repo×produção** — `edits` sem DDL, colunas de cadeia de vistas só em produção, CHECK de engine divergente, migration 20260610000000 com status incerto.
10. **[P2] UI com 8 intenções + chips que poluem o classificador** + máscara branca 1×1 cobrando 4 nodes + free-fix com corrida (read-then-write).
11. **[P2] Código morto extenso** — `engines/router.ts`, `orchestrate.ts`, `guard-policy.ts`, `gemini-edit.ts`, `flux-inpaint.ts`, `object-removal.ts`, `lib/spaces/flux-fill.ts`, `EDIT_COST`, `RetocarModeTabs.tsx`.

---

## 2. NOVA ARQUITETURA PROPOSTA (EDITAR v2)

### Princípio honesto: não é rebuild de tudo
O pipeline server-side (crop → chamada → recompose → gate → refund) é **bom e deve ser mantido**. O que se reconstrói:
- **Camada de providers** → Google direto (a mudança mais importante);
- **Contrato de produto** → 5 tipos em vez de 8 intenções/9 tools;
- **Pricing** → tabela nova com margem real;
- **UI** → 1 componente único para standalone e Spaces;
- **Rota de API** → 1 handler único parametrizado.

### O edit-router v2
Novo módulo `lib/edit-v2/router.ts`, função pura com o contrato pedido:

```
Entrada: { editIntent, qualityMode, preservationMode, intensityMode,
           hasMask, hasReferenceImage, hasProjectContextImages,
           requiresStrictGeometry, outputResolution, userPlan, estimatedCost }
Saída:   { selectedProvider, selectedModel, normalizedPrompt,
           nodesCost, retryPolicy, loggingData }
```

`editIntent` com exatamente 5 valores: `swap_material | remove_element | insert_element | adjust_atmosphere | fix_image`. O classificador de complexidade por keywords **morre** (era fonte de roteamento errático); quem decide é o tipo + máscara + referência + qualityMode.

### Providers Google (ordem de prioridade)

| Provider v2 | Modelo | Via | Uso | Custo oficial |
|---|---|---|---|---|
| `vertex-imagen` | `imagen-3.0-capability-001` | Vertex (service account) | **Inpaint com máscara real**: remover, corrigir, trocar material/inserir sem referência. EDIT_MODE_INPAINT_REMOVAL/INSERTION, MASK_MODE_USER_PROVIDED. Engine já existe no repo. | ~US$0,02/img (confirmar na fatura) |
| `gemini-flash-image` | `gemini-3.1-flash-image` (NB2) | **API Gemini direta** (`GEMINI_API_KEY` já existente) | Edição com referência (até 14 imagens), atmosfera/instrução sem máscara, qualidade Econômica | $0,045 (0.5K) / $0,067 (1K) / $0,101 (2K) / $0,15 (4K) |
| `gemini-pro-image` | `gemini-3-pro-image` (NB Pro) | API Gemini direta | Qualidade **Alta precisão** | $0,134 (1K/2K) / $0,24 (4K) |
| `gemini-2.5-flash` | (já em produção) | API Gemini direta | Gate semântico + normalização de prompt | centavos |

Economia direta vs FAL: −16% no NB2 2K, −12% no NB Pro, e elimina o intermediário. A máscara nos modelos Gemini continua sendo "2ª imagem + prompt" (eles não aceitam máscara em pixels — confirmado na doc oficial), então o **recompose server-side continua obrigatório** — já existe e fica.

### A inteligência oculta (o "mais poderoso por trás" do norte)
Três camadas server-side que o usuário nunca vê, mas que reduzem tentativa e erro:

1. **Normalizador de instrução** (novo): antes de rotear, `gemini-2.5-flash` (já integrado, custa centavos) converte a instrução em PT do usuário + tipo + presença de máscara/referência num **spec estruturado**: prompt interno em inglês técnico (a partir do prompt base obrigatório), papel correto da referência, sinal de `requiresStrictGeometry`, e detecção de pedido ambíguo (ex.: "muda o piso e a parede" num tipo de área única → o sistema escolhe a interpretação segura em vez de chutar). Substitui o classificador por palavras-chave da v1, que era a fonte de roteamento errático.
2. **Roteamento por contrato** (seção acima): tipo + máscara + referência + qualidade decidem modelo e provider de forma determinística e testável — nunca exposto na UI.
3. **Verificação pós-geração em duas camadas**: gate de pixels (drift fora da máscara + no-op, já existente) **+ gate semântico Gemini vision ligado por padrão na v2** (hoje existe atrás de flag desligada): confere se o pedido foi cumprido, se a geometria foi preservada e se a referência foi seguida, antes de entregar. Custo: fração de centavo por edição. Reprovou → retry automático grátis com prompt restritivo → reprovou de novo → estorno e mensagem honesta.

### Quando a FAL ainda é necessária
1. **Segmentação** (SAM2/EVF-SAM para seleção de superfície por clique) — não existe equivalente no Google; custo desprezível ($0,001–0,005/req).
2. **Ponte temporária**: enquanto o smoke do Vertex `editImage` não passar, o caminho mascarado roda em NB2 (já é o comportamento) — mas via Google direto, não via FAL.
3. **Fallback de emergência por flag** (`EDIT_V2_FAL_FALLBACK`): se a API Google der indisponibilidade prolongada.

### Como o Flux sai da experiência principal
Já está fora do caminho default. Na v2: o caminho legado (`decideLegacy` + engines flux-*) fica **intocado atrás de `EDIT_GOOGLE_FIRST=0`** durante a transição e é removido junto com a v1 quando a v2 estabilizar. Nenhuma rota v2 conhece Flux.

### Feature flags da transição
- `EDIT_V2_ENABLED=1` (server) + `NEXT_PUBLIC_EDIT_V2=1` (UI) — liga o fluxo novo.
- v1 continua respondendo em `/api/edits`; v2 nasce em `/api/edits/v2`. Rollback = desligar a flag.

---

## 3. UX PROPOSTA

### Fluxo do usuário
1. Envia/importa a imagem (mantém o empty state atual, que é bom).
2. Escolhe **1 dos 5 tipos** (cards): Trocar material · Remover elemento · Inserir elemento · Ajustar atmosfera · Corrigir imagem.
3. Se o tipo exige seleção (Remover, Inserir, Corrigir; opcional em Trocar material), pinta a máscara — agora com **zoom/pan** e strokes em coordenadas normalizadas (mata o bug do resize).
4. Escreve a instrução (placeholder específico por tipo); anexa referência se aplicável (material → "Referência de material"; inserir → "Referência do objeto").
5. Vê **custo em Nodes sempre visível** no botão (preview server-side já existe) → Gerar.
6. Resultado: comparador antes/depois → Aceitar (vira nova versão), Refazer (grátis se o gate rejeitou), Editar de novo, Voltar à original.

### Layout
- **Área principal**: imagem grande; toolbar mínima de seleção (pincel, borracha, tamanho, limpar, zoom); preview da máscara em overlay; comparador no resultado.
- **Painel lateral (1 coluna, ordem fixa)**: ① Tipo de edição (chip trocável) ② Instrução ③ Referência opcional ④ Controles ⑤ "Custo estimado: X Nodes" ⑥ Gerar.

### Controles (exatamente 3, sem sliders)
| Controle | Opções | Efeito técnico |
|---|---|---|
| Preservação | **Máxima** (default) / Padrão | Máxima: cláusula estrita no prompt + gate de drift 2%; Padrão: cláusula equilibrada + gate 8% |
| Intensidade | Sutil / **Padrão** / Forte | Só modificador de prompt (subtle refinement / standard / pronounced change) — não muda preço |
| Qualidade | **Econômica** (default) / Alta precisão | Econômica: Vertex/NB2; Alta precisão: NB Pro, preço maior mostrado antes |

### Estados
- Loading: "Aplicando edição…" + etapa ("Validando preservação…"). Estimativa "~30–60s".
- Erro técnico: "Não foi possível concluir a edição. **Nenhum node foi consumido.**" (padrão já existente — manter).
- Gate rejeitou: "A edição alterou áreas fora da seleção e foi descartada. Nenhum node foi consumido. Refazer é grátis." (copy já é referência no produto).
- Sucesso: comparador + "X Nodes utilizados".

### Copy
Usar os termos da diretriz (Trocar material, Preservar geometria, Alterar apenas a área selecionada, Custo estimado: X Nodes). Sem hype. O quality gate vira argumento de produto: "Proteção de geometria: edições que alteram o projeto são descartadas sem custo." **Proibido na UI**: nomes de modelo/provider (nano-banana, Gemini, Vertex, FAL, Flux), jargão de pipeline (máscara/inpaint/drift viram "área selecionada" / "fora da seleção"), e o rótulo "v2" — para o usuário é o novo Editar.

### Comunicação de lançamento
Apresentar como evolução de produto, não atualização técnica: *"O novo Editar: ajustes precisos sem perder o controle do projeto. Você escolhe o que mudar, seleciona onde, e a SpaceNode preserva o resto."* Um destaque único na primeira visita (badge "Novo" + 1 frase) — sem tour, sem modal longo.

### O que sai da UI atual
8 intenções → 5 tipos; chips de "manter geometria/perspectiva" somem (viram garantia automática do prompt interno — hoje eles poluíam o classificador); modos `style/variation/landscape/replace` são absorvidos (estilo/variação → Ajustar atmosfera ou Renderizar; replace → Inserir/Trocar material com referência); o toggle "Preservar geometria" some (geometria é **sempre** preservada — vira o controle Preservação Máxima/Padrão); placeholders "em breve" e opções técnicas aparentes não entram.

---

## 4. SISTEMA DE CUSTOS

### Estrutura
Novo arquivo único `lib/edit-v2/pricing.ts`:
- `MODEL_COST_USD` — custo oficial por modelo×resolução (fonte: docs Google, validado contra fatura);
- `NODE_FLOOR_USD = 0.0135` (Office anual R$0,0729 @ R$5,40) e `NODE_MEDIAN_USD ≈ 0.0185` — hoje isso só existe em comentário no módulo de vídeo;
- `EDIT_PRICES` — nodes por (editIntent × qualityMode);
- `expectedCostUsd()` — custo médio incluindo taxa de retry (~20%);
- margem calculada e logada por tentativa (`nodes × NODE_FLOOR_USD − custo`).

Nada de valor hardcoded fora deste arquivo. A UI e a rota leem daqui. O `expectedCostUsd()` inclui também o custo das camadas invisíveis (normalizador + gate semântico, ~US$0,002/edição — desprezível, mas contabilizado). **Na tela, o preço é sempre um número único** ("Custo estimado: X Nodes") — sem breakdown técnico; a explicação, quando existir, é em linguagem de produto ("Alta precisão usa um motor superior").

### Proposta de preços (REQUER SUA APROVAÇÃO — não implemento sem)

Qualidade **Econômica** (motor Vertex $0,02 / NB2 direto):

| Tipo | Motor padrão | Custo médio c/ retry | **Nodes** | Margem piso | Margem mediana |
|---|---|---|---|---|---|
| Corrigir imagem | Vertex inpaint (crop ≤1MP) | ~$0,024 | **3** | +41% | +57% |
| Remover elemento | Vertex removal | ~$0,024 | **4** | +56% | +68% |
| Trocar material (sem ref.) | Vertex insertion | ~$0,024 | **5** | +64% | +74% |
| Trocar material (com ref.) / Inserir | NB2 1K–2K multi-imagem | ~$0,08–0,12 | **6** | −0% a −48% ⚠ | +19% a +46% |
| Ajustar atmosfera (até 2K) | NB2 instruct 2K | ~$0,12 | **10** | −12% ⚠ | +35% |

Qualidade **Alta precisão** (NB Pro):

| Saída | Custo médio | **Nodes** | Margem piso | Margem mediana |
|---|---|---|---|---|
| 1K/2K | ~$0,16 | **16** | +26% | +46% |
| 4K | ~$0,29 | **30** | +28% | +48% |

Leitura honesta dos ⚠: os tipos que dependem de NB2 em resolução cheia não fecham margem ≥50% **no piso** (Office anual) sem ficarem caros demais. Três opções, em ordem da minha recomendação:
1. **Aceitar margem menor no piso** nesses 2 casos (no plano mediano todos ficam positivos) — eles continuam mais baratos que o Renderizar (Pulsar 2K = 15, Vega 2K = 20);
2. Subir atmosfera para 12 e material-com-ref para 8;
3. Limitar a saída Econômica a 1K nesses tipos (degrada o produto — não recomendo).

### Garantias
- **Zero edições gratuitas**: o tier free-fix da v1 NÃO existe na v2 (free-fixes mensais somem do fluxo novo — mudança de produto, confirme). O retry automático após rejeição do gate continua grátis — é garantia de qualidade, não edição nova.
- **Sempre mais barato que Renderizar nos casos simples**: 3–6 nodes vs 15–20 do render 2K.
- **Custo sempre visível antes** (preview server-side mantido).
- **Custo estimado E real**: gravar `provider_cost_usd_est` no insert e `provider_cost_usd_real` + `provider_request_id` + `duration_ms` no update, somando retries.

---

## 5. BANCO DE DADOS E HISTÓRICO

### Tabelas existentes que serão usadas (sem mudança)
- `image_edit_attempts` — continua sendo a telemetria (já tem tool, endpoint, provider, custo, máscara, refs, deltas, retry, status).
- `edit_reference_assets` — referências por papel (passar a preencher width/height/mime, que existem e nunca são gravados).
- `edits` (standalone) e `vistas` (embebido, com `parent_vista_id`/`edit_chain_root_id`) — destinos do resultado.
- RPCs `consume_workspace_nodes` / `refund_workspace_nodes` — débito/refund inalterados.

### Pré-requisito CRÍTICO antes de qualquer migration
**Baseline do schema de produção.** A tabela `edits` não tem DDL no repo; colunas de cadeia de `vistas` e o CHECK real de `vistas.engine` só existem em produção; a migration 20260610000000 tem status incerto; a 20260519000000 está untracked. Primeiro passo de banco: `supabase db dump` (ou `list_tables` via MCP) → versionar baseline → só então migrar. Sem isso, qualquer migration v2 é construída no escuro.

### Migration v2 (1 arquivo, aditiva, idempotente — só rodará com sua aprovação)
```
image_edit_attempts:
  + edit_intent_v2 text CHECK (5 valores)        -- tipo v2
  + intensity_mode text CHECK (subtle/standard/strong)
  + prompt_normalized text                        -- prompt interno enviado ao modelo
  + provider_request_id text                      -- reconciliação com fatura
  + duration_ms integer
  + provider_cost_usd_real numeric(10,4)
  + input_width/input_height/output_width/output_height integer
edits:
  + parent_edit_id uuid REFERENCES edits(id)      -- versões persistentes no standalone
  + edit_chain_root_id uuid
  (e DDL baseline da própria tabela versionada antes)
```

### O que dá para fazer SEM migration
Todo o roteamento, providers Google, prompts, pricing, UI nova, rota v2, flags — 100% código. A v2 funciona com o schema atual (gravando nos campos existentes); a migration só liga telemetria extra e versões persistentes. Isso permite entregar e testar a v2 antes de tocar no banco.

---

## 6. INTEGRAÇÃO GCP/VERTEX

### Variáveis de ambiente necessárias
| Variável | Status | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | **já existe** (local + Vercel) | NB2/NB Pro via API Gemini direta + gate semântico |
| `GOOGLE_VERTEX_PROJECT` | criar | projeto GCP (o experimento usou `gen-lang-client-0191517804`) |
| `GOOGLE_VERTEX_LOCATION` | criar (`us-central1`) | região do Imagen (Imagen capability não existe em southamerica-east1; latência us-central1 é aceitável para jobs de 10–60s) |
| `GOOGLE_VERTEX_CREDENTIALS_JSON` | criar | JSON da service account inteiro (papel "Vertex AI User") — **nunca** no client |
| `VERTEX_IMAGEN_ENABLED=1` | criar | liga o caminho Vertex |
| `EDIT_V2_ENABLED` / `NEXT_PUBLIC_EDIT_V2` | criar | flag do fluxo novo |

Lembrete (memória do projeto): toda env nova precisa ir para a **Vercel também** + redeploy; o MCP da Vercel deu 403 — usar CLI.

### SDK
`@google/genai` **já instalado (2.4.0)** e é o SDK unificado recomendado (serve API Gemini e Vertex; `models.editImage` confirmado presente nos types do pacote instalado). Não instalar `@google-cloud/vertexai` (caminho antigo). Atualizar para a última minor antes do smoke.

### Modelos a testar (nesta ordem)
1. `imagen-3.0-capability-001` via `models.editImage` — inpaint removal/insertion com `MASK_MODE_USER_PROVIDED` (confirmado na doc como o modelo de edição vigente; doc atualizada abr/2026). Saída ~1024px — por isso o **crop+recompose existente é essencial** (edita só a região, em alta densidade de pixels, e recompõe no original).
2. `gemini-3.1-flash-image` via API Gemini — edição multi-imagem (até 14 refs), saídas 0.5K–4K.
3. `gemini-3-pro-image` — premium 1K/2K/4K.
4. Imagen Customization (referência de estilo/assunto) — recurso secundário, avaliar depois.

### Riscos de autenticação/disponibilidade
- `models.editImage` do Vertex **nunca rodou** neste projeto (só `imagen-3.0-generate-001` text-to-image funcionou, 10/06) — o smoke pago é o gate da arquitetura toda; se falhar (allowlist, quota, formato), o plano B é NB2 direto com recompose (já validado em produção via FAL).
- Service account inteira numa env: validar tamanho do valor na Vercel; rotação manual.
- Quotas default do Vertex para `editImage` são baixas em conta nova — verificar/solicitar aumento.
- Billing GCP separado da FAL — acompanhar as duas faturas durante a transição.

---

## 7. ARQUIVOS QUE PRETENDO ALTERAR

**Novos (`lib/edit-v2/` + UI):**
- `lib/edit-v2/types.ts` · `router.ts` (contrato da seção 2) · `pricing.ts` (seção 4) · `prompts.ts` (prompt base obrigatório + 5 variações + EN interno)
- `lib/edit-v2/providers/vertex-imagen.ts` (evolução do engine existente) · `providers/gemini-image.ts` (**novo** — NB2/NB Pro via API Gemini direta, sem FAL)
- `app/api/edits/v2/route.ts` (handler único; recebe `context: standalone | space` — mata a duplicação das 2 rotas) e `app/api/edits/v2/preview/route.ts`
- `components/editar/EditV2Flow.tsx` (substitui RetocarStandaloneFlow E RetocarOverlay) · `EditTypePicker.tsx` · `EditControls.tsx` · `EditCanvas.tsx` (fork do RetocarCanvas com strokes normalizados + zoom/pan)
- `test-vertex-edit-smoke.mjs` (smoke pago do `editImage`)

**Alterados (pontuais):**
- `app/app/editar/page.tsx` e `components/spaces/VistaDetail.tsx` — switch por flag v1/v2
- `lib/spaces/edit-route-helpers.ts` — reuso de upload/attempt helpers
- `.env.local` / Vercel — envs da seção 6

**Intocados:** `/api/edits` (v1), `decideLegacy`/Flux, Renderizar, Spaces, Ampliar, Histórico, planos.

**Remoção (só na fase final, com v2 estável):** código morto da seção 1.11 + v1.

---

## 8. PLANO DE IMPLEMENTAÇÃO POR FASES

**Fase 1 — Branch, flags e validação Vertex (o gate de tudo)**
`git checkout -b feature/edit-v2-google-first`; você provisiona a service account + 3 envs; rodo o smoke pago do `editImage` (~US$0,50–1,00 de teste, com sua autorização) com máscara real numa imagem de arquitetura; em paralelo, baseline do schema de produção (`supabase db dump`). **Critério de saída**: inpaint Vertex funcionando ponta-a-ponta OU decisão explícita de plano B (NB2-direto como motor mascarado).

**Fase 2 — Providers e edit-router v2**
`lib/edit-v2/` completo (router puro + pricing + prompts + 2 providers Google + **normalizador de instrução** via gemini-2.5-flash + gate semântico ligado por padrão); testes unitários da matriz de roteamento (tipo × máscara × ref × qualidade); smoke do NB2/NB Pro via API Gemini direta. Sem UI, sem cobrança real ainda.

**Fase 3 — UI nova**
`EditV2Flow` atrás de `NEXT_PUBLIC_EDIT_V2`; canvas corrigido (coordenadas normalizadas + zoom/pan); 5 tipos + 3 controles; preview de custo; comparador. Verificação com tsc + dev server (o /app é auth-gated — validação manual sua no preview).

**Fase 4 — Cobrança e logs**
Rota `/api/edits/v2` única; débito/refund com `{error}` **verificado** e status `refunded` gravado; `maxDuration=300`; allowlist de hosts no fetch de imagens (mata o SSRF usando o padrão do `/api/download`); telemetria completa (request_id, duração, custo real); migration aditiva (com sua aprovação explícita).

**Fase 5 — Testes**
Suíte do router; smoke pago mínimo por provider×tipo (10–15 imagens reais de arquitetura, antes/depois documentado); teste do fluxo embebido no Spaces; teste de carga leve do preview; conferência de margem com a primeira fatura GCP.

**Fase 6 — Ativação gradual**
Liga `EDIT_V2` em preview → sua aprovação visual → produção com v1 ainda acessível por flag → 1–2 semanas de telemetria comparativa (taxa de rejeição do gate, drift médio, custo real/edição, margem) → remoção da v1 + código morto. Deploy **sempre com sua confirmação**.

---

## 9. RISCOS

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| 1 | `models.editImage`/Imagen capability falhar no smoke (quota, allowlist, formato) | **Alta** — invalida o motor principal | Fase 1 testa isso ANTES de qualquer construção; plano B definido (NB2 direto + recompose) |
| 2 | Reprecificação muda preço percebido por usuários atuais (alguns tiers sobem; free-fixes somem) | Alta (produto) | Comunicar; v1/v2 por flag; decisão de preços é sua antes da Fase 4 |
| 3 | Qualidade do Imagen inpaint pior que o esperado em cenas de arquitetura | Média | Smoke com imagens reais na Fase 1; gate de drift já protege; fallback NB2 |
| 4 | Migration sobre schema de produção desconhecido (drift comprovado) | Média | Baseline dump primeiro; migration aditiva e idempotente; nada destrutivo |
| 5 | Latência us-central1 + 2 providers (Google imagem, FAL segmentação) | Baixa | Jobs já são de 10–60s; timeout + maxDuration |
| 6 | Faturamento duplo durante transição (FAL + GCP) | Baixa | Telemetria de custo real por tentativa desde a Fase 2 |
| 7 | Service account JSON em env (vazamento = acesso ao projeto GCP) | Média | Papel mínimo (Vertex AI User), nunca no client, rotação documentada |
| 8 | Gate calibrado para o stack atual (2%/8%/1%) se comportar diferente com Imagen | Média | Recalibrar na Fase 5 com os deltas logados |
| 9 | Quebrar Renderizar/Spaces/Ampliar | Baixa | v2 é módulo novo; v1 intocada; zero mudança em rotas existentes |
| 10 | Indisponibilidade da API Google (sem o buffer da FAL) | Baixa | `EDIT_V2_FAL_FALLBACK` por flag, desligado por default |

---

## 10. PRÓXIMO PASSO RECOMENDADO

**Primeira ação prática** (barata, sem risco, e que decide a arquitetura inteira):

1. Eu crio a branch: `git checkout -b feature/edit-v2-google-first` e escrevo o `test-vertex-edit-smoke.mjs` (sem executar).
2. **Você** provisiona no GCP: service account com papel "Vertex AI User" no projeto + me passa os valores para `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_CREDENTIALS_JSON` no `.env.local` (eu nunca os imprimo).
3. Com sua autorização de gasto (~US$1), rodo o smoke do `imagen-3.0-capability-001` com uma imagem + máscara reais.

O resultado desse smoke define se o motor padrão da v2 é o Imagen ($0,02/edição, máscara real) ou o Gemini 3.1 Flash direto ($0,067–0,101) — e disso depende a tabela de preços final.

**Decisões que preciso de você antes de implementar** (nenhuma é bloqueante para a Fase 1):
- a) Aprovar a tabela de Nodes da seção 4 (ou ajustar os ⚠);
- b) Confirmar o fim dos free-fixes na v2;
- c) Autorizar o smoke pago (~US$1) e a criação da service account;
- d) Migration: só gero o arquivo e paro para você revisar — confirmar esse fluxo.
