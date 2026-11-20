# Auditoria de segurança — 18/11/2026

Escopo: leitura do código da branch `claude/spacenode-security-improvements-22c09c` (base `504ce02`) e inspeção **somente de catálogo** do banco de produção (`nucyyqmurhnakhldshwr`): privilégios, policies, triggers, funções, buckets. Nenhum dado de usuário foi lido, nenhuma escrita em produção, nenhum exploit executado contra produção. A exploração do S1 foi reproduzida num Postgres local (PGlite) com as migrations reais e os grants padrão do Supabase (`tests/security-column-lockdown.test.ts`).

Severidade: **Crítico** = perda financeira direta, explorável por qualquer conta · **Alto** = integridade de dados de cobrança/relatório · **Médio** = vazamento entre contas com pré-condição · **Baixo** = endurecimento.

## Achados

| ID | Sev. | Achado | Status |
| --- | --- | --- | --- |
| S1 | **Crítico** | `public.profiles`: `authenticated` tem UPDATE na tabela inteira; a policy `users_update_own_profile` limita só a linha; sem trigger. Qualquer usuário logado faz `PATCH /rest/v1/profiles?id=eq.<id>` com a anon key pública e o próprio JWT e grava `credits`, `plan`, `nodes_expire_at`, `stripe_customer_id`, `stripe_subscription_id`, `email`. Efeitos: saldo/plano grátis; portal de cobrança de outro customer (`/api/stripe/portal` usa o campo); oferta de lançamento repetível (`/api/stripe/checkout`); `email` é o 2º fator do `accept_workspace_invite`. A trava CR-1 (`20260703120000`) **nunca foi aplicada em produção**. | Corrigido na migration `20261118160000_lockdown_user_writable_columns.sql` — **aplicada em produção em 19/11/2026** |
| S2 | Alto | Mesma classe em `vistas` (UPDATE de `nodes_cost`, `free_fixes_used`, `review_status`, `status`…) e INSERT/UPDATE "own" em `renders`, `edits`, `image_edit_attempts`, `edit_reference_assets` — tabelas que o servidor grava só com service-role. Usuário forjava histórico e falseava custo/revisão nos relatórios da Equipe (e podia "poluir" o `workspace_id` de outro escritório). | Mesma migration |
| S3 | Médio | `/p/[slug]` (pack público) lê com service-role `space_id` e `vistas_ordered` gravados pelo dono do pack, sem filtrar pelo dono → um pack podia publicar Space/Vistas de outra conta (exige conhecer os UUIDs). | Corrigido (`app/p/[slug]/page.tsx`) |
| S4 | Médio | `/api/download` era público, seguia redirects sem revalidar, aceitava qualquer path do host Supabase, repassava o `Content-Type` do upstream e bufferizava o arquivo inteiro: proxy aberto de banda e de conteúdo servido da nossa origem. | Corrigido: sessão obrigatória, allowlist (`lib/http/download-proxy.ts`) revalidada a cada redirect, só imagem/vídeo, teto de 250 MB, streaming |
| S5 | Baixo | `/api/media` aceitava chaves com `..`/`//`; `CRON_SECRET` comparado sem tempo constante; `/api/waitlist` devolvia 500 em JSON inválido e não limitava o e-mail. | Corrigido |
| S6 | Baixo | Sem CSP. | CSP base (`object-src 'none'; base-uri 'self'; frame-ancestors 'self'`) em `next.config.ts`; sem `script-src`, então não afeta o script inline nem pixels/GIS/Stripe |
| S7 | Baixo | `marketing.tag_internal_actor_event()` (trigger SECURITY DEFINER) executável por `anon`/`authenticated` (advisor 0028/0029). | Revogado na migration |

## Migration em produção

