-- ════════════════════════════════════════════════════════════════════════════
-- Sistema editorial de conteúdo (marketing) — fundação.
--
-- Schema SEPARADO `marketing`: banco editorial (ideias → briefings → versões →
-- aprovações → publicações) + regras da marca estruturadas + templates + log de
-- automações. Docs em docs/marketing/; serviços em lib/marketing/; painel em
-- /admin/marketing (staff only via lib/auth/privileged.ts).
--
-- MODELO DE ACESSO (deny-by-default):
--   • Nenhum acesso client-side. anon/authenticated NÃO recebem USAGE no schema
--     e nenhuma policy permissiva existe — RLS ligada em todas as tabelas serve
--     de segunda tranca caso um GRANT acidental apareça no futuro.
--   • Todo acesso passa pelo servidor com service_role (createAdminClient),
--     atrás do gate isInternalStaff. Service role NUNCA no navegador.
--   • FKs para dados de produto são POLIMÓRFICAS (uuid sem FK, padrão
--     finalize_projects.source_space_id): o banco editorial não pode travar
--     deletes das tabelas de produção nem criar acoplamento de migration.
--
-- DEPLOY (fora deste sprint — NÃO aplicar em produção agora):
--   1. Aplicar esta migration + a seed no ambiente apropriado.
--   2. Adicionar `marketing` em API → Exposed schemas no dashboard do Supabase
--      (PostgREST só serve schemas expostos; sem isso o .schema('marketing')
--      do supabase-js retorna 406). A exposição é segura: sem USAGE/policy,
--      anon/authenticated continuam sem acesso.
--
-- Convenções espelhadas de create_finalize_tables / edit_router_v1: uuid PK,
-- timestamptz default now(), trigger própria de updated_at (zero blast radius),
-- idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS). NÃO é aplicado
-- por db push.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists marketing;

-- ── Privilégios: só service_role enxerga o schema ──────────────────────────────
revoke all on schema marketing from public;
grant usage on schema marketing to service_role;
alter default privileges in schema marketing
  grant all on tables to service_role;
alter default privileges in schema marketing
  grant all on sequences to service_role;

