-- O banco de produção já tinha a tabela referrals com code obrigatório.
-- Ambientes que receberam a primeira versão desta migration ganham a coluna.
alter table public.referrals add column if not exists code text;
update public.referrals set code = referrer_user_id::text where code is null;
alter table public.referrals alter column code set not null;
