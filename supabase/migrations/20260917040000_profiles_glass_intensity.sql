-- 20260917040000_profiles_glass_intensity.sql
--
-- Intensidade do Liquid Glass (0 = mais opaco, 1 = mais transparente) — mesmo
-- padrão de persistência do theme_preference (20260703000000): localStorage
-- responde primeiro no cliente, esta coluna é a fonte de verdade cross-device.
-- Ver lib/theme/GlassIntensityProvider.tsx.

alter table public.profiles
  add column if not exists glass_intensity real not null default 0.5
  check (glass_intensity >= 0 and glass_intensity <= 1);

comment on column public.profiles.glass_intensity is
  'Intensidade do material Liquid Glass (0 = mais opaco, 1 = mais transparente). Fonte de verdade cross-device; localStorage responde primeiro no cliente.';

-- Pós-lockdown CR-1 (20260703120000): UPDATE em profiles é concedido POR COLUNA.
-- O browser (papel authenticated) grava a preferência direto via PostgREST, no
-- mesmo modelo do theme_preference; a policy de linha (auth.uid() = id) segue valendo.
grant update (glass_intensity) on public.profiles to authenticated;
