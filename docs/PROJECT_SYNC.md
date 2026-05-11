# SPACENODE — Project Sync

> Fonte única de verdade para alinhamento entre agentes (Claude Code, Codex, ChatGPT, Gemini).
> Toda decisão, estado e pendência do projeto deve partir daqui.
>
> **Última atualização:** 2026-05-11
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
| Animate (animação de imagem) | Desativado temporariamente (até beta) |
| SPACES MVP | **Implementado em `feature/spaces-mvp`, aguardando CI + merge.** Pode permanecer oculto no menu de produção até o beta. |
| SPACES Engine v2 | Próxima sprint (após merge do MVP) |

### Branch ativa

- **`feature/spaces-mvp`** — publicada em `origin`, HEAD em `0158581`.
- **PR:** a abrir contra `main`.
- **Code review (Codex):** aprovado — código, schema SPACES e RPC `consume_credits` revisados.
- **Pendência operacional:** validar build em CI/Vercel. Build local está falhando intermitentemente com `spawn EPERM` (issue do ambiente Windows + worktrees do Claude Code, não regressão de código).

---

## 3. Features existentes (em produção em `main`)

- **Autenticação:** email/senha + Google OAuth via Supabase, signup na mesma página.
- **Geração de imagem (`/app/generate`):** upload drag-and-drop, seletores Ambiente/Estilo/Iluminação, slider Geometry Lock (0–100%), seletor de motor (Vega/Pulsar/Quasar + outros), comparador antes/depois, download.
- **Upscale (`/app/upscale`):** recomendação dinâmica de modelo a partir de heurísticas de arquivo, banner contextual, tags de modelo.
- **Histórico (`/app/history`):** galeria de renders, labels amigáveis dos modelos, double-click para seleção.
- **Planos (`/app/plans`):** integração Stripe (checkout + webhook), compra de Lumens restrita a Pro+.
- **Landing:** versão minimal, sem SocialProof, foco em conversão.

---

## 4. SPACES MVP — detalhes da entrega

> Branch `feature/spaces-mvp`, commit anchor `5a08034` (`feat(spaces): add SPACES MVP — Dias 1–7 completos`), com refinamentos posteriores até `0158581`.

### Visibilidade em produção

O código do SPACES MVP está **implementado e validado** em `feature/spaces-mvp`. Após o merge em `main`, a feature **pode permanecer oculta no menu principal de produção** (via flag de visibilidade, mesmo padrão usado hoje para `/animate`) até a liberação do beta. A presença do código não bloqueia nem altera fluxos existentes — Spaces fica acessível apenas para uso interno e testes até a abertura oficial.

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

### Segurança aplicada (commits `e8fb699` + `d71b541` + `0158581`)

- P0 créditos: `consume_credits` chamada **antes** do FAL para evitar geração sem débito.
- P0 segurança: RPC `consume_credits` blindado.
  - Guard de `amount` (rejeita NULL, 0 e negativos).
  - Guard `auth.uid()` (rejeita JWT ausente ou divergente de `user_id_input`).
  - `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated`.
  - Em `evolve/route.ts`, troca de `admin.rpc` para `supabase.rpc` para que `auth.uid()` resolva.
- Upload de imagem padronizado em **10 MB** via constante única.

### Commits da entrega (em ordem cronológica)

| Commit | Descrição |
|---|---|
| `5a08034` | `feat(spaces): add SPACES MVP — Dias 1–7 completos` |
| `e8fb699` | `fix(spaces/evolve): corrigir P0 segurança + P0 créditos antes do FAL` |
| `d71b541` | `fix(spaces/upload): padronizar limite de 10 MB em constante única` |
| `0070f65` | `chore(release-checks): lint, font, ESLint ignore, consume_credits migration` |
| `0158581` | `fix(rpc): harden consume_credits — amount guard + auth.uid() + REVOKE/GRANT` |

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

Ambas estão **em `feature/spaces-mvp`** e foram **aplicadas em produção em 2026-05-03** (idempotentes — `IF NOT EXISTS` / `CREATE OR REPLACE`). Os arquivos estão commitados para versionamento e provisionamento de novos ambientes; **não rodar `supabase db push`** contra produção.

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

### Validação pendente

- **Staging:** confirmar que as duas migrations rodam limpas e que `spaces_with_counts` é criada corretamente.
- **Produção:** já aplicado em 2026-05-03 (sem rollback necessário até agora).

---

## 6. Decisões técnicas relevantes

- **Next.js 16.2.4** com App Router + Turbopack, React 19, TypeScript estrito.
- **Não é o Next.js padrão:** ver `AGENTS.md` — sempre consultar `node_modules/next/dist/docs/` antes de assumir API.
- **Build em worktree:** Turbopack falha; usar `node "C:\Users\Pisoni\spacenode\node_modules\next\dist\bin\next" build --webpack`.
- **IA de imagem:** `@fal-ai/client` v1.9.5.
- **Cliente Supabase:** três variantes — `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (SSR), `lib/supabase/admin.ts` (service role, apenas server-side).
- **RPC sensível chamada com JWT do usuário:** sempre via `supabase.rpc`, nunca `admin.rpc`, para que `auth.uid()` resolva.
- **Stripe:** Lumens (compra avulsa) restritos a planos Pro+.

---

## 7. Pendências

### Bloqueantes do merge

- [ ] **Abrir PR** `feature/spaces-mvp` → `main`.
- [ ] **CI verde** (lint + tsc + build) em GitHub Actions.
- [ ] **Build limpo na Vercel** (preview deploy do PR).
- [ ] Confirmar migrations em **staging** se houver ambiente intermediário; caso contrário, validar diretamente no preview Vercel apontando para o Supabase de produção (migrations já aplicadas).

### Operacionais (não-bloqueantes)

- [ ] Investigar `spawn EPERM` no build local Windows + worktrees do Claude Code (workaround atual: usar `--webpack` e caminho explícito do binário do Next).
- [ ] Reativar `/animate` e `/spaces` no menu principal quando entrarem em beta público (hoje estão escondidos via flag — commit `0460689` em `main`).

### Pós-merge

- [ ] Iniciar **SPACES Engine v2** (DNA mais rico, embeddings de coerência, regeneração de Vistas).

---

## 8. Roadmap próximo

1. **Agora:** PR + CI + merge de `feature/spaces-mvp` em `main`.
2. **Próxima sprint:** SPACES Engine v2 — refino do modelo de DNA, coerência semântica entre Vistas, sugestões automáticas.
3. **Depois:** Vídeo e storytelling visual (capability já no roadmap de produto).
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
