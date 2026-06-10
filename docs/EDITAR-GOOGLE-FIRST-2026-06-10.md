# Editar Google-first — decisões técnicas (2026-06-10)

Reformulação do modo Editar para um editor arquitetônico **guiado por intenção**,
com os modelos Google (Gemini/Nano Banana) como motor principal, Vertex Imagen
para edição mascarada precisa e Flux rebaixado a fallback oculto por feature flag.

## 1. Decisões de arquitetura

### 1.1 Transporte: FAL continua sendo o transporte dos modelos Google
Os modelos principais já existem na FAL e a `FAL_KEY` já está em produção:

| Papel | Modelo (produto) | Endpoint |
|---|---|---|
| Motor padrão (Edição rápida) | Gemini 3.1 Flash Image / Nano Banana 2 | `fal-ai/nano-banana-2/edit` |
| Motor premium (Edição premium) | Gemini 3 Pro Image / Nano Banana Pro | `fal-ai/nano-banana-pro/edit` |
| Edição conversacional (sem máscara) | os mesmos, em modo instrução | `google/gemini-3.1-flash-image` / `google/gemini-3-pro-image` (ids internos; chamam os endpoints FAL acima SEM enviar máscara) |
| Máscara precisa (remover/inserir/trocar material SEM referência) | Imagen 3 capability (inpaint) | `vertex/imagen-edit` (Vertex AI direto, atrás de `VERTEX_IMAGEN_ENABLED=1`) |

Trocar para Vertex/Gemini API direto para os Nano Banana fica como otimização
futura (exigiria re-hospedar upload de imagem; FAL aceita URLs públicas).

### 1.2 Feature flags
- `EDIT_GOOGLE_FIRST` — **default ON** (`!=='0'`). Com `0`, o roteamento volta
  EXATAMENTE ao legado (Flux) — rollback instantâneo sem deploy de código.
- `EDIT_FLUX_FALLBACK` — default OFF. Com `1`, o retry automático do quality
  gate usa o engine Flux correspondente como fallback (remove→flux-fill,
  inpaint→flux-kontext-lora, sem máscara→flux-pro/kontext). Flux nunca aparece
  na rota primária quando Google-first está ligado.
- `VERTEX_IMAGEN_ENABLED` — default OFF (era const `false`; agora env). Liga a
  rota `vertex/imagen-edit` quando as credenciais GCP estiverem provisionadas.
- `EDIT_SEMANTIC_GATE` — default OFF. Liga a avaliação semântica pós-geração
  via Gemini vision (mudança aplicada? geometria preservada? artefatos?
  referência seguida?). O gate de drift/no-change é sempre ativo (barato, sharp).

### 1.3 Intenções (camada nova, compatível com o vocabulário existente)
`EditIntent` (novo, UI/telemetria) → `EditMode`/`EditTool` (existente, API/DB):

| Intenção (UI) | id | EditMode | Máscara | Referência |
|---|---|---|---|---|
| Remover objeto | `remove_object` | `remove` | obrigatória | — |
| Trocar material | `swap_material` | `material` | obrigatória | textura opcional |
| Inserir objeto | `insert_object` | `add` | obrigatória | objeto opcional |
| Alterar iluminação | `adjust_lighting` | `lighting` | opcional | opcional |
| Ajustar estilo | `adjust_style` | `style` (novo) | opcional | estilo opcional |
| Corrigir imperfeição | `fix_imperfection` | `fix` | obrigatória | — |
| Editar com referência | `edit_with_reference` | `replace` | obrigatória | **explícita** (principal/referência/vista relacionada) |
| Criar variação controlada | `controlled_variation` | `variation` (novo) | nenhuma | opcional |

`EditMode` ganha `style` e `variation`; `EditTool` ganha os equivalentes.
Histórico/DB continuam usando `tool`; `edit_intent` é coluna NOVA apenas em
`image_edit_attempts` (telemetria). Payloads antigos (só `mode`) continuam aceitos.

