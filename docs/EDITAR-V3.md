# Editar V3 — editor arquitetônico Google/Gemini-first

Reconstrução limpa do Modo Editar (2026-06-23). **Não reaproveita a lógica
remendada** do v1/v2/Clean — só os utilitários limpos e validados (recompose
server-side, upload de asset, tokens da marca). Roda **em paralelo**, totalmente
isolado e dormente por padrão: com as flags desligadas, nada muda.

## Princípios (do brief do fundador)

1. Geometria intocável.
2. Apenas o solicitado.
3. Alterar somente a área selecionada.
4. Preservar câmera, proporção, perspectiva, aberturas, iluminação e composição.
5. Interface simples para arquiteto, não para programador.
6. Visual premium, minimalista, manual da marca SpaceNode.

A garantia central (2,3,4) é **técnica, não só de prompt**: o modelo Gemini
re-sintetiza a cena inteira, então o resultado é **recomposto no servidor** sobre
a imagem original — só os pixels **dentro da máscara branca** entram (PNG
lossless, alpha binarizado, `keepMetadata`/ICC). Fora da seleção fica idêntico.

## Arquitetura

```
UI    components/edit-v3/EditV3Flow.tsx     três zonas (rail · canvas · painel) + rodapé histórico/antes-depois
      components/edit-v3/EditV3Canvas.tsx   seleção (laço/polígono/pincel/borracha/mover/auto), traços normalizados 0–1
      components/edit-v3/{BeforeAfter,icons}.tsx
page  app/app/editar-v3/page.tsx            /app/editar-v3 (gated NEXT_PUBLIC_EDIT_V3; redirect → /app/editar se off)
API   app/api/edit-v3/google/route.ts       POST: valida → dry-run/custo → gera → recompose → gate → cobra no sucesso
motor lib/ai/google/editImage.ts            @google/genai → generateContent (Nano Banana / gemini-3.1-flash-image)
      lib/ai/fal/editImage.ts               fallback OPCIONAL (FAL nano-banana/edit)
core  lib/edit-v3/pipeline.ts               recompose + gates de pixel (reusa lib/spaces/edit-crop read-only)
      lib/edit-v3/buildEditPrompt.ts        prompts arquitetônicos RÍGIDOS por ação
      lib/edit-v3/{types,flags,pricing,ssrf,persist,index}.ts
db    supabase/migrations/20260623000000_edit_v3_jobs.sql   ⚠️ AGUARDA APROVAÇÃO (não aplicada)
```

Upload de source/máscara/referência reusa a rota existente `POST /api/edits/upload-asset`
(bucket `space-mestres`). **Nenhum** arquivo de Renderizar/Spaces/Melhorar/Editar
v1/v2 é modificado.

## As 4 ações

| Ação | `action` | Seleção | Referência | Backend |
|---|---|---|---|---|
| Remover | `remove` | obrigatória | — | dilata a máscara; recompose duro |
| Trocar material | `swap_material` | obrigatória | `material` (opcional) | recompose com feather |
| Inserir elemento | `insert_element` | obrigatória | `object` (opcional) | recompose com feather |
| Refinar área | `refine_area` | obrigatória | — | dilata a máscara; recompose duro |

## Variáveis de ambiente

**Obrigatórias para o motor:**

| Var | Papel |
|---|---|
| `GEMINI_API_KEY` | Chave da API direta do Google (Gemini Image + texto). Deve estar `.trim()`-ada (a camada já faz). |
| `NEXT_PUBLIC_SUPABASE_URL` | Host permitido no allowlist SSRF + Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente admin (upload, cobrança, persistência). |

**Flags do V3 (lidas por chamada; toggláveis em runtime no servidor):**

| Var | Default | Efeito |
|---|---|---|
| `EDIT_V3_ENABLED` | off | Liga a rota `/api/edit-v3/google`. Desligada → **404**. |
| `NEXT_PUBLIC_EDIT_V3` | off | Liga a página `/app/editar-v3`. ⚠️ inlinada no **build** do cliente — mudar exige rebuild/redeploy. |
| `EDIT_V3_CHARGE` | **off (fail-safe)** | Cobrança REAL de nodes no sucesso **só com `=1` explícito**. Ausente/`0`/qualquer outro → **simulada** (não debita). |
| `EDIT_V3_FAL_FALLBACK` | off | Permite o fallback FAL (nano-banana) quando o Google falha. Exige `FAL_KEY`. |
| `EDIT_V3_ALLOW_PRO` | off | Libera a Alta precisão (gemini-3-pro-image). |
| `EDIT_V3_DEBUG` | off | Expõe bloco `debug` (provider/modelo/USD) — nunca no contrato público. |

