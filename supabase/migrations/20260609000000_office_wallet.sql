-- Workspaces/Equipes — Fase 1.5 (bolsa do escritório).
--
-- "Bolsa do escritório = saldo do DONO." Em vez de cada membro gastar do próprio
-- saldo, a geração de um membro de escritório debita o saldo do dono (a conta
-- principal). Para usuário INDIVIDUAL, o dono do workspace é ele mesmo, então a
-- cobrança fica IDÊNTICA à de hoje.
--
-- Implementação minimamente invasiva: dois wrappers finos que resolvem "quem
-- paga" (o dono do workspace ativo) e reusam as funções atuais SEM alterá-las:
--   consume_workspace_nodes → consume_nodes_v2(dono, amount)   (mesmo retorno JSON,
--                                                               mesmo P0001)
--   refund_workspace_nodes  → refund_nodes(dono, amount)
--
-- As rotas trocam apenas o NOME da função (params/retorno/erros iguais).
-- Só service-role chama (as rotas autenticam o usuário antes). Idempotente.

create or replace function public.consume_workspace_nodes(user_id_input uuid, amount integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payer uuid;
begin
  -- quem paga = dono do workspace ativo do usuário (individual: ele mesmo)
  select w.owner_id into v_payer
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = user_id_input and m.status = 'active'
  limit 1;

  if v_payer is null then v_payer := user_id_input; end if;  -- fallback seguro

  return public.consume_nodes_v2(v_payer, amount);
end;
$$;

create or replace function public.refund_workspace_nodes(user_id_input uuid, amount integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payer uuid;
begin
  select w.owner_id into v_payer
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = user_id_input and m.status = 'active'
  limit 1;

  if v_payer is null then v_payer := user_id_input; end if;

  perform public.refund_nodes(v_payer, amount);
end;
$$;

revoke execute on function public.consume_workspace_nodes(uuid, integer) from public, anon, authenticated;
grant  execute on function public.consume_workspace_nodes(uuid, integer) to service_role;
revoke execute on function public.refund_workspace_nodes(uuid, integer)  from public, anon, authenticated;
grant  execute on function public.refund_workspace_nodes(uuid, integer)  to service_role;