### 1.4 Roteamento Google-first (resumo)
- Premium (opt-in explícito, nunca automático): NB Pro (com ou sem máscara), 5–6 nodes.
- COM máscara (qualquer área): endpoint mask-aware SEMPRE (corrige o P0 da
  auditoria — máscara nunca mais é descartada por prompt "complexo"/área grande):
  - sem referências e ferramenta de inpaint (remove/add/material/fix) com
    `VERTEX_IMAGEN_ENABLED` → `vertex/imagen-edit`;
  - senão → NB2 mascarado (máscara como 2ª imagem + recompose + gate).
- SEM máscara (style/variation/lighting/landscaping/prompt livre): NB2 instrução
  (4 nodes); premium → NB Pro instrução.
- Tiers de cobrança 0–6 mantidos (grátis/1/2/3/4/5–6) — justos e já validados.
- `shouldUseCrop`: só Vertex (Nano Banana é per-image e prefere contexto cheio).
- Referências: roteiam para NB2/NB Pro (multi-imagem). O gatilho "referência
  ancora inpaint" agora exige papel compatível (`material_texture`/
  `object_reference`) — corrige o P1-4 (qualquer referência virava
  reference_image_url no Flux).

### 1.5 Saída do router (espelha a spec do produto)
`EditRoutingResult` ganha `retryPolicy { maxAutoRetries, freeRetry,
fallback: EditRoutingResult | null }`. Mapeamento da spec:
`selectedProvider`=`endpointProvider(endpoint)`, `selectedModel`=`endpoint`,
`creditCost`=`costNodes`, `normalizedPrompt`=`composeRouterPrompt(...)` (servidor,
inadulterável pelo cliente), `retryPolicy`=acima.

### 1.6 Quality gate ampliado + retry automático (server-side)
Pipeline devolve agora `outOfMaskDelta` (existia) **e** `inMaskDelta` (novo).
Gates, na ordem:
1. **Drift fora da máscara** > limite (2% duro / 8% blend) → falha `out_of_mask_drift`.
2. **No-change**: edição mascarada de conteúdo (remove/material/replace/add/fix)
   com `inMaskDelta < 1%` → falha `no_change` (resultado imperceptível → não
   cobra; corrige o P1-6: nano-banana errava a superfície, recompose descartava
   tudo e o usuário pagava pela imagem idêntica).
3. **Semântico** (flag): Gemini vision compara original×resultado(×referência) e
   responde JSON (mudança aplicada, geometria, artefatos, referência seguida).

Falhou → **1 retry automático, grátis**, com prompt mais restritivo
(STRICT MASK CONSTRAINT) e, se `EDIT_FLUX_FALLBACK=1`, no engine Flux
equivalente. Falhou de novo → comportamento atual (refund/sem cobrança, status
`rejected_quality_gate` ou `rejected_no_change`, motivo gravado em `gate_reason`,
UI oferece tentar de novo/premium). Cobrança única no início; retry nunca debita.

### 1.7 Validações de máscara
- Cliente: máscara é gerada do próprio canvas na resolução natural (dimensões
  casam por construção); flows bloqueiam gerar sem máscara nas intenções que exigem.
- Servidor (autoritativo): a rota **rebaixa a máscara e recalcula a fração
  branca** (`maskWhiteRatio`) ANTES de rotear/cobrar — `mask_coverage` do cliente
  vira só estimativa de preview (corrige P1-5, integridade de cobrança).
- Pipeline: valida proporção máscara×imagem (>3% de divergência de aspecto →
  erro claro `mask_image_mismatch`, sem cobrança) e normaliza dimensões.
- Remoção: dilatação leve da máscara (`dilateMask`, ~0.6% do menor lado) antes
  do provider — cobre sombras/halos do objeto; recompose usa a máscara dilatada.

### 1.8 Cobrança
- Edição rápida (NB2): tiers 0–4 atuais. Edição premium (NB Pro): 5–6, só opt-in.
- Retry automático: grátis (sem novo débito; custo do provider é nosso).
- Sem alteração perceptível (`no_change`): não debita (refund automático).
- A UI mostra os DOIS preços (rápida/premium) por par de chamadas a
  `/api/edits/preview` (premium=false/true). Preview em baixa resolução: não
  construído nesta fase (documentado como futuro).