-- ── Trigger function dedicada de updated_at ────────────────────────────────────
create or replace function marketing.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- content_ideas — biblioteca de ideias/pautas
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_ideas (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  description     text,
  pillar          text,                    -- slug de docs/marketing/content-pillars.md
  objective       text,
  target_audience text,
  source          text,                    -- de onde veio a pauta (feature, pergunta de usuário…)
  priority        text        not null default 'normal'
                              check (priority in ('low', 'normal', 'high', 'urgent')),
  status          text        not null default 'open'
                              check (status in ('open', 'in_briefing', 'converted', 'archived')),
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table marketing.content_ideas is
  'Pautas registradas antes de virarem briefing. status: open → in_briefing → converted | archived.';

create index if not exists idx_mkt_ideas_status
  on marketing.content_ideas(status, priority, created_at desc);
create index if not exists idx_mkt_ideas_pillar
  on marketing.content_ideas(pillar);

drop trigger if exists trg_mkt_ideas_updated_at on marketing.content_ideas;
create trigger trg_mkt_ideas_updated_at
  before update on marketing.content_ideas
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- content_briefs — briefings (unidade central do fluxo editorial)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_briefs (
  id              uuid        primary key default gen_random_uuid(),
  idea_id         uuid        references marketing.content_ideas(id) on delete set null,
  title           text        not null,
  hook            text,                    -- gancho (1ª linha da legenda, ≤125 chars)
  central_message text,
  format          text,                    -- slug de docs/marketing/content-formats.md
  platform        text,                    -- instagram | meta_ads | youtube | site | other
  target_audience text,
  pillar          text,                    -- denormalizado da ideia (briefing pode nascer sem ideia)
  script          text,                    -- roteiro (Reels/vídeo) ou slides (carrossel)
  caption         text,                    -- legenda completa
  call_to_action  text,
  visual_direction text,
  required_assets jsonb       not null default '[]'::jsonb,  -- ["print do modelo", "render final", …]
  brand_check     jsonb,                   -- último resultado do verificador de marca
  status          text        not null default 'brief_draft'
                              check (status in (
                                'brief_draft', 'awaiting_review', 'changes_requested',
                                'approved', 'rejected', 'ready_for_production',
                                'asset_production', 'final_review', 'ready_to_schedule',
                                'scheduled', 'published', 'analyzed'
                              )),
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table marketing.content_briefs is
  'Briefing editorial. Fluxo de status em docs/marketing/content-workflow.md; transições válidas '
  'são responsabilidade de lib/marketing/workflow.ts (o CHECK só valida pertencimento).';

create index if not exists idx_mkt_briefs_status
  on marketing.content_briefs(status, updated_at desc);
create index if not exists idx_mkt_briefs_idea
  on marketing.content_briefs(idea_id);
create index if not exists idx_mkt_briefs_pillar
  on marketing.content_briefs(pillar);

drop trigger if exists trg_mkt_briefs_updated_at on marketing.content_briefs;
create trigger trg_mkt_briefs_updated_at
  before update on marketing.content_briefs
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- content_assets — arquivos vinculados a um briefing
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_assets (
  id                uuid        primary key default gen_random_uuid(),
  brief_id          uuid        references marketing.content_briefs(id) on delete cascade,
  project_id        uuid,                  -- projeto de produto de origem (polimórfico, SEM FK)
  generation_id     uuid,                  -- render/vista/edit de origem (polimórfico, SEM FK)
  asset_type        text        not null default 'image'
                                check (asset_type in
                                  ('image', 'video', 'logo', 'brand_file', 'cover', 'reference', 'other')),
  storage_path      text,                  -- key no bucket marketing-assets (uploads) — NULL p/ vínculo puro
  source_type       text        not null
                                check (source_type in
                                  ('upload', 'render', 'vista', 'edit', 'external', 'brand')),
  original_filename text,
  mime_type         text,
  width             integer,
  height            integer,
  duration          numeric,               -- segundos (vídeo)
  metadata          jsonb       not null default '{}'::jsonb,  -- url de origem, crédito, job externo…
  status            text        not null default 'active'
                                check (status in ('active', 'archived')),
  created_at        timestamptz not null default now()
);

comment on table marketing.content_assets is
  'Assets de uma peça: upload próprio (storage_path no bucket marketing-assets) ou vínculo a '
  'geração real do produto (generation_id + source_type render/vista/edit, exibida via signed URL).';

create index if not exists idx_mkt_assets_brief
  on marketing.content_assets(brief_id, created_at desc);
create index if not exists idx_mkt_assets_generation
  on marketing.content_assets(generation_id);

-- ════════════════════════════════════════════════════════════════════════════
-- content_projects — vínculo peça ↔ projeto/gerações do produto + permissão
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_projects (
  id                uuid        primary key default gen_random_uuid(),
  brief_id          uuid        not null references marketing.content_briefs(id) on delete cascade,
  project_id        uuid,                  -- space/pasta/projeto de origem (polimórfico, SEM FK)
  generation_ids    uuid[]      not null default '{}',
  permission_status text        not null default 'pending'
                                check (permission_status in
                                  ('pending', 'requested', 'granted', 'denied', 'not_required')),
  notes             text,                  -- quem autorizou, quando, crédito acordado
  created_at        timestamptz not null default now()
);

comment on table marketing.content_projects is
  'Relação de um briefing com projetos/gerações reais de usuários. permission_status = granted é '
  'pré-requisito de produção quando o material é de cliente (docs/marketing/prohibited-content.md §6).';

create index if not exists idx_mkt_projects_brief
  on marketing.content_projects(brief_id);

-- ════════════════════════════════════════════════════════════════════════════
-- content_versions — histórico imutável de versões de um briefing
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_versions (
  id               uuid        primary key default gen_random_uuid(),
  brief_id         uuid        not null references marketing.content_briefs(id) on delete cascade,
  version_number   integer     not null,
  title            text,
  script           text,
  caption          text,
  visual_direction text,
  change_summary   text,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (brief_id, version_number)
);

comment on table marketing.content_versions is
  'Snapshot dos campos editoriais a cada iteração relevante. Append-only — versões não são editadas.';

create index if not exists idx_mkt_versions_brief
  on marketing.content_versions(brief_id, version_number desc);

-- ════════════════════════════════════════════════════════════════════════════
-- content_approvals — decisões de revisão humana
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_approvals (
  id           uuid        primary key default gen_random_uuid(),
  brief_id     uuid        not null references marketing.content_briefs(id) on delete cascade,
  version_id   uuid        references marketing.content_versions(id) on delete set null,
  status       text        not null
                           check (status in
                             ('draft', 'awaiting_review', 'changes_requested', 'approved', 'rejected')),
  reviewer_id  uuid        references auth.users(id) on delete set null,
  review_notes text,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table marketing.content_approvals is
  'Trilha de aprovação: cada solicitação/decisão gera uma linha. A decisão final é sempre humana — '
  'o verificador automático de marca não escreve aqui.';

create index if not exists idx_mkt_approvals_brief
  on marketing.content_approvals(brief_id, created_at desc);
create index if not exists idx_mkt_approvals_status
  on marketing.content_approvals(status);

-- ════════════════════════════════════════════════════════════════════════════
-- content_publications — estrutura p/ integrações futuras (NADA publica hoje)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_publications (
  id               uuid        primary key default gen_random_uuid(),
  brief_id         uuid        not null references marketing.content_briefs(id) on delete cascade,
  platform         text        not null,   -- instagram | meta_ads | google_ads | youtube | other
  external_post_id text,
  scheduled_at     timestamptz,
  published_at     timestamptz,
  status           text        not null default 'planned'
                               check (status in
                                 ('planned', 'scheduled', 'publishing', 'published', 'failed', 'canceled')),
  publication_url  text,
  metrics          jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

comment on table marketing.content_publications is
  'Preparação para agendamento/publicação via integrações futuras (docs/marketing/integration-roadmap.md). '
  'Neste sprint nenhuma automação escreve aqui além de planejamento manual.';

create index if not exists idx_mkt_publications_brief
  on marketing.content_publications(brief_id);
create index if not exists idx_mkt_publications_schedule
  on marketing.content_publications(status, scheduled_at);

-- ════════════════════════════════════════════════════════════════════════════
-- content_templates — templates conceituais de arte (Canva futuro)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.content_templates (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null unique,
  format               text        not null,  -- slug de content-formats.md
  platform             text        not null default 'instagram',
  description          text,
  template_provider    text        not null default 'conceptual'
                                   check (template_provider in ('conceptual', 'html', 'canva')),
  external_template_id text,                 -- id no provider externo (Canva) — futuro
  aspect_ratio         text,                 -- '1:1' | '4:5' | '9:16'
  visual_rules         jsonb       not null default '{}'::jsonb,  -- campos dinâmicos + regras de uso
  status               text        not null default 'active'
                                   check (status in ('draft', 'active', 'archived')),
  created_at           timestamptz not null default now()
);

comment on table marketing.content_templates is
  'Templates conceituais (estrutura, proporção, campos dinâmicos, regras). provider=html aponta '
  'para content-factory/templates/; canva ganha external_template_id quando a integração existir.';

-- ════════════════════════════════════════════════════════════════════════════
-- brand_rules — regras da marca estruturadas (lidas por máquina)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.brand_rules (
  id          uuid        primary key default gen_random_uuid(),
  key         text        not null unique,  -- ex.: prohibited_lexicon, approved_ctas, copy_limits
  value       jsonb       not null,
  description text,
  version     integer     not null default 1,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table marketing.brand_rules is
  'Versão estruturada do manual (content-factory/brand-rules.md §7 expandido). Consumida pelo '
  'verificador de marca e pela geração assistida. Mudou o manual → atualizar a chave equivalente.';

drop trigger if exists trg_mkt_brand_rules_updated_at on marketing.brand_rules;
create trigger trg_mkt_brand_rules_updated_at
  before update on marketing.brand_rules
  for each row execute function marketing.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- automation_runs — log de execuções de IA/automação
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists marketing.automation_runs (
  id          uuid        primary key default gen_random_uuid(),
  run_type    text        not null,   -- generate_brief | brand_check | similar_scan | …
  status      text        not null default 'running'
                          check (status in ('running', 'succeeded', 'failed')),
  provider    text,                   -- gemini | vertex | n8n | …
  model       text,                   -- ex.: gemini-2.5-flash
  brief_id    uuid        references marketing.content_briefs(id) on delete set null,
  idea_id     uuid        references marketing.content_ideas(id)  on delete set null,
  input       jsonb,                  -- parâmetros da execução (sem segredo, sem prompt interno completo)
  output      jsonb,                  -- resultado estruturado
  error       text,
  duration_ms integer,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table marketing.automation_runs is
  'Toda execução de geração/validação automática registra modelo, data, entrada e saída — '
  'rastreabilidade exigida pela Etapa 6 do sprint e base para as integrações futuras (n8n).';

create index if not exists idx_mkt_runs_type
  on marketing.automation_runs(run_type, created_at desc);
create index if not exists idx_mkt_runs_brief
  on marketing.automation_runs(brief_id);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — ligada em tudo, SEM policies permissivas (deny-all p/ anon/authenticated;
-- service_role bypassa RLS). Segunda tranca além da ausência de USAGE no schema.
-- ════════════════════════════════════════════════════════════════════════════
alter table marketing.content_ideas        enable row level security;
alter table marketing.content_briefs       enable row level security;
alter table marketing.content_assets       enable row level security;
alter table marketing.content_projects     enable row level security;
alter table marketing.content_versions     enable row level security;
alter table marketing.content_approvals    enable row level security;
alter table marketing.content_publications enable row level security;
alter table marketing.content_templates    enable row level security;
alter table marketing.brand_rules          enable row level security;
alter table marketing.automation_runs      enable row level security;

-- Garantia extra (idempotente) de que as tabelas já criadas ficam acessíveis
-- ao service_role mesmo se os default privileges mudarem no futuro.
grant all on all tables    in schema marketing to service_role;
grant all on all sequences in schema marketing to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Bucket privado de assets de marketing (logos, arquivos de marca, capas,
-- referências, artes exportadas). Leitura/escrita só via service_role (signed
-- URLs emitidas pelo servidor) — nenhuma policy de storage para authenticated.
-- 25 MB por arquivo; MIMEs de imagem/vídeo/pdf.
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-assets',
  'marketing-assets',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
)
on conflict (id) do nothing;
