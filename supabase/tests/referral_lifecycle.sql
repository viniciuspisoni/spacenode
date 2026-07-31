-- Ciclo de vida do Programa de Indicações, ponta a ponta, no banco.
--
-- Pré-requisitos: `public.profiles` e a migration
-- supabase/migrations/20260731000000_referral_program.sql aplicados.
--
--   psql -d <db> -f supabase/migrations/20260731000000_referral_program.sql
--   psql -d <db> -f supabase/tests/referral_lifecycle.sql
--
-- DESTRUTIVO: dá TRUNCATE nas tabelas do programa e DELETE em profiles.
-- Rodar só em banco descartável (local ou branch do Supabase), nunca em
-- produção. Qualquer asserção falha aborta o script (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\pset pager off

create or replace function chk(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  if p_ok then raise notice 'PASS  %', p_label;
  else raise exception 'FAIL  %', p_label; end if;
end $$;

truncate public.referral_events, public.referral_reward_applications,
         public.referral_rewards, public.referrals, public.referral_invites,
         public.referral_codes, public.referral_payment_fingerprints,
         public.stripe_webhook_events restart identity cascade;
delete from public.profiles;

-- Atores
insert into public.profiles (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'indicador@estudio.com',   now()),
  ('00000000-0000-0000-0000-0000000000b1', 'novo1@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000b2', 'novo2@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000b3', 'novo3@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000b4', 'novo4@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000b5', 'novo5@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000b6', 'novo6@cliente.com',       now()),
  ('00000000-0000-0000-0000-0000000000c1', 'velho@cliente.com',       now() - interval '90 days'),
  ('00000000-0000-0000-0000-0000000000c2', 'jacliente@cliente.com',   now()),
  ('00000000-0000-0000-0000-0000000000c3', 'indicador+alt@estudio.com', now());
update public.profiles set stripe_customer_id = 'cus_ja' where id = '00000000-0000-0000-0000-0000000000c2';

-- ── normalize_email ─────────────────────────────────────────────────────────
select chk('normalize_email tira +tag',        public.normalize_email('a+b@x.com') = 'a@x.com');
select chk('normalize_email tira ponto gmail', public.normalize_email('j.o.a.o@gmail.com') = 'joao@gmail.com');
select chk('normalize_email preserva ponto fora do gmail',
           public.normalize_email('j.o@outlook.com') = 'j.o@outlook.com');
select chk('normalize_email googlemail vira gmail',
           public.normalize_email('X@googlemail.com') = 'x@gmail.com');

-- ── ensure_referral_code ────────────────────────────────────────────────────
\set A '''00000000-0000-0000-0000-0000000000a1'''
select public.ensure_referral_code(:A::uuid) as code \gset
select chk('código tem 8 caracteres do alfabeto seguro', :'code' ~ '^[2-9A-HJ-NP-Z]{8}$');
select chk('ensure_referral_code é idempotente',
           public.ensure_referral_code(:A::uuid) = :'code');

-- ── bind: caminhos recusados ────────────────────────────────────────────────
select chk('código inexistente',
           public.bind_referral('ZZZZZZZZ', '00000000-0000-0000-0000-0000000000b1') ->> 'reason' = 'code_not_found');
select chk('autoindicação',
           public.bind_referral(:'code', :A::uuid) ->> 'reason' = 'self_referral');
select chk('conta antiga demais',
           public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000c1') ->> 'reason' = 'account_too_old');
select chk('conta que já foi cliente',
           public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000c2') ->> 'reason' = 'already_customer');
select chk('email duplicado do indicador (+tag)',
           public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000c3') ->> 'reason' = 'duplicate_identity');
select chk('duplicidade fica registrada como rejected',
           (select status from public.referrals where referred_user_id = '00000000-0000-0000-0000-0000000000c3') = 'rejected');

-- ── bind: caminho feliz + uma indicação por conta ───────────────────────────
select chk('bind ok', (public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b1') ->> 'ok')::boolean);
select chk('segunda indicação na mesma conta é recusada',
           public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b1') ->> 'reason' = 'already_referred');
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b2');
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b3');
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b4');
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b5');
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b6');
select chk('6 indicações vinculadas',
           (select count(*) from public.referrals where status = 'signed_up') = 6);

-- ── antiabuso por meio de pagamento ─────────────────────────────────────────
select chk('fingerprint novo é do próprio',
           public.claim_payment_fingerprint('fp_card_1', '00000000-0000-0000-0000-0000000000b1') ->> 'owner' = 'self');
select chk('fingerprint repetido em outra conta é recusado',
           (public.claim_payment_fingerprint('fp_card_1', '00000000-0000-0000-0000-0000000000b2') ->> 'ok')::boolean = false);
select chk('fingerprint vazio não bloqueia (Pix não tem cartão)',
           (public.claim_payment_fingerprint('', '00000000-0000-0000-0000-0000000000b2') ->> 'ok')::boolean);

-- ── confirmação da primeira mensalidade paga ────────────────────────────────
select public.confirm_referral('00000000-0000-0000-0000-0000000000b1', 'in_1', 'pi_1', 20, interval '7 days') as r1 \gset
select chk('confirm cria recompensa', (:'r1'::jsonb ->> 'reward_id') is not null);
select chk('recompensa nasce pending',
           (select status from public.referral_rewards where referral_id = (:'r1'::jsonb ->> 'referral_id')::uuid) = 'pending');
select chk('confirm é idempotente',
           (public.confirm_referral('00000000-0000-0000-0000-0000000000b1', 'in_1', 'pi_1', 20, interval '7 days') ->> 'already')::boolean);
select chk('idempotência não duplica recompensa',
           (select count(*) from public.referral_rewards) = 1);

-- ── janela de reembolso: nada disponível antes da hora ──────────────────────
select chk('mature não libera dentro da janela', public.mature_referral_rewards() = 0);
select chk('claim não pega recompensa em janela',
           (public.claim_referral_rewards(:A::uuid, 'in_ref_1', 100) ->> 'percent_off')::int = 0);

-- Fim da janela (simulado)
update public.referral_rewards set available_at = now() - interval '1 minute';
select chk('mature libera após a janela', public.mature_referral_rewards() = 1);
select chk('recompensa fica available',
           (select status from public.referral_rewards) = 'available');

-- ── revogação por reembolso dentro da janela ────────────────────────────────
select public.confirm_referral('00000000-0000-0000-0000-0000000000b2', 'in_2', 'pi_2', 20, interval '7 days');
select chk('revoga por payment intent',
           (public.revoke_referral_reward('refund', null, 'pi_2') ->> 'found')::boolean);
select chk('indicação revogada',
           (select status from public.referrals where referred_user_id = '00000000-0000-0000-0000-0000000000b2') = 'revoked');
select chk('recompensa revogada',
           (select rw.status from public.referral_rewards rw
              join public.referrals r on r.id = rw.referral_id
             where r.referred_user_id = '00000000-0000-0000-0000-0000000000b2') = 'revoked');
select chk('revogação é idempotente',
           (public.revoke_referral_reward('refund', null, 'pi_2') ->> 'already')::boolean);
select chk('recompensa revogada não amadurece', public.mature_referral_rewards() = 0);

-- ── acúmulo até 100% e excedente para a mensalidade seguinte ────────────────
select public.confirm_referral('00000000-0000-0000-0000-0000000000b3', 'in_3', 'pi_3', 20, interval '7 days');
select public.confirm_referral('00000000-0000-0000-0000-0000000000b4', 'in_4', 'pi_4', 20, interval '7 days');
select public.confirm_referral('00000000-0000-0000-0000-0000000000b5', 'in_5', 'pi_5', 20, interval '7 days');
select public.confirm_referral('00000000-0000-0000-0000-0000000000b6', 'in_6', 'pi_6', 20, interval '7 days');
update public.referral_rewards set available_at = now() - interval '1 minute' where status = 'pending';
select public.mature_referral_rewards();
select chk('5 recompensas disponíveis (1 revogada)',
           (select count(*) from public.referral_rewards where status = 'available') = 5);

select public.claim_referral_rewards(:A::uuid, 'in_ref_10', 100) as c1 \gset
select chk('teto de 100% por mensalidade', (:'c1'::jsonb ->> 'percent_off')::int = 100);
select chk('reserva de 5 recompensas',
           jsonb_array_length(:'c1'::jsonb -> 'reward_ids') = 5);
select chk('claim é idempotente por fatura',
           (public.claim_referral_rewards(:A::uuid, 'in_ref_10', 100) ->> 'already')::boolean);
select chk('sem recompensa sobrando neste mês',
           (select count(*) from public.referral_rewards where status = 'available') = 0);

-- Sexta indicação confirmada depois → excedente entra na mensalidade seguinte
insert into public.profiles (id, email, created_at)
values ('00000000-0000-0000-0000-0000000000b7', 'novo7@cliente.com', now());
select public.bind_referral(:'code', '00000000-0000-0000-0000-0000000000b7');
select public.confirm_referral('00000000-0000-0000-0000-0000000000b7', 'in_7', 'pi_7', 20, interval '7 days');
update public.referral_rewards set available_at = now() - interval '1 minute' where status = 'pending';
select public.mature_referral_rewards();
select chk('excedente fica para a próxima mensalidade',
           (public.claim_referral_rewards(:A::uuid, 'in_ref_11', 100) ->> 'percent_off')::int = 20);

-- ── liquidação: fatura paga → consumido ─────────────────────────────────────
select public.settle_reward_application('in_ref_10', 'consumed');
select chk('5 recompensas consumidas',
           (select count(*) from public.referral_rewards where status = 'consumed') = 5);
select chk('aplicação consumida',
           (select status from public.referral_reward_applications where invoice_id = 'in_ref_10') = 'consumed');
select chk('consumo é estado final',
           (public.settle_reward_application('in_ref_10', 'released') ->> 'already')::boolean);
select chk('recompensa consumida não volta',
           (select count(*) from public.referral_rewards where status = 'consumed') = 5);

-- ── liquidação: fatura não paga → benefício volta para a fila ───────────────
select public.settle_reward_application('in_ref_11', 'released');
select chk('benefício volta a disponível',
           (select count(*) from public.referral_rewards where status = 'available') = 1);
select chk('recompensa liberada perde o vínculo com a fatura',
           (select count(*) from public.referral_rewards where applied_invoice_id = 'in_ref_11') = 0);
select public.claim_referral_rewards(:A::uuid, 'in_ref_12', 100) as c3 \gset
select chk('entra na mensalidade seguinte', (:'c3'::jsonb ->> 'percent_off')::int = 20);

-- ── trilha de auditoria ─────────────────────────────────────────────────────
select chk('cada etapa deixou evento',
           (select count(distinct type) from public.referral_events) >= 7);
select chk('eventos cobrem confirmação e revogação',
           (select count(*) from public.referral_events
             where type in ('referral_confirmed','referral_revoked','reward_available',
                            'reward_applied','reward_consumed','reward_released')) >= 6);

\echo '=============================='
\echo 'CICLO DE VIDA: TODOS OS PASSOS OK'
\echo '=============================='
