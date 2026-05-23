# SPACENODE — Changelog AI

> Registro cronológico de entregas feitas por agentes de IA (Claude Code, Codex, ChatGPT, Gemini).
> Cada entrada documenta: data, agente responsável, branch, commits, resumo, validações e pendências.
>
> Entradas mais recentes no topo.

---

## 2026-05-23 — PR #64 aberto: SPACES v2 sincroniza código ao schema vivo

- **Agente responsável:** Claude Code
- **Branch:** `claude/spaces-edicao-localizada` (22 commits ahead de `main`)
- **PR:** [#64 — feat(spaces): SPACES v2 — DNA + Vistas + Packs + Retocar](https://github.com/viniciuspisoni/spacenode/pull/64) — **OPEN**

### Contexto

O `main` carregava o código v1 do Spaces (PR #53, 11/maio) mas o banco em produção já tinha o schema v2 aplicado em 9/maio (13 migrations via Supabase MCP). A tentativa de expor v1 em preview (PR #57) foi revertida pelo PR #58 exatamente por isso. O sprint v2 vivia paralelo na branch `claude/spaces-edicao-localizada`, sem ser mergeado.

### Resumo da entrega

PR #64 fecha o descompasso. Mergeia o código v2 — que conversa com as tabelas reais (`spaces.dna`, `spaces.source_render_id`, tabelas separadas `vistas`/`packs`/`architect_identity`/`edits`) — em `main`.

**Funcionalidades trazidas:**
- **Spaces v2:** DNA system (extração via Gemini Vision), Vistas em 4 eixos (iluminação/ângulo/horário/detalhe), lock de DNA, integração Renderizar→Spaces (caminho A), eixo Ângulo guiado por sketch.
- **Packs:** apresentações compartilháveis com link público `/p/[slug]`, PDF export, comentários.
- **Architect Identity:** white-label, footer customizado, accent color derivado do DNA.
- **Retocar:** módulo de inpainting via Flux Fill (standalone + dentro de Vista), 3 motores com router + auto-retry.
- **Sidebar reativado:** item `spaces` com `href` ativo + badge `novo`; novos itens `retocar` e `identidade`.

**Migration versionada:**
- `supabase/migrations/20260509000000_spaces_block_1.sql` (consolidação do schema v2 já aplicado em prod).

**Deps:**
- `@google/genai ^2.4.0` (Gemini Vision para DNA extraction).
- `sharp ^0.34.5` (Pack PDF image processing).

### Reconciliação `main → v2`

13 commits de `main` (PRs #55–#63) puxados para v2. Apenas 4 conflitos:
- 3 `app/app/spaces/*` pages: ficou v2 (stubs descartados).
- `components/app/Sidebar.tsx`: combinada — v2 (spaces ativo, retocar, identidade) + main (item `conta`).

### Lint cleanup

16 erros encontrados após o merge `main → v2` (4 do PR #55 que main já corrigiu, eliminados pelo merge automático + 12 novos em código v2). Resolvidos:
- 10 com `eslint-disable-next-line` + justificativa (mesmo padrão do PR #55).
- 2 refatorados para `useEffect` + `ResizeObserver` (refs em render → padrão React 19 correto): `RetocarOverlay.tsx:452`, `RetocarStandaloneFlow.tsx:702`.

### Commits relevantes no PR #64

| Commit | Descrição |
|---|---|
| `5712259` | `Merge main into claude/spaces-edicao-localizada` (13 commits + 4 conflitos resolvidos) |
| `4309bb0` | `fix(lint): clear 12 react-hooks errors introduced by v2 modules` |
| `730c6d6` | `chore(deps): add sharp + @google/genai (mirror main's WIP)` |

### Validações feitas

- [x] `tsc --noEmit` no worktree v2 — **0 erros**.
- [x] `eslint .` no worktree v2 — **0 erros**, 28 warnings (pré-existentes `<img>`/unused).
- [x] `next build --webpack` no worktree v2 — **clean**, 54 rotas geradas.
- [x] Vercel preview deploy do PR #64 — `pass`.

### Pendências

- [ ] **Decisão de produto:** code review formal (Codex / `/ultrareview`) antes do merge, ou merge direto?
- [ ] **Merge em `main`** (estratégia: merge commit, não squash — preserva histórico de v2).
- [ ] **Pós-merge:** smoke test em produção do ciclo Space → DNA → Vista → Pack → Retocar.
- [ ] **Migrations órfãs no banco:** 13 migrations aplicadas via MCP entre 9 e 20/maio existem só no banco (não como arquivo). O arquivo `20260509000000_spaces_block_1.sql` é uma consolidação, mas as outras (drop_spaces_v1_schema, vistas_eixo_angulo_fields, retocar_schema, animar_v2_walkthroughs, profiles_credits_default_40, etc.) ainda não estão versionadas. Tech debt de versionamento.
- [ ] **Limpeza:** deletar branches mergeadas e ~60 worktrees abandonados em `.claude/worktrees/`.

---

## 2026-05-11 (depois do PR #53/#54) — PR #55 mergeado: base técnica de lint zerada

- **Agente responsável:** Claude Code
- **Branch:** `fix/main-lint-errors` (mergeada via squash; pode ser deletada)
- **PR:** [#55 — fix(lint): clear 4 pre-existing react-hooks errors in main](https://github.com/viniciuspisoni/spacenode/pull/55) — **MERGED**

### Commit em `main`

| Commit | Descrição |
|---|---|
| `3e383aad3ef0a3fd3c4f2a384538e06668c3fd16` | `fix(lint): clear 4 pre-existing react-hooks errors in main (#55)` |

### Resumo da entrega

Correção cirúrgica dos 4 erros de ESLint pré-existentes em `main` (identificados durante a validação do PR #53). **Zero mudança de comportamento de produto.** Diff total: 3 arquivos, +7 / −2.

- `app/app/billing/BillingClient.tsx:52` e `:58` — `react-hooks/immutability`: `window.location.href = r.url` → `window.location.assign(r.url)` (equivalente per MDN — ambos disparam navegação com a mesma entrada de histórico; o método não é flagrado como mutação de variável externa).
- `app/app/history/HistoryClient.tsx:99` — `react-hooks/set-state-in-effect`: `eslint-disable-next-line` com justificativa (sincronização intencional da lista visível com props do server após `router.refresh()` — o "cascading render" alertado é exatamente o efeito desejado).
- `app/app/video/VideoClient.tsx:107` — mesma regra, mesmo tratamento (ajuste intencional de `selectedDuration` ao trocar de engine, quando Kling 5/10s ↔ Veo 4/6/8s tornam o valor atual inválido).

Refatoração para `render-time setState` (padrão recomendado pelas React docs) foi explicitamente descartada nesta task — opção "A" do plano, escolhida para garantir zero mudança de runtime behavior.

### Validações feitas

- [x] `npx tsc --noEmit`: **0 erros**.
- [x] `npm run lint`: **0 errors** (era 4), 19 warnings (todos pré-existentes `<img>`, fora do escopo).
- [x] `next build --webpack`: **clean**, todas as 24 rotas geradas.
- [x] PR mergeado via squash em `2026-05-11T18:18:13Z` → commit `3e383aa`.
- [x] Deploy de produção Vercel: `success` em `2026-05-11T18:18:54Z` (~41s).
- [x] `https://spacenode.app` respondendo `HTTP 200`, `Age: 0` (resposta fresca pós-deploy), `Content-Length: 121045` (mesmo tamanho dos deploys anteriores — mudança não afeta o HTML servido).
- [x] `package.json` / `package-lock.json`: **não tocados** (sem diff).
- [x] Workspace principal `C:\Users\Pisoni\spacenode`: **não tocado** (WIP de `+sharp` preservado).

### Estado consolidado após o merge

- **Trunk:** `main` em `3e383aa`.
- **Lint:** **0 errors**, 19 warnings (pré-existentes `<img>`).
- **Produção:** [spacenode.app](https://spacenode.app), deploy `success`.
- **Base técnica:** pronta para iniciar SPACES Engine v2 sem bloqueio.

### Pendências

- [ ] **Iniciar SPACES Engine v2** — próxima sprint de produto.
- [ ] Deletar branches remotas mergeadas: `feature/spaces-mvp`, `docs/sync-update`, `fix/main-lint-errors`.
- [ ] Remover worktrees locais temporários quando seguro: `spaces-mvp-docs`, `docs-sync-update`, `fix-lint-errors`, `docs-sync-after-lint-fix` (depois deste PR de docs mergear).

---

## 2026-05-11 (final do dia) — PR #53 mergeado em `main` + deploy de produção

- **Agente responsável:** Claude Code (reconciliação + merge) + Codex (review prévio, sem mudanças neste passo)
- **Branch:** `feature/spaces-mvp` (mergeada em `main`; pode ser deletada)
- **PR:** [#53 — feat: SPACES MVP — visual project evolution](https://github.com/viniciuspisoni/spacenode/pull/53) — **MERGED**

### Commits relevantes

| Commit | Descrição |
|---|---|
| `731d3b2` | `Merge origin/main into feature/spaces-mvp` (reconciliação prévia ao merge do PR) |
| `27c6790` | `Merge pull request #53 from viniciuspisoni/feature/spaces-mvp` (HEAD atual em `main`) |

### Resumo da entrega

PR #53 foi mergeado em `main` com estratégia de **merge commit** (parents preservados, não squash). Antes disso foi necessária uma reconciliação porque `main` evoluiu em paralelo com SPACES (PR #5 trouxe o mesmo MVP, depois PR #7 adicionou upload de ângulo, depois commits `75e5a5b`/`536ff6d` adicionaram Vista Mestre como âncora e fixes de prompts) além de ~25 features de UI/UX.

**Reconciliação `731d3b2` — 13 conflitos resolvidos, todos pegando `main`:**

- 9 arquivos SPACES (api/lib/components + 3 page.tsx): main tinha implementação **mais avançada** (upload de ângulo, Vista Mestre âncora, fix de prompts) **e** todas as guards de segurança que `feature/spaces-mvp` trazia. Os 3 `page.tsx` viraram stubs hide-until-beta via PR #51.
- 4 arquivos globais (`Sidebar.tsx`, `app/layout.tsx`, `GenerateClient.tsx`, `HistoryClient.tsx`): main tinha o UI/UX mais recente — sistema `badgeTone`, theme toggle migrado para sidebar, pastas/seleção múltipla/paginação no histórico, import de `Viewport` no layout.

Migrations da entrega (já em produção desde 2026-05-03, idempotentes, byte-idênticas nas duas branches):
- `supabase/migrations/20260503000000_create_spaces_v2.sql`
- `supabase/migrations/20260503000001_create_consume_credits_rpc.sql`

### Estado em produção após o merge

- **Trunk:** `main` em `27c6790`.
- **Deploy:** Vercel `success` em `2026-05-11T17:22:29Z` (~40s após o merge).
- **URL canônica:** [https://spacenode.app](https://spacenode.app) — `HTTP 200`, HTML servindo Geist local + meta viewport.
- **SPACES no menu:** **oculto** (`badge: 'em breve'` muted + `href: null` em `components/app/Sidebar.tsx`). Pages `/app/spaces*` retornam stubs "Em breve" / redirect. Implementação completa preservada nos demais arquivos.

### Capacidades SPACES presentes em `main` hoje

- Upload de ângulo (rascunho do usuário renderizado com DNA do projeto, limite 10 MB).
- Vista Mestre como âncora visual em toda chamada FAL (coerência entre Vistas).
- `parent_render_id` validado com `.eq('space_id', spaceId)` — impede cross-space.
- `consume_credits` chamado **antes** do FAL (P0 créditos).
- `consume_credits` via `supabase.rpc` (não `admin.rpc`) — `auth.uid()` resolve para SECURITY DEFINER.
- RPC `consume_credits` blindada: guard de `amount > 0`, guard `auth.uid() = user_id_input`, `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated`.
- Upload `SPACES_MAX_UPLOAD_BYTES` (10 MB) via constante única client/server.

### Validações feitas

- [x] Validação local pós-reconciliação: `tsc --noEmit` = **0 erros**; `next build --webpack` = **clean** (24 páginas geradas, único warning é `metadataBase`); `npm run lint` = **0 erros introduzidos** pelo merge.
- [x] Vercel preview (PR pré-merge) = ✅ pass.
- [x] PR mergeado às `2026-05-11T17:21:49Z` via `gh pr merge --merge`.
- [x] Deploy de produção Vercel = `success` às `2026-05-11T17:22:29Z`.
- [x] Verificação direta: `HEAD https://spacenode.app` → `HTTP 200`, conteúdo fresco pós-deploy.
- [x] `package.json` / `package-lock.json` **não tocados** em nenhum passo (preserva WIP do `sharp` no workspace principal).
- [x] Workspace principal `C:\Users\Pisoni\spacenode` **não foi tocado** — todo o trabalho ficou em worktrees dedicados (`spaces-mvp-docs`, depois `docs-sync-update`).

### Pendências

- [ ] **Corrigir os 4 erros de lint pré-existentes em `main`** — bloqueiam o início de SPACES Engine v2 conforme combinado:
  - `app/app/billing/BillingClient.tsx:52` — `react-hooks/immutability`
  - `app/app/billing/BillingClient.tsx:58` — `react-hooks/immutability`
  - `app/app/history/HistoryClient.tsx:99` — `react-hooks/set-state-in-effect`
  - `app/app/video/VideoClient.tsx:107` — `react-hooks/set-state-in-effect`
- [ ] **Depois disso:** iniciar **SPACES Engine v2**.
- [ ] Reativar `/spaces` e `/animate` no menu principal quando autorizado o beta público.
- [ ] Deletar branch remota `feature/spaces-mvp` (já mergeada).
- [ ] Remover worktrees temporários `spaces-mvp-docs` e `docs-sync-update`.

---

## 2026-05-11 — SPACES MVP consolidado em `feature/spaces-mvp`

- **Agente responsável:** Claude Code (implementação) + Codex (review)
- **Branch:** `feature/spaces-mvp` (publicada em `origin`, HEAD `0158581`)
- **PR:** a abrir contra `main`

### Commits relevantes (em ordem cronológica)

| Commit | Descrição |
|---|---|
| `5a08034` | `feat(spaces): add SPACES MVP — Dias 1–7 completos` |
| `e8fb699` | `fix(spaces/evolve): corrigir P0 segurança + P0 créditos antes do FAL` |
| `d71b541` | `fix(spaces/upload): padronizar limite de 10 MB em constante única` |
| `0070f65` | `chore(release-checks): lint, font, ESLint ignore, consume_credits migration` |
| `0158581` | `fix(rpc): harden consume_credits — amount guard + auth.uid() + REVOKE/GRANT` |

### Resumo da entrega

Entrega completa do **SPACES MVP** (Dias 1–7): novo conceito de projeto persistente com DNA visual e coleção de Vistas coerentes.

- Novas superfícies: `/app/spaces`, `/app/spaces/new`, `/app/spaces/[spaceId]`.
- Novas APIs: `POST /api/spaces`, `GET/PATCH /api/spaces/[spaceId]`, `GET /api/spaces/[spaceId]/vistas`, `POST /api/spaces/[spaceId]/evolve`, `GET /api/spaces/[spaceId]/suggestions`.
- Modos de geração `coerente` (preserva DNA) e `explorar` (com overrides).
- Tabela `spaces` + extensões em `renders` (`space_id`, `parent_render_id`, `vista_type`, `generation_mode`, `dna_overrides`).
- View `spaces_with_counts` com `security_invoker = on` (RLS-safe em Postgres 15+).
- RPC `consume_credits` blindada:
  - `amount > 0` obrigatório.
  - `auth.uid()` deve casar com `user_id_input`.
  - `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated`.
  - Chamada em `evolve/route.ts` migrada de `admin.rpc` para `supabase.rpc` para resolver `auth.uid()`.
- Upload padronizado em **10 MB** via constante única.
- P0 créditos: débito **antes** da chamada ao FAL (impede geração sem cobrança).

### Migrations entregues

1. `supabase/migrations/20260503000000_create_spaces_v2.sql` — schema SPACES v2 (idempotente, já aplicado em produção em 2026-05-03).
2. `supabase/migrations/20260503000001_create_consume_credits_rpc.sql` — RPC blindada (idempotente).

### Validações feitas

- [x] Code review por **Codex** — aprovado (código, schema SPACES v2 e RPC `consume_credits`).
- [x] Build local em worktree — **clean** com `--webpack` (Turbopack falha em worktree).
- [x] `tsc` — **0 erros**.
- [x] Lint — **0 erros**.
- [x] Migrations aplicadas em **produção** em 2026-05-03 (idempotentes, sem rollback).
- [x] Branch publicada em `origin/feature/spaces-mvp`.

### Pendências

- [ ] **Abrir PR** `feature/spaces-mvp` → `main`.
- [ ] **CI verde** (lint + tsc + build) no GitHub Actions.
- [ ] **Preview deploy na Vercel** com build limpo.
  - Bloqueio operacional local: `spawn EPERM` intermitente no build em worktrees Windows. Não é regressão de código — workaround é usar `node ".../next/dist/bin/next" build --webpack`. CI/Vercel deve rodar limpo.
- [ ] Confirmar migrations em **staging** (ou validar via preview Vercel apontando para Supabase de produção, onde já estão aplicadas).
- [ ] **Merge em `main`** após CI verde.
- [ ] **Iniciar SPACES Engine v2** após o merge.

---

<!--
Modelo para novas entradas:

## YYYY-MM-DD — Título curto da entrega

- **Agente responsável:** <Claude Code | Codex | ChatGPT | Gemini>
- **Branch:** `<branch>`
- **PR:** <#número ou "a abrir">

### Commits relevantes

| Commit | Descrição |
|---|---|
| `<hash>` | `<mensagem>` |

### Resumo da entrega

<o que mudou e por quê>

### Validações feitas

- [x] <validação>

### Pendências

- [ ] <pendência>
-->