**Aplicada em 19/11/2026** (`lockdown_user_writable_columns`), com produção rodando `main` em `504ce02`. Conferido no catálogo logo depois: `credits`, `plan`, `stripe_*`, `email`, `nodes_expire_at`, `whatsapp` sem UPDATE para `authenticated`; as quatro preferências com UPDATE; INSERT/UPDATE revogados em `renders`/`edits`/tentativas/`lumen_packs`/`workspace_members`; os avisos 0028/0029 da função de trigger saíram do advisor; nenhum erro de runtime na Vercel na hora seguinte.

Por que podia ir antes do deploy do código: o browser em produção só grava em `profiles` as colunas concedidas (`project_materials`, `project_config`, `onboarding_completed_at`, `glass_intensity`) e nenhuma rota grava `renders`/`edits`/tentativas com o client do usuário (mapeado por grep). `theme_preference` não existe em produção — a migration só concede colunas existentes. **Não aplicar** a antiga `20260703120000` (falharia no `theme_preference`; esta a substitui).

Verificação (rodar de novo se houver dúvida):

```sql
select has_column_privilege('authenticated', 'public.profiles', 'credits', 'UPDATE');        -- false
select has_column_privilege('authenticated', 'public.profiles', 'project_config', 'UPDATE'); -- true
select has_table_privilege('authenticated', 'public.renders', 'INSERT');                     -- false
```

Reversão de emergência no cabeçalho da migration.

## Recomendações (não feitas nesta branch)

1. **Checar se o S1 foi explorado** — comparar `profiles.credits` com o que o `node_ledger`/Stripe explicam e procurar `plan` pago sem `stripe_subscription_id`. Exige ler dados de produção.
2. **Leaked password protection** desligada no Supabase Auth (advisor) — ligar no painel.
3. Bucket `architect-identity` é público e aceita `image/svg+xml`: SVG com script roda no domínio `*.supabase.co` se aberto direto (sem sessão nossa lá, mas serve para phishing). Rasterizar SVG no upload ou recusá-lo; concluir o flip B2 dos buckets públicos (`space-mestres`, `architect-identity`).
   - **Corrigido em 2026-11-20** (`20261120120000_architect_identity_no_svg.sql` + `lib/spaces/logo-upload.ts`): SVG recusado (bucket e rota; a rota confere o tipo pelos bytes) e saem as policies de escrita do `authenticated` no bucket — só a rota grava. Produção tinha 3 logos, todos PNG. O bucket segue público de propósito: o logo aparece na página pública do pack. O flip B2 de `space-mestres` continua pendente.
4. `walkthrough_shares_public_read` (`using true`) deixa anônimos listarem todos os slugs de compartilhamento do Animar v2 legado — remover se o recurso não estiver em uso.
5. `is_workspace_member(p_workspace, p_user)` permite a um usuário consultar a participação de outro (exige UUIDs) — trocar `p_user` por `auth.uid()` na próxima mexida em workspaces.
6. CSP com nonce (`script-src`) — exige render dinâmico; avaliar custo de performance antes.
7. Regra para novas colunas: coluna de `profiles`/`vistas` editável pelo browser precisa de `GRANT UPDATE (coluna)` na própria migration; o teste `security-column-lockdown` falha se um client component gravar coluna sem grant.

## Conferido e sem achado

Assinatura do webhook Stripe; `next` dos fluxos de login (`internalNextPath`); nonce + CSRF do Google GIS; pareamento SketchUp (hash de código/segredo, refresh token em custódia, claim atômico); rotas `/api/internal/*` com comparação em tempo constante; allowlist SSRF em `fetchStorageBytes`; rotas pagas debitam antes do provedor e estornam lendo valores calculados no servidor; autorização do `/api/history/detail`; policies do bucket `spacenode-media` por pasta do usuário; funções SECURITY DEFINER fechadas (só as duas do advisor expostas); views com `security_invoker=on`; rotas de Editar v2 sem débito estão desligadas em produção (`EDIT_V2_ENABLED` ausente); nenhum segredo no histórico do git.
