# SPACENODE — Project Sync

> Fonte única de verdade para alinhamento entre agentes (Claude Code, Codex, ChatGPT, Gemini).
> Toda decisão, estado e pendência do projeto deve partir daqui.
>
> **Última atualização:** 2026-05-23
> **Mantido por:** Vinicius Pisoni + agentes de IA

---

## 1. Visão do produto

**SPACENODE** é uma plataforma premium de produção visual com IA voltada para **arquitetos e designers de interiores**.

- **Capacidades atuais:** renders fotorrealistas, refino/upscale de imagem, variações do mesmo projeto, imagens de apresentação (ângulos, detalhes), animação leve de imagem (em pausa temporária).
- **Capacidades no roadmap:** SPACES Engine v2 (DNA do projeto + Vistas coerentes), geração de vídeo, storytelling visual.
- **Público-alvo:** arquitetos, designers de interiores, pequenos estúdios de alto padrão.
- **Posicionamento:** premium, minimalista, rápido, alto valor percebido, simplicidade Apple-like.
- **Princípios de UX:** clareza de valor, hierarquia forte, micro-interações sutis. Sem over-engineering. Melhorias pequenas e precisas dentro da estrutura existente.

---

## 2. Estado atual

| Item | Estado |
|---|---|
| Geração principal (`/app/generate`) | Em produção |
| Upscale (`/upscale`) | Em produção |
| Histórico (`/history`) | Em produção |
| Login + signup (email/senha + OAuth) | Em produção |
| Landing page | Em produção |
| Planos / créditos (Stripe) | Em produção |
| Animate v2 (redesign 3 modos) | Em produção em `main` desde PR [#63](https://github.com/viniciuspisoni/spacenode/pull/63) |
| SPACES MVP (v1) | **Obsoleto em `main`.** Código v1 (PR [#53](https://github.com/viniciuspisoni/spacenode/pull/53)) é incompatível com schema v2 aplicado no banco em 9/maio. Item escondido na sidebar via PR [#51](https://github.com/viniciuspisoni/spacenode/pull/51); páginas top-level são stubs. |
| SPACES v2 (DNA + Vistas + Packs + Retocar) | **PR [#64](https://github.com/viniciuspisoni/spacenode/pull/64) aberto em 2026-05-23, aguardando review/merge.** Vercel preview ✅ pass. Sincroniza código ao schema vivo. |

### Branch atual

- **Trunk:** `main` em `ae883ca` (`feat(animar): redesign module with 3 modes, presets and provider adapters (#63)`).
- **PR aberto:** [#64 — SPACES v2 — DNA + Vistas + Packs + Retocar](https://github.com/viniciuspisoni/spacenode/pull/64) na branch `claude/spaces-edicao-localizada` (22 commits ahead). Vercel preview ✅ pass.

#### Histórico anterior
- **Últimos merges em `main`:**
  - **PR [#55](https://github.com/viniciuspisoni/spacenode/pull/55):** `fix(lint)` — 4 erros pré-existentes zerados via squash em `2026-05-11T18:18:13Z` (commit `3e383aa`). Lint local agora **0 errors**.
  - **PR [#54](https://github.com/viniciuspisoni/spacenode/pull/54):** `docs: sync to main state after PR #53 merge` — squash em `2026-05-11T17:44:45Z` (commit `63b135b`).
  - **PR [#53](https://github.com/viniciuspisoni/spacenode/pull/53):** `feat: SPACES MVP — visual project evolution` — merge commit em `2026-05-11T17:21:49Z` (commit `27c6790`, parents preservados, não squash).
- **Reconciliação prévia ao PR #53:** o commit `731d3b2` em `feature/spaces-mvp` mergeou `origin/main` para reconciliar divergências entre a feature (foco em segurança/release) e a evolução paralela do SPACES em `main` (que já tinha o MVP via PR #5 + features extras via PR #7 e commits `75e5a5b`/`536ff6d`).
- **Deploy de produção:** ✅ Vercel `success` no HEAD atual `3e383aa` em `2026-05-11T18:18:54Z`. Canônica: **[spacenode.app](https://spacenode.app)** (`HTTP 200`, HTML servindo Geist local + meta viewport).
- **Code review (Codex):** aprovou SPACES MVP, schema v2 e RPC `consume_credits` no PR #53.
- **Branches mergeadas (passíveis de deleção):** `feature/spaces-mvp`, `docs/sync-update`, `fix/main-lint-errors`.

---

## 3. Features existentes (em produção em `main`)

- **Autenticação:** email/senha + Google OAuth via Supabase, signup na mesma página.
- **Geração de imagem (`/app/generate`):** upload drag-and-drop, seletores Ambiente/Estilo/Iluminação, slider Geometry Lock (0–100%), seletor de motor (Vega/Pulsar/Quasar + outros), comparador antes/depois, download.
- **Upscale (`/app/upscale`):** recomendação dinâmica de modelo a partir de heurísticas de arquivo, banner contextual, tags de modelo.
- **Histórico (`/app/history`):** galeria de renders, labels amigáveis dos modelos, double-click para seleção.
- **Planos (`/app/plans`):** integração Stripe (checkout + webhook), compra de Nodes extras (avulsos, sem validade; ex-"Lumens") para qualquer plano pago. Vitrine: Starter/Pro/Studio — Office é legado (sem novas assinaturas; assinantes existentes mantêm benefícios).
- **Landing:** versão minimal, sem SocialProof, foco em conversão.

---

## 4. SPACES MVP — detalhes da entrega

> **Em produção em `main`** desde 2026-05-11 (PR [#53](https://github.com/viniciuspisoni/spacenode/pull/53), merge commit `27c6790`). O código vivo combina o trabalho de `feature/spaces-mvp` (foco em segurança/release/docs) com a evolução paralela em `main` (features adicionais: upload de ângulo, Vista Mestre como âncora, fix de prompts).

### Visibilidade em produção

O código do SPACES MVP está **em produção em `main`**, mas o item **"spaces" na sidebar permanece com `badge: 'em breve'` muted e `href: null`** — escondido até a liberação do beta público (mesmo padrão de `/animate`). Os routes `/app/spaces`, `/app/spaces/new` e `/app/spaces/[spaceId]` são stubs ("Em breve" / redirect) introduzidos pelo PR #51 (`0460689`). Reativar para o beta é trocar `href: null` por `'/app/spaces'` em `components/app/Sidebar.tsx`, ajustar o badge, e restaurar as três `page.tsx` da implementação completa (presente no histórico via merge).

### Conceito

O **SPACES** é a evolução do projeto único de geração: cada Space é um **projeto persistente** com **DNA visual** (estilo, materiais, paleta, contexto, iluminação) e uma coleção de **Vistas** (renders coerentes entre si — mestre, iluminação, material, ângulo, detalhe, interior).

### Superfícies implementadas

- **`/app/spaces`** — lista de Spaces do usuário.
- **`/app/spaces/new`** — criação de Space (nome, categoria, render âncora).
- **`/app/spaces/[spaceId]`** — detalhe do Space, Vistas, evolução.
- **APIs:**
  - `POST /api/spaces` — criar Space.
  - `GET/PATCH /api/spaces/[spaceId]` — leitura/edição.
  - `GET /api/spaces/[spaceId]/vistas` — listagem de Vistas.
  - `POST /api/spaces/[spaceId]/evolve` — gerar nova Vista (modo `coerente` ou `explorar`).
  - `GET /api/spaces/[spaceId]/suggestions` — sugestões de próximos passos.

### Modos de geração

- **`coerente`** — preserva DNA do projeto, gera variações que pertencem ao mesmo conjunto.
- **`explorar`** — permite override do DNA (`dna_overrides`) para variações mais livres.

### Recursos avançados presentes em `main` (além do MVP de Dias 1–7)

- **Upload de ângulo** (PR #7, commit `b2c3ed3`) — usuário envia rascunho/wireframe e o SPACES renderiza com o DNA do projeto. Limite **10 MB** validado client/server via constante única `SPACES_MAX_UPLOAD_BYTES` (`lib/spaces/upload.ts`).
- **Vista Mestre como âncora visual** (commit `536ff6d`) — `callFalForVista(inputUrl, prompt, mestreUrl)` injeta a Vista Mestre em toda chamada FAL para coerência entre Vistas. De-duplicação automática quando `inputUrl == mestreUrl`.
- **Fix de prompts em ângulo** (commit `75e5a5b`) — trava materiais e remove conflito de `geometry_lock` no modo `ângulo`.

### Segurança aplicada (presente em `main` hoje)

- **P0 créditos:** `consume_credits` chamada **antes** do FAL em `evolve/route.ts` (comentário explícito na linha do RPC). Não há refund automático se o FAL falhar depois — refund é tech debt P1 pós-beta.
- **`parent_render_id` protegido por `spaceId`:** todo lookup do parent usa `.eq('id', parent_render_id).eq('space_id', spaceId)` — impede um render de outro Space ser usado como pai.
- **RPC `consume_credits` blindada:**
  - Guard de `amount` (rejeita NULL, 0 e negativos).
  - Guard `auth.uid()` (rejeita JWT ausente ou divergente de `user_id_input`).
  - `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated`.
  - Em `evolve/route.ts`, chamada via `supabase.rpc` (não `admin.rpc`) para que `auth.uid()` resolva.
- **Upload de imagem:** **10 MB** validado via constante única `SPACES_MAX_UPLOAD_BYTES` (`lib/spaces/upload.ts`), import compartilhado client/server.

### Merge para `main`

| Item | Valor |
|---|---|
| PR | [#53 — feat: SPACES MVP — visual project evolution](https://github.com/viniciuspisoni/spacenode/pull/53) |
| Merge commit | `27c6790f12668f0c30504134105d300155e92c7c` |
| Mergeado em | `2026-05-11T17:21:49Z` |
| Estratégia | merge commit (preserva os dois parents — reconciliação `731d3b2` ↔ `0460689`) |
| Deploy de produção | ✅ Vercel `success` em `2026-05-11T17:22:29Z` |
| URL canônica | [https://spacenode.app](https://spacenode.app) |

---

## 5. Banco / Supabase

- **Plataforma:** Supabase (Postgres 17, Auth, Storage, RLS).
- **Tabela principal pré-existente:** `renders` (histórico de gerações).
- **Tabela principal de SPACES:** `spaces` (nova, criada na migration v2).

### Divergência crítica vs. briefing original

> O briefing de SPACES v2 referencia `render_jobs`. **O projeto usa `renders`.** Toda nova feature deve seguir o nome real da tabela. Colunas reais em `renders`:
> - `input_url` (não `input_image_url`)
> - `output_url` (não `output_image_url`)
> - `prompt` (não `compiled_prompt`)

### Migrations da entrega

Ambas estão **em `main`** (chegaram via PR #5 antes do merge do PR #53; os arquivos em `feature/spaces-mvp` eram byte-idênticos) e foram **aplicadas em produção em 2026-05-03** (idempotentes — `IF NOT EXISTS` / `CREATE OR REPLACE`). Os arquivos estão commitados para versionamento e provisionamento de novos ambientes; **não rodar `supabase db push`** contra produção.

1. **`supabase/migrations/20260503000000_create_spaces_v2.sql`**
   - Cria tabela `spaces`.
   - Adiciona colunas em `renders`: `space_id`, `parent_render_id`, `vista_type`, `generation_mode`, `dna_overrides`.
   - View `spaces_with_counts` com `security_invoker = on` (RLS-safe em Postgres 15+).
   - RLS policies para `spaces`.

2. **`supabase/migrations/20260503000001_create_consume_credits_rpc.sql`**
   - RPC `consume_credits(user_id_input uuid, amount integer)` com `SECURITY DEFINER`.
   - Guards: `amount > 0`, `auth.uid() = user_id_input`.
   - `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated`.
   - Retorna `false` em qualquer falha; caller mapeia para HTTP 402.

### Status das migrations

- **Produção:** aplicadas em 2026-05-03; sem rollback necessário até agora.
- **Staging:** não houve passo intermediário; preview deploy do Vercel (PR #53) validou o build com Supabase de produção sem migration adicional.

---

## 6. Decisões técnicas relevantes

- **Next.js 16.2.4** com App Router + Turbopack, React 19, TypeScript estrito.
- **Não é o Next.js padrão:** ver `AGENTS.md` — sempre consultar `node_modules/next/dist/docs/` antes de assumir API.
- **Build em worktree:** Turbopack falha; usar `node "C:\Users\Pisoni\spacenode\node_modules\next\dist\bin\next" build --webpack`.
- **IA de imagem:** `@fal-ai/client` v1.9.5.
- **Cliente Supabase:** três variantes — `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (SSR), `lib/supabase/admin.ts` (service role, apenas server-side).
- **RPC sensível chamada com JWT do usuário:** sempre via `supabase.rpc`, nunca `admin.rpc`, para que `auth.uid()` resolva.
- **Stripe:** Nodes extras (compra avulsa, sem validade; ex-"Lumens") para qualquer plano pago; plano Office legado (produtos/preços preservados no Stripe, sem novas vendas).

---

## 7. Pendências

### Próxima sprint de produto

- [ ] **Iniciar SPACES Engine v2** — DNA mais rico, embeddings de coerência, regeneração de Vistas, sugestões automáticas. **Sem bloqueio técnico** (lint zerado via PR #55).

### Operacionais (não-bloqueantes)

- [ ] Investigar `spawn EPERM` no build local Windows + worktrees do Claude Code (workaround atual: usar `--webpack` e caminho explícito do binário do Next).
- [ ] Reativar `/animate` e `/spaces` no menu principal quando entrarem em beta público (hoje escondidos via `badge: 'em breve'` muted + `href: null` em `components/app/Sidebar.tsx`).
- [ ] Deletar branches remotas mergeadas: `feature/spaces-mvp`, `docs/sync-update`, `fix/main-lint-errors`.
- [ ] Remover worktrees locais temporários: `spaces-mvp-docs`, `docs-sync-update`, `fix-lint-errors`, `docs-sync-after-lint-fix` (depois deste PR mergear).

### Histórico recente — concluído

- [x] **PR [#55](https://github.com/viniciuspisoni/spacenode/pull/55)** (`3e383aa`, 2026-05-11) — 4 erros de lint pré-existentes em `main` zerados de forma cirúrgica, sem mudança de comportamento de produto:
  - `BillingClient.tsx:52,58` — `window.location.href = r.url` → `window.location.assign(r.url)`.
  - `HistoryClient.tsx:99` — `eslint-disable-next-line react-hooks/set-state-in-effect` com justificativa (sincronização intencional com props do server após `router.refresh()`).
  - `VideoClient.tsx:107` — mesmo tratamento (ajuste de `selectedDuration` ao trocar de engine).

---

## 8. Roadmap próximo

1. **Agora — próxima sprint:** SPACES Engine v2 — refino do modelo de DNA, coerência semântica entre Vistas, sugestões automáticas, regeneração. Base técnica pronta.
2. **Liberação do beta SPACES:** reativar link no menu (`href: '/app/spaces'`, badge `novo`) e restaurar `page.tsx` da implementação completa quando produto autorizar.
3. **Depois:** vídeo e storytelling visual (capability já no roadmap de produto).
4. **Contínuo:** melhorias de UX na landing e no fluxo de geração (sempre incrementais, sem redesigns).

---

## 9. Responsabilidades por agente

> Cada agente tem um papel primário. Outros agentes podem opinar, mas a decisão final segue o papel definido.

### Claude Code (worktrees locais + IDE)

- **Foco:** implementação de features, refatorações, fixes pontuais, edição direta de código.
- **Forças:** edição multi-arquivo, integração com Supabase MCP, execução de build/lint/test no ambiente local, criação de PRs.
- **Quando usar:** tarefas de código que exigem ler/editar muitos arquivos, criar migrations, ajustar UI no worktree.
- **Não fazer:** decisões de produto sem alinhamento; merges em `main` sem CI verde.

### Codex (cloud code review)

- **Foco:** revisão de código, auditoria de segurança, validação de schema/RPC.
- **Forças:** análise crítica, detecção de P0/P1, segunda opinião independente.
- **Quando usar:** antes de abrir PR, após mudanças sensíveis em RPC/RLS/Stripe/credits.
- **Status atual:** **aprovou** o SPACES MVP, schema v2 e RPC `consume_credits`.

### ChatGPT (planejamento + estratégia)

- **Foco:** briefings, definição de escopo, raciocínio de produto, copy.
- **Forças:** estruturação de sprints, redação de specs, exploração de alternativas.
- **Quando usar:** início de uma feature nova; quando precisar pesar trade-offs estratégicos; redação de comunicação externa.
- **Não fazer:** assumir estado do código sem consultar este documento ou o repositório.

### Gemini (pesquisa + análise visual)

- **Foco:** pesquisa de referências visuais, análise de imagens/renders, benchmarks de UX.
- **Forças:** entendimento visual, comparativos de mercado, descrição de qualidade de imagem.
- **Quando usar:** avaliar qualidade de output de um motor, pesquisar referências de design, validar hierarquia visual de uma tela.
- **Não fazer:** alterar código diretamente; decisões técnicas de backend.

---

## 10. Como usar este documento

- **Antes de qualquer tarefa nova:** ler seções 2, 3 e 7.
- **Ao fechar uma entrega:** atualizar [CHANGELOG_AI.md](CHANGELOG_AI.md) e, se mudou estado/decisão, este arquivo.
- **Em caso de divergência entre agentes:** este documento vence. Se algo aqui estiver errado, corrigir aqui primeiro, depois agir.
