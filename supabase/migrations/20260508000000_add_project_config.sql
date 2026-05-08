-- Persist last-used render config per profile.
-- Mirrors project_materials: client auto-saves on field change (debounce 1.5s),
-- the /app/generate page hydrates initial state from this column on load.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS project_config JSONB DEFAULT NULL;