**Overrides opcionais de modelo** (quando o GA chegar, sem deploy de código):
`GEMINI_FLASH_IMAGE_MODEL` (default `gemini-3.1-flash-image-preview`),
`GEMINI_PRO_IMAGE_MODEL` (default `gemini-3-pro-image-preview`).
**Fallback:** `FAL_KEY` (só se `EDIT_V3_FAL_FALLBACK=1`).

> A chave atual do projeto só resolve as variantes `-preview` dos modelos de
> imagem (validado 2026-06-12) — por isso são o default.

## Como ligar

**Local (.env.local):**
```
EDIT_V3_ENABLED=1
NEXT_PUBLIC_EDIT_V3=1
EDIT_V3_CHARGE=0        # opcional: não debita durante o teste manual
EDIT_V3_DEBUG=1         # opcional
```
Depois `npm run dev` e abra `http://localhost:3000/app/editar-v3`.

**Vercel (produção):** adicionar `EDIT_V3_ENABLED=1` + `NEXT_PUBLIC_EDIT_V3=1`
(e `EDIT_V3_CHARGE` conforme a decisão de pricing). Como `NEXT_PUBLIC_*` é
inlinada no build, **redeploy** após adicionar. Rollback = remover as flags.

## Cobrança

- **Fail-safe:** só cobra com `EDIT_V3_CHARGE=1` explícito. Sem a env (ou `=0`),
  nada é debitado — cobrança simulada.
- Debita **somente no sucesso** (gate aprovado), via `consume_workspace_nodes`.
  Falha técnica, rejeição do gate e erro de provider **nunca** cobram.
- Pré-voo de saldo antes de gerar (falha rápido com 402 sem gastar a chamada paga).
- `bump_monthly_usage` só quando cobra de verdade.
- ⚠️ **A tabela de Nodes em `lib/edit-v3/pricing.ts` é HIPÓTESE** (alinhada ao v2;
  margem negativa no piso para intents Gemini baratos). O fundador autorizou
  cobrança real, mas a tabela ainda precisa ser fechada contra custo real GCP,
  latência e margem por plano antes do go-live em produção.

## Persistência

Cada job grava `edit_v3_jobs` (source, mask, prompt, action_type, model,
provider, request_id, result, status, nodes, charged, métricas do gate). A
escrita é **resiliente**: se a tabela ainda não existir (migration não aplicada),
a edição roda normalmente e só a telemetria é pulada.

> A migration `20260623000000_edit_v3_jobs.sql` é **aditiva e não-destrutiva**
> (só cria a tabela nova + RLS + índice) e **aguarda aprovação explícita** antes
> de ser aplicada (protocolo: baseline dump → diff → aprovação). Rollback no topo
> do arquivo.

## Teste

`scripts/test-edit-v3.mjs` — **seguro por padrão**:

```
# smoke sem custo (negativos + dry-run de custo)
$env:EDIT_V3_ENABLED='1'; $env:EDIT_V3_CHARGE='0'; npm run dev      # noutro terminal
$env:EDIT_V3_TEST_USER='<uuid de um usuário real>'
node scripts/test-edit-v3.mjs

# dry-run dos 5 casos (custo ZERO) — preencha scripts/edit-v3-cases.json
node scripts/test-edit-v3.mjs --cases

# GERAÇÃO PAGA dos 5 casos (imprime o pré-voo de 7 itens antes)
node scripts/test-edit-v3.mjs --approve-paid-call
```

Os 5 casos do brief: remover objeto · trocar textura de parede · trocar piso ·
inserir vegetação · refinamento de área pequena. Cada geração custa ~US$0,067–0,10
(Gemini Flash). **Nenhuma chamada paga roda sem `--approve-paid-call`.**

> Em produção (`next start`/Vercel) o bypass `x-edit-v3-test-user` é desligado —
> o teste pago via script é só local; em produção, valide logado na UI.
