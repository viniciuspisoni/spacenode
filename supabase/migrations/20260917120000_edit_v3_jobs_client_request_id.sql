-- Idempotência do Editar V4 para clientes fora do browser (plugin SketchUp).
--
-- O cliente manda um client_request_id (UUID) e o REPETE em toda retentativa
-- do mesmo pedido. A rota /api/edit-v4 procura um job deste usuário com esse
-- id antes de gerar: concluído → devolve o resultado já pago; em andamento →
-- 409. O índice único (parcial) fecha a corrida de dois POSTs simultâneos: o
-- segundo insert falha com 23505 e a rota responde 409 em vez de gerar em
-- paralelo.
--
-- O código funciona SEM esta migration (a busca devolve null e o insert
-- regrava sem a coluna); o que ela liga é a garantia de "nunca cobrar duas
-- vezes o mesmo pedido" no servidor — sem ela vale só a reconciliação por
-- /api/edits feita pelo plugin.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.edit_v3_jobs_client_request_idx;
--   ALTER TABLE public.edit_v3_jobs DROP COLUMN IF EXISTS client_request_id;

ALTER TABLE public.edit_v3_jobs
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS edit_v3_jobs_client_request_idx
  ON public.edit_v3_jobs (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
