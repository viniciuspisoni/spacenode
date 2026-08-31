-- Finalizar v2: exportação em WebP.
-- Amplia o CHECK de finalize_exports.format para aceitar 'webp'.
-- Idempotente. NÃO aplicada automaticamente — aplicar junto do deploy do
-- Finalizar v2 (sem ela, exports webp são baixados normalmente mas a linha de
-- histórico em finalize_exports falha o insert best-effort; a versão continua
-- registrada no document do projeto).

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'finalize_exports' and constraint_name = 'finalize_exports_format_check'
  ) then
    alter table public.finalize_exports drop constraint finalize_exports_format_check;
  end if;
  alter table public.finalize_exports
    add constraint finalize_exports_format_check check (format in ('png', 'jpg', 'webp'));
end $$;
