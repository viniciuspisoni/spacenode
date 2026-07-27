-- Fluxo guiado de primeiro render (/app/comecar).
--
-- Por que uma coluna nova em vez de reaproveitar onboarding_completed_at:
-- aquela marca a conclusão do TOUR (driver.js), que não é ativação — 98% dos
-- cadastros a preenchem e 45% deles nunca criaram nem um projeto. Herdar esse
-- flag deixaria justamente o público-alvo (quem "viu o tour" e nunca gerou
-- nada) fora do fluxo novo.
--
-- NULL      = ainda elegível ao fluxo guiado.
-- Preenchida = gerou a primeira imagem pelo fluxo OU dispensou explicitamente.

alter table public.profiles
  add column if not exists first_run_done_at timestamptz;

comment on column public.profiles.first_run_done_at is
  'Fluxo guiado de primeiro render (/app/comecar): concluído ou dispensado. NULL = ainda elegível.';

-- Backfill: quem já gerou alguma imagem não é público-alvo do fluxo e não deve
-- ser redirecionado pra ele ao abrir o /app.
update public.profiles p
   set first_run_done_at = now()
 where p.first_run_done_at is null
   and exists (select 1 from public.renders r where r.user_id = p.id);
