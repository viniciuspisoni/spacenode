-- ── Histórico como arquivo técnico do projeto ─────────────────────────────────
--
-- Metadados de geração para o painel "Detalhes da geração" do Histórico.
-- 100% aditiva e retrocompatível: colunas nullable (ou com default), nenhuma
-- linha existente é tocada e nenhum fluxo de geração depende delas — o código
-- de escrita usa insert resiliente (tenta com as colunas novas; se ainda não
-- existirem, regrava sem elas). Gerações antigas exibem "Não registrado".
--
-- renders concentra Renderizar + Ampliar + Animar; edits = Editar; vistas = Spaces.

alter table public.renders
  add column if not exists user_prompt    text,
  add column if not exists duration_ms    integer,
  add column if not exists retry_count    integer not null default 0,
  add column if not exists generation_log jsonb;

alter table public.edits
  add column if not exists duration_ms    integer,
  add column if not exists retry_count    integer not null default 0,
  add column if not exists generation_log jsonb;

alter table public.vistas
  add column if not exists duration_ms    integer,
  add column if not exists retry_count    integer not null default 0,
  add column if not exists generation_log jsonb;

comment on column public.renders.user_prompt    is 'Texto livre digitado pelo usuário (refinamento), distinto do prompt final enviado à IA (coluna prompt).';
comment on column public.renders.duration_ms    is 'Tempo total da geração no provider, em milissegundos.';
comment on column public.renders.retry_count    is 'Número de retentativas automáticas antes do resultado final.';
comment on column public.renders.generation_log is 'Log técnico da geração: provider, endpoint, request_id, parâmetros enviados e marcos de tempo.';
comment on column public.edits.duration_ms      is 'Tempo total da edição no provider, em milissegundos.';
comment on column public.edits.generation_log   is 'Log técnico da edição: provider, endpoint, request_id, parâmetros enviados.';
comment on column public.vistas.duration_ms     is 'Tempo total da geração da vista no provider, em milissegundos.';
comment on column public.vistas.generation_log  is 'Log técnico da vista: provider, endpoint, request_id, parâmetros enviados.';
