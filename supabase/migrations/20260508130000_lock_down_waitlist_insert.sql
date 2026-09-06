-- ─────────────────────────────────────────────────────────────
-- Lock down public.waitlist INSERT
--
-- A policy "Allow public insert" cobre TODOS os roles (inclusive anon)
-- com WITH CHECK (true). Isso permite que qualquer cliente com a anon
-- key (que está no JS público da landing) insira na waitlist via REST,
-- pulando o endpoint /api/waitlist que valida o e-mail e roda no server.
--
-- O endpoint /api/waitlist usa createAdminClient() = service_role, que
-- bypassa RLS por design. Então remover a policy NÃO afeta o cadastro
-- legítimo pela landing — só fecha a porta dos fundos.
--
-- RLS já está habilitado na tabela. Sem policies = deny-all pra
-- anon/authenticated.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow public insert" ON public.waitlist;
