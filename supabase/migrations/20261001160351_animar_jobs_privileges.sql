-- A web acessa os jobs somente pelas rotas server-side autenticadas.
-- Projetos antigos da Supabase concedem CRUD padrão em tabelas public;
-- RLS protege as linhas, mas não precisamos expor este recurso ao browser.
revoke all on table public.video_jobs from anon, authenticated;
grant select, insert, update on table public.video_jobs to service_role;
