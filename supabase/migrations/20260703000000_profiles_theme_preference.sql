-- Preferência de tema da interface (dark é a experiência padrão do produto).
-- 'system' segue prefers-color-scheme do dispositivo.
alter table public.profiles
  add column if not exists theme_preference text not null default 'system'
  check (theme_preference in ('system', 'light', 'dark'));

comment on column public.profiles.theme_preference is
  'Preferência de tema da UI: system | light | dark. Fonte de verdade cross-device; localStorage responde primeiro no cliente.';
