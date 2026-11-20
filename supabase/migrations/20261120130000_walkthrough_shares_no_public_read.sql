-- 20261120130000_walkthrough_shares_no_public_read.sql
--
-- Auditoria de segurança 2026-11-18, recomendação 4
-- (docs/audits/2026-11-18/seguranca.md).
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- public.walkthrough_shares (compartilhamento do Animar v2 legado) tinha a
-- policy `walkthrough_shares_public_read` FOR SELECT USING (true), para todos
-- os papéis. Qualquer pessoa, sem login, listava pela API REST todos os slugs,
-- walkthrough_id e contagem de views — não só o link que recebeu.
--
-- A tabela foi criada fora deste repositório (não há migration que a crie) e
-- nenhum código do app a lê ou grava (grep 2026-11-20). Em produção
-- (2026-11-20) walkthrough_shares, walkthroughs e shots estavam vazias.
--
-- ── SOLUÇÃO ─────────────────────────────────────────────────────────────────
--   • sai a leitura pública; fica só `walkthrough_shares_owner` (o dono do
--     walkthrough lê e gerencia os próprios compartilhamentos);
--   • `anon` perde os privilégios na tabela — não há mais caminho anônimo.
-- Se o compartilhamento público voltar, a página deve buscar UM slug pelo
-- servidor (service_role) ou por função que receba o slug — nunca liberar
-- SELECT em toda a tabela.
--
-- Guardado por to_regclass: num banco montado só com as migrations do
-- repositório a tabela não existe, e a migration não faz nada.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--   select polname from pg_policy where polrelid = 'public.walkthrough_shares'::regclass;
--     -- só walkthrough_shares_owner
--   select privilege_type from information_schema.role_table_grants
--    where table_name = 'walkthrough_shares' and grantee = 'anon';  -- nenhum
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
--   grant all on public.walkthrough_shares to anon;
--   create policy walkthrough_shares_public_read on public.walkthrough_shares
--     for select using (true);

do $$
begin
  if to_regclass('public.walkthrough_shares') is not null then
    drop policy if exists walkthrough_shares_public_read on public.walkthrough_shares;
    revoke all on public.walkthrough_shares from anon;
  end if;
end;
$$;