### 1.9 UI intenção-primeiro
Novo passo de intenção (8 cartões) antes do prompt, nos DOIS fluxos
(`RetocarStandaloneFlow` e `RetocarOverlay`). A interface se adapta por intenção
(config central `lib/spaces/edit-intents.ts`):
- Trocar material: seleção + prompt + upload de textura + toggle "Preservar
  geometria, perspectiva e iluminação original" (ON por padrão; OFF → fidelity
  `balanced`) + botões "Edição rápida"/"Edição premium".
- Editar com referência: campos explícitos (principal/referência/vista
  relacionada) + aviso "a referência não será editada, apenas usada como guia".
- Remover/Inserir: máscara obrigatória (botão desabilitado sem seleção).
Nenhum nome técnico de modelo é exposto.

### 1.10 Seleção de superfície por CLIQUE (V2 da camada de superfície)
O pincel deixou de ser o caminho principal do Trocar Material (atrás de
`SURFACE_SEGMENTATION_ENABLED`, como toda a camada de superfície):
- Ao escolher a intenção, abre o **SurfaceSelectModal**: atalhos **Piso/Parede**
  (EVF-SAM semântico) ou **clique direto na superfície** (SAM2 point prompt);
  preview verde a cada passo.
- **Refinamento**: "+ adicionar área" / "− remover área" — cada clique segmenta
  a região clicada e a UNE (`unionMasks`, close neutro sem erode) ou SUBTRAI
  (`subtractObjectsFromSurface`, com dilatação leve) da seleção; com Desfazer.
- O modal antigo de confirmação do pincel ganhou **"Refinar seleção"** (abre o
  mesmo modal já com a superfície detectada) — fim do aceita/recusa binário.
- `/api/edits/segment` agora tem 4 modos: `semantic` ('floor'|'wall'),
  `points` (clique inicial), refino (`base_mask_url`+`points`+`op`) e o blob
  legado. Cada chamada de segmentação é custo da casa (sem node do usuário).
- Quando há seleção de superfície ativa, o generate usa ESSA máscara (pincel é
  ignorado, chip no painel deixa claro) e pula o pré-passo de segmentação.

## 2. Migrations necessárias (LISTADAS — **não aplicadas automaticamente**)

1. `supabase/migrations/20260610000000_edit_google_first.sql`
   - `image_edit_attempts.tool` CHECK += `'style','variation'`;
   - `image_edit_attempts.status` CHECK += `'rejected_no_change'`;
   - novas colunas em `image_edit_attempts`: `edit_intent text`,
     `quality_mode text`, `auto_retry_count smallint not null default 0`,
     `gate_reason text`, `in_mask_delta numeric`, `out_of_mask_delta numeric`.

O código é **resiliente à migration ausente**: inserts/updates tentam com as
colunas novas e refazem sem elas em caso de erro de schema; intenções novas
(`style`/`variation`) só perdem a linha de telemetria (a edição funciona).
Aplicar com `supabase db push` ou via MCP (`apply_migration`) após review.

## 3. Compatibilidade
- Renderizar/Spaces/Ampliar/Histórico: intocados (mudanças confinadas a
  `lib/spaces/edit-*`, `lib/spaces/engines/*`, rotas `/api/edits*` e
  `/api/spaces/.../edit`, componentes Retocar).
- Flux: NENHUM provider removido — todos os engines continuam compilados e
  acessíveis pelo flag de rollback/fallback.
- Planos/nodes globais: tabela de tiers intacta; nada muda fora do Editar.
- Segmentação de superfície (SAM/EVF): pré-passo inalterado — a máscara de
  superfície continua entrando como `mask_url` normal.

## 4. Pendências conscientes
- Vertex Imagen: código pronto atrás de flag; ligar exige
  `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` (default `us-central1`) e
  `GOOGLE_VERTEX_CREDENTIALS_JSON` (service account) na Vercel + redeploy
  ([[project_vercel_env_parity]]).
- Smoke pago dos endpoints NB2/NB Pro (schema verificado contra a doc FAL;
  chamada real gasta crédito — usar `test-edit-router-fal.mjs`).
- Custo USD NB2/NB Pro estimado (0.045/0.15) — vigiar `provider_cost_usd`.
