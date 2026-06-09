-- Quality gate da edição: novo status para tentativas rejeitadas por drift
-- fora da máscara (> limite). Não é 'failed' (erro técnico) nem 'completed'.

alter table public.image_edit_attempts
  drop constraint if exists image_edit_attempts_status_check;

alter table public.image_edit_attempts
  add constraint image_edit_attempts_status_check
  check (status in ('pending','processing','completed','failed','refunded','rejected_quality_gate'));
