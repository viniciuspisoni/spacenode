-- O Ampliar registra o pedido antes do débito e mantém falhas com estorno no
-- histórico. Permite zero apenas nesses estados; preserva a expressão vigente
-- de cobrança/teste interno e todas as regras dos outros módulos.
DO $$
DECLARE
  rule record;
  found_rule boolean := false;
BEGIN
  FOR rule IN
    SELECT conname, pg_get_expr(conbin, conrelid) AS expression
    FROM pg_constraint
    WHERE conrelid = 'public.renders'::regclass
      AND contype = 'c'
      AND conname IN ('renders_nodes_charged_check', 'renders_nodes_charged_rule')
  LOOP
    found_rule := true;
    EXECUTE format('ALTER TABLE public.renders DROP CONSTRAINT %I', rule.conname);
    EXECUTE format(
      'ALTER TABLE public.renders ADD CONSTRAINT %I CHECK ((%s) OR
       (COALESCE(ambient = ''upscale'' AND status IN (''pending'', ''failed''), false) AND nodes_charged = 0)) NOT VALID',
      rule.conname, rule.expression
    );
    EXECUTE format('ALTER TABLE public.renders VALIDATE CONSTRAINT %I', rule.conname);
  END LOOP;
  IF NOT found_rule THEN
    RAISE EXCEPTION 'Regra de cobrança de renders não encontrada';
  END IF;
END $$;
