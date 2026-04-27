-- SpaceNode: adiciona coluna de materiais do projeto no perfil do usuário
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS project_materials JSONB DEFAULT '{}';

-- Índice para busca futura
CREATE INDEX IF NOT EXISTS profiles_materials_idx ON profiles USING gin(project_materials);
