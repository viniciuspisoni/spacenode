-- 20261120140000_fuzzystrmatch_to_extensions.sql
--
-- Auditoria de segurança 2026-11-18 — advisor 0014 (extension_in_public).
--
-- ── PROBLEMA ────────────────────────────────────────────────────────────────
-- A extensão fuzzystrmatch estava no schema `public`. Tudo que mora em
-- `public` é exposto pela API REST: levenshtein, soundex, metaphone, difference
-- etc. viravam endpoints /rest/v1/rpc/… que qualquer pessoa, sem login, podia
-- chamar — superfície à toa (CPU de graça para quem quiser).
--
-- Foi instalada fora deste repositório (nenhuma migration a cria). Em produção
-- (2026-11-20) nenhum objeto depende dela — função, view, policy, índice — e o
-- app não a chama. O único uso visto foi uma consulta avulsa do papel
-- `postgres` (console) com `levenshtein(...)` sem schema.
--
-- ── SOLUÇÃO ─────────────────────────────────────────────────────────────────
-- Move a extensão para o schema `extensions`, padrão do Supabase, que o
-- PostgREST não expõe. As funções continuam iguais; o search_path do
-- `postgres` já inclui `extensions`, então consultas no console seguem
-- funcionando sem prefixo. Em código novo, qualificar:
-- extensions.levenshtein(...).
--
-- Guardado: só age se a extensão existir em `public`. Num banco montado só com
-- as migrations do repositório, ou já movido, não faz nada.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--   select extnamespace::regnamespace from pg_extension where extname = 'fuzzystrmatch';
--     -- extensions
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
--   alter extension fuzzystrmatch set schema public;

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension
     where extname = 'fuzzystrmatch' and extnamespace = 'public'::regnamespace
  ) then
    alter extension fuzzystrmatch set schema extensions;
  end if;
end;
$$;
