-- Rastreabilidade do Editar: guarda o id do request da fal.ai por edição.
--
-- renders.fal_request_id e vistas.fal_request_id já existiam; a tabela edits
-- (módulo Editar standalone) não tinha a coluna. Com ela, qualquer entrada do
-- painel da fal.ai pode ser cruzada com a edição/usuário que a originou.
--
-- Aditivo e nullable — edições antigas ficam null (não é reconstituível).

ALTER TABLE public.edits
  ADD COLUMN IF NOT EXISTS fal_request_id text;

COMMENT ON COLUMN public.edits.fal_request_id IS
  'ID do request no provider (fal.ai) que gerou esta edição. null = pré-rastreabilidade ou engine sem id (ex: Vertex).';
