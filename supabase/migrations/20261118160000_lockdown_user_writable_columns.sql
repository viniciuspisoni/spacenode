-- 20261118160000_lockdown_user_writable_columns.sql
--
-- Auditoria de segurança 2026-11-18 — achado CRÍTICO S1
-- (docs/audits/2026-11-18/seguranca.md).
--
-- ── PROBLEMA (verificado no catálogo de PRODUÇÃO em 2026-11-18) ──────────────
-- A trava de coluna do CR-1 (20260703120000_rls_column_lockdown_profiles_vistas)
-- NUNCA foi aplicada em produção. Hoje o papel `authenticated` tem UPDATE na
-- tabela public.profiles inteira e a policy `users_update_own_profile` restringe
-- só a LINHA (auth.uid() = id). Sem trigger de proteção. Resultado: qualquer
-- usuário logado, com a anon key pública + o próprio JWT, faz
--
--   PATCH /rest/v1/profiles?id=eq.<seu-id>
--   { "credits": 999999, "plan": "studio", "nodes_expire_at": null }
--
-- e se auto-concede saldo e plano. Pior: `stripe_customer_id` também é gravável
-- — /api/stripe/portal abre o portal de cobrança do customer gravado ali, e o
-- /api/stripe/checkout usa o mesmo campo para decidir a elegibilidade da oferta
-- de lançamento. E `email` é o segundo fator do accept_workspace_invite.
--
-- O mesmo vale para public.vistas (nodes_cost, free_fixes_used, review_status…)
-- e, por policies de INSERT/UPDATE "own", para renders/edits/
-- image_edit_attempts/edit_reference_assets — tabelas que o servidor grava
-- SEMPRE com service_role; o browser não escreve nelas (mapeado por grep em
-- 2026-11-18). Um usuário conseguia forjar linhas de histórico e falsear
-- nodes_cost/review_status que alimentam os relatórios da Equipe.
--
-- ── SOLUÇÃO ─────────────────────────────────────────────────────────────────
-- 1. profiles/vistas: REVOKE do UPDATE de tabela + GRANT só das colunas que o
--    cliente edita legitimamente. O REVOKE de tabela também remove grants de
--    coluna anteriores (doc do Postgres), então o GRANT vem depois.
--    Colunas concedidas SÓ se existirem (theme_preference, p.ex., não existe em
--    produção) — um GRANT em coluna inexistente derrubaria a migration.
-- 2. renders/edits/image_edit_attempts/edit_reference_assets: REVOKE de
--    INSERT/UPDATE para anon/authenticated (SELECT/DELETE seguem como estão).
-- 3. Defesa em profundidade: tabelas de saldo/autorização que já NÃO têm policy
--    de escrita (RLS nega hoje) perdem também o privilégio — assim uma policy
--    permissiva criada por engano no futuro não reabre a porta. Funcionalmente
--    é no-op: a RLS já bloqueava.
-- 4. marketing.tag_internal_actor_event(): função de TRIGGER SECURITY DEFINER
--    exposta a anon/authenticated (advisor 0028/0029). Trigger não precisa de
--    EXECUTE do papel que dispara o evento.
--
-- service_role ignora grants de coluna/RLS — webhook Stripe, RPCs de saldo e
-- todas as rotas de API seguem funcionando.
--
-- ── COLUNAS QUE O CLIENTE EDITA (grep em 2026-11-18) ────────────────────────
--   profiles → project_materials, project_config   (app/app/generate/GenerateClient.tsx)
--              onboarding_completed_at              (components/app/WelcomeTour.tsx)
--              glass_intensity                      (lib/theme/GlassIntensityProvider.tsx)
--              theme_preference                     (lib/theme/ThemeProvider.tsx — coluna
--                                                    só existe se 20260703000000 rodou)
--   vistas   → is_favorited                         (api/vistas/[vistaId]/favorite)
--              dna_verified, dna_verification_details (api/vistas/[vistaId]/verify-dna)
--              dna, dna_extracted_at, dna_extracting  (api/vistas/[vistaId]/extract-dna)
--   Nova coluna editável pelo browser ⇒ GRANT UPDATE (coluna) na migration dela.
--   tests/security-column-lockdown.test.ts trava esta lista contra o código.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--   select has_column_privilege('authenticated', 'public.profiles', 'credits', 'UPDATE');        -- false
--   select has_column_privilege('authenticated', 'public.profiles', 'project_config', 'UPDATE'); -- true
--   select has_table_privilege('authenticated', 'public.renders', 'INSERT');                     -- false
--
-- ── REVERSÃO (só em emergência — reabre o S1) ───────────────────────────────
--   grant update on public.profiles, public.vistas to authenticated;
--   grant insert, update on public.renders, public.edits,
--     public.image_edit_attempts, public.edit_reference_assets to authenticated;

-- Concede UPDATE das colunas listadas que existirem na tabela.
create or replace function pg_temp.grant_existing_update_columns(
  p_table   text,
  p_columns text[]
) returns void
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array p_columns loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_table and column_name = col
    ) then
      execute format('grant update (%I) on public.%I to authenticated', col, p_table);
    end if;
  end loop;
end;
$$;

-- ── 1. profiles ─────────────────────────────────────────────────────────────
revoke update on public.profiles from anon, authenticated;
-- Sem policy de INSERT/DELETE: a RLS já negava. O cadastro roda no trigger
-- SECURITY DEFINER e a exclusão de conta pelo service_role.
revoke insert, delete on public.profiles from anon, authenticated;
select pg_temp.grant_existing_update_columns('profiles', array[
  'project_materials',
  'project_config',
  'onboarding_completed_at',
  'glass_intensity',
  'theme_preference'
]);

-- ── 1b. vistas ──────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.vistas') is not null then
    revoke update on public.vistas from anon, authenticated;
    perform pg_temp.grant_existing_update_columns('vistas', array[
      'is_favorited',
      'dna_verified',
      'dna_verification_details',
      'dna',
      'dna_extracted_at',
      'dna_extracting'
    ]);
  end if;
end;
$$;

-- ── 2. Tabelas de geração: só o servidor escreve ────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['renders', 'edits', 'image_edit_attempts', 'edit_reference_assets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update on public.%I from anon, authenticated', t);
    end if;
  end loop;
end;
$$;

-- ── 3. Saldo/autorização: sem escrita pelo PostgREST (defesa em profundidade) ─
do $$
declare
  t text;
begin
  foreach t in array array[
    'lumen_packs',
    'user_monthly_usage',
    'node_ledger',
    'workspaces',
    'workspace_members',
    'workspace_invites',
    'referrals',
    'referral_codes',
    'referral_events',
    'referral_invites',
    'referral_payment_fingerprints',
    'referral_reward_applications',
    'referral_rewards',
    'stripe_webhook_events',
    'blocos3d_jobs',
    'edit_v3_jobs',
    'video_jobs',
    'rate_limits',
    'waitlist',
    'migration_audits',
    'pre_pricing_v2_balance_snapshot'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end if;
  end loop;
end;
$$;

-- ── 4. Função de trigger exposta via RPC ────────────────────────────────────
do $$
begin
  if to_regprocedure('marketing.tag_internal_actor_event()') is not null then
    revoke execute on function marketing.tag_internal_actor_event() from public, anon, authenticated;
  end if;
end;
$$;
