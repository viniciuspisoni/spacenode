-- Editar Google-first (2026-06-10): intenções novas + telemetria do quality
-- gate ampliado/retry automático.
--
-- ATENÇÃO: o código é RESILIENTE a esta migration ainda não aplicada
-- (insert/update tentam a forma completa e caem na legada), então pode ser
-- aplicada a qualquer momento. Sem ela: tentativas com tool style/variation não
-- geram linha de telemetria e as colunas novas não são gravadas.

-- 1) Ferramentas novas (ajustar estilo / variação controlada).
alter table public.image_edit_attempts
  drop constraint if exists image_edit_attempts_tool_check;

alter table public.image_edit_attempts
  add constraint image_edit_attempts_tool_check
  check (tool in (
    'remove','material','replace','add','fix_detail','lighting','landscaping',
    'style','variation'
  ));

-- 2) Status novo: rejeição por "sem alteração perceptível" (no-op) — distinto
--    do drift fora da máscara (rejected_quality_gate).
alter table public.image_edit_attempts
  drop constraint if exists image_edit_attempts_status_check;

alter table public.image_edit_attempts
  add constraint image_edit_attempts_status_check
  check (status in (
    'pending','processing','completed','failed','refunded',
    'rejected_quality_gate','rejected_no_change'
  ));

-- 3) Telemetria Google-first.
alter table public.image_edit_attempts
  add column if not exists edit_intent       text,
  add column if not exists quality_mode      text
    check (quality_mode is null or quality_mode in ('quick','premium')),
  add column if not exists auto_retry_count  smallint not null default 0,
  add column if not exists gate_reason       text,
  add column if not exists in_mask_delta     numeric,
  add column if not exists out_of_mask_delta numeric;

comment on column public.image_edit_attempts.edit_intent       is 'Intenção escolhida na UI (remove_object, swap_material, …) — telemetria.';
comment on column public.image_edit_attempts.quality_mode      is 'quick (Edição rápida) | premium (Edição premium, opt-in).';
comment on column public.image_edit_attempts.auto_retry_count  is 'Retries automáticos do quality gate (grátis) executados.';
comment on column public.image_edit_attempts.gate_reason       is 'Motivo da última reprovação do gate (out_of_mask_drift / no_change / semantic…).';
comment on column public.image_edit_attempts.in_mask_delta     is 'Fração de pixels DENTRO da máscara que mudaram (detecção de no-op).';
comment on column public.image_edit_attempts.out_of_mask_delta is 'Fração de pixels FORA da máscara que mudaram (drift).';
