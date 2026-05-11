# SPACENODE — Changelog AI

> Registro cronológico de entregas feitas por agentes de IA (Claude Code, Codex, ChatGPT, Gemini).
> Cada entrada documenta: data, agente responsável, branch, commits, resumo, validações e pendências.
>
> Entradas mais recentes no topo.

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
