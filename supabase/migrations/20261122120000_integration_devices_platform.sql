-- Dispositivos pareados passam a ser de qualquer plugin (SketchUp, Archicad,
-- Revit), não só do SketchUp.
--
-- A tabela continua `sketchup_devices` de propósito: as rotas /api/sketchup/*
-- em produção leem e gravam nela, e renomear exigiria deploy e migration no
-- mesmo instante. A coluna nova nasce com default 'sketchup', então toda linha
-- existente e todo insert das rotas antigas (que não mandam a coluna) seguem
-- corretos antes e depois do deploy.
--
-- Só as rotas /api/integrations/* leem/gravam `platform`: aplicar esta
-- migration ANTES do deploy delas.

alter table public.sketchup_devices
  add column if not exists platform text not null default 'sketchup';

alter table public.sketchup_devices
  drop constraint if exists sketchup_devices_platform_check;

alter table public.sketchup_devices
  add constraint sketchup_devices_platform_check
  check (platform in ('sketchup', 'archicad', 'revit'));
