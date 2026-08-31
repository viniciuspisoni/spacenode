# AREA: billing

## MAP
CICLO DE VIDA DO NODE. Criação: (1) signup — handle_new_user insere em profiles sem informar credits, e a coluna assume DEFAULT 40 (supabase/migrations/20260529000000_free_signup_nodes_40.sql:18-19; legado era 12/40 em supabase-schema.sql:14); (2) compra de plano — app/api/stripe/checkout/route.ts cria Checkout Session (mode subscription) com metadata server-side {user_id, product_type:'plan', plan_id, billing_cycle, nodes_to_add} validada via lib/plans.ts (Starter 750 / Pro 1800 / Studio 3500 / Office 8000 nodes; price IDs em env STRIPE_PRICE_ID_{PLAN}_{CYCLE}); o webhook app/api/stripe/webhook/route.ts em checkout.session.completed faz UPDATE profiles SET plan, credits=nodes_to_add (linha 52-56 — SET, não incremento); (3) renovação — invoice.paid com billing_reason='subscription_cycle' reseta credits=plan.nodes (linhas 86-119); (4) Lumens avulsos — packs 500/1500/4000 (lib/lumens.ts) com 90 dias, creditados pelo RPC add_lumen_pack idempotente por stripe_session_id (migration 20260508140000:181-234); (5) cancelamento — customer.subscription.deleted zera credits e plan='free' (webhook:123-141). Consumo: o RPC vivo é consume_nodes_v2 (20260508140000:71-179) — débito em cascata plano→Lumens FIFO, lock FOR UPDATE no profile, exception P0001 em saldo insuficiente, retorno JSON; desde a Fase 1.5 (bolsa do escritório, 20260609000000_office_wallet.sql) TODAS as rotas chamam o wrapper consume_workspace_nodes(user, amount), que resolve o dono do workspace ativo (workspace_members.status='active' → workspaces.owner_id) e debita o DONO; individual = ele mesmo. Reembolso: refund_nodes (20260507000000:91-109, soma de volta em profiles.credits — refund de débito misto volta tudo pro plano, tradeoff documentado) via wrapper refund_workspace_nodes. RPCs antigos consume_credits (com guard auth.uid, 20260503000001) e consume_nodes coexistem; comentário em 20260507000000:47-52 afirma que EM PRODUÇÃO roda consume_credits SEM guard. ROTAS QUE DEBITAM (matriz débito→IA→refund): /api/generate (debita antes, FAL fal.subscribe com race de 90s, refund no catch — route.ts:142/221/310); /api/spaces/[id]/generate e generate-from-sketches (débito POR VISTA antes, row 'processing' em vistas, refund por vista falhada — :259/369 e :219/305); /api/spaces/[id]/extract-dna (8 nodes antes do Gemini, refund — :50/108); /api/edits e /api/spaces/.../vistas/[id]/edit (editRouter: rota+custo 0-6 nodes, free fix por plano, attempt em image_edit_attempts, débito se costNodes>0, refund em erro E em rejeição do quality gate — edits:195/234/331); /api/upscale e /api/vistas/[id]/upscale (débito antes, refund — :95/172 e :53/133); /api/apresentar/{moodboard,board,isometric,humanized-plan} (débito antes, refund — moodboard:93/195). EXCEÇÃO CRÍTICA: /api/video checa saldo de forma não-atômica lendo profiles.credits do MEMBRO (route.ts:79-87), gera o vídeo (1-4 min) e só DEPOIS debita dentro de Promise.all sem checar erro (:137-152) — débito que falha é engolido. Endpoints de IA sem cobrança (por design): /api/analyze, /api/video/analyze, /api/edits/segment (SAM2), /api/edits/preview, /api/vistas/[id]/verify-dna. STATUS: renders tem pending/processing/completed/failed (supabase-schema.sql:35) mas só recebe INSERT 'completed' pós-sucesso; vistas tem pending/processing/completed/failed com pré-insert 'processing' (20260509000000:53-54); image_edit_attempts tem pending/processing/completed/failed/refunded/rejected_quality_gate (20260603000002) — 'refunded' nunca é gravado. Não existe status 'refunded'/'cancelled' em renders/vistas, nem reaper para jobs presos em 'processing' (vercel.json não tem crons; pg_cron "não-instalado" segundo supabase/functions/expire-lumens/index.ts:24). LEDGER: não existe — o saldo é um contador mutável (profiles.credits + lumen_packs.nodes_remaining); rastros parciais e inconsistentes: renders.nodes_charged (generate/apresentar), renders.cost_credits (video; upscale não grava custo nenhum), vistas.nodes_cost, image_edit_attempts.cost_nodes/provider_cost_usd, user_monthly_usage. Saldo exibido: /api/users/me/balance já resolve o payer via getPayerId (lib/workspaces/context.ts), mas os pre-checks e os balance_after das rotas de geração ainda olham o saldo do próprio membro.

## FINDINGS

### [P0] 1. RLS de profiles permite o usuário setar os próprios credits e plan pelo client
- files: supabase-schema.sql:62-66; app/app/generate/GenerateClient.tsx:328; supabase/migrations/20260508000002_harden_security_definer_functions.sql
- evidence: Policy `users_update_own_profile ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` (supabase-schema.sql:62-66) sem restrição de coluna. Nenhuma migration revoga UPDATE coluna-a-coluna em profiles (grep por revoke/grant em supabase/migrations não retorna nada para profiles). A prova de que authenticated tem UPDATE direto: o próprio client browser já faz `supabase.from('profiles').update({ project_materials: updated }).eq('id', user.id)` (GenerateClient.tsx:328) e funciona. Logo `update({ credits: 999999, plan: 'office' })` também passaria.
- impact: Qualquer usuário logado pode se dar nodes infinitos e plano Office grátis via console do browser — perda financeira direta e bypass total do billing. Confirmar em produção se houve revoke manual via dashboard (não versionado); pelo código versionado, o buraco existe.
- recommendation: REVOKE UPDATE ON public.profiles FROM authenticated; GRANT UPDATE (full_name, project_materials, project_config) ON public.profiles TO authenticated (apenas colunas seguras). Alternativa: trigger BEFORE UPDATE que bloqueia mudança de credits/plan/stripe_* quando current_setting('role') = 'authenticated'. Versionar em migration.
- effort: baixo
- (sem verificacao adversarial)

### [P0] 2. /api/video gera primeiro e cobra depois, engolindo erro de débito (vídeo grátis)
- files: app/api/video/route.ts:79-87; app/api/video/route.ts:137-152
- evidence: Pre-check não-atômico: `const { data: profile } = await admin.from('profiles').select('credits')...; if (!profile || profile.credits < nodeCost) return 402` (:79-87) — lê credits do MEMBRO, ignora Lumens e a bolsa do dono. Depois gera o vídeo (adapter.generate, 1-4 min) e só então debita dentro de `Promise.all([admin.from('renders').insert({...}), admin.rpc('consume_workspace_nodes', {...})])` (:137-152) SEM checar `.error` — supabase-js não lança exception em erro de RPC, então P0001 (saldo insuficiente por corrida) ou qualquer falha de débito é silenciosamente ignorada e o usuário recebe o vídeo.
- impact: Vídeo é o item mais caro do catálogo (Kling/Veo). Corrida entre duas requests, membro de escritório com saldo próprio mas bolsa vazia, ou qualquer erro transitório no RPC = geração 100% grátis com custo FAL real. Também bloqueia indevidamente membro sem saldo pessoal cuja bolsa do dono tem nodes (402 errado).
- recommendation: Inverter para o padrão das demais rotas: consume_workspace_nodes ANTES do adapter.generate (mapeando P0001→402) + refund_workspace_nodes no catch. Remover o pre-check por profiles.credits (ou trocá-lo por user_node_balance do payer).
- effort: medio
- (sem verificacao adversarial)

### [P0] 3. Assinante anual recebe nodes apenas 1x por ano, mas a UI vende 'nodes/mês'
- files: app/api/stripe/webhook/route.ts:86-119; app/app/billing/BillingClient.tsx:110-111; lib/plans.ts:27-72
- evidence: Único mecanismo de refil é o webhook `invoice.paid` com `billing_reason === 'subscription_cycle'` (webhook/route.ts:88), que para assinatura anual ocorre 1x/ano. Não existe nenhum cron de refil mensal (vercel.json só tem redirects; pg_cron 'não-instalado' per supabase/functions/expire-lumens/index.ts:24). A UI promete mensalidade de nodes nos dois ciclos: BillingClient.tsx:111 exibe '<span>nodes/mês</span>' ao lado de p.nodes tanto em billing='monthly' quanto 'annual'.
- impact: Cliente anual do Pro paga R$1.990/ano e recebe 1.800 nodes em 12 meses, enquanto o mensal recebe 21.600 — quebra de promessa comercial, churn, chargebacks e violação de CDC. Se a intenção fosse 8000x12 para anual, o custo seria o problema inverso. Decisão de produto precisa ser explicitada e implementada.
- recommendation: Implementar refil mensal para assinantes anuais (cron diário que repõe credits=plan.nodes quando passou 1 mês do último refil, guardando last_refill_at em profiles), ou creditar nodes*12 com validade — e alinhar a copy. Tratar antes do lançamento.
- effort: medio
- (sem verificacao adversarial)

### [P1] 4. Webhook Stripe sem dedupe de event.id, updates de crédito não-idempotentes e 200 em falha de DB
- files: app/api/stripe/webhook/route.ts:31-83; app/api/stripe/webhook/route.ts:105-118
- evidence: Assinatura é verificada (constructEvent, :22) e add_lumen_pack é idempotente por stripe_session_id, mas: (1) não há tabela de eventos processados — re-entrega de checkout.session.completed ou invoice.paid re-executa `update({ credits: nodesToAdd })` (:52-56) / `update({ credits: match.plan.nodes })` (:105), que por ser SET reseta o saldo já consumido (usuário ganha de volta o que gastou desde a 1ª entrega); (2) em falha do update o handler apenas loga e retorna `{ received: true }` com HTTP 200 (:57, :117) — Stripe nunca retenta, então um erro transitório de DB = cliente pagou e não recebeu nodes, sem retry automático.
- impact: Re-entregas do Stripe (timeout, resend manual) creditam nodes a mais; falha transitória de DB perde a ativação do plano/renovação sem nenhum mecanismo de recuperação — suporte manual e perda financeira nos dois sentidos.
- recommendation: Criar tabela stripe_events (event_id PK) com INSERT ... ON CONFLICT DO NOTHING no início do handler (sair se já processado); retornar 500 quando o update do Supabase falhar para o Stripe retentar; considerar gravar last_credit_grant_invoice_id no profile para idempotência por invoice.
- effort: medio
- (sem verificacao adversarial)

### [P1] 5. Refund best-effort nunca detecta falha: admin.rpc não lança e o catch é código morto
- files: app/api/generate/route.ts:308-318; app/api/upscale/route.ts:170-177; app/api/edits/route.ts:330-333; app/api/spaces/[spaceId]/generate/route.ts:366-373; app/api/vistas/[vistaId]/upscale/route.ts:132-134; app/api/apresentar/moodboard/route.ts:193-200
- evidence: Padrão repetido em TODAS as rotas: `try { await admin.rpc('refund_workspace_nodes', {...}); console.warn('Refund executado', ...) } catch (refundErr) { console.error('FALHA NO REFUND (CRÍTICO)', ...) }` (ex.: generate/route.ts:310-317). O supabase-js retorna `{ error }` e NÃO lança exception em erro de RPC (não há throwOnError em lugar nenhum do app — grep confirma), então o catch nunca dispara, o `.error` nunca é lido e 'Refund executado' é logado mesmo quando o refund falhou.
- impact: Falha de refund (rede, permissão, RPC indisponível) é invisível: usuário perde nodes em falha de geração sem nenhum alerta, e o log mente dizendo que reembolsou. Mina a confiança no único mecanismo de proteção pós-débito.
- recommendation: Checar `const { error } = await admin.rpc('refund_workspace_nodes', ...)` e logar/alertar em error (idealmente gravando uma linha 'refund_pending' num ledger para retry). Extrair helper único refundNodes(admin, userId, amount, context) para não repetir o bug em 10 arquivos.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 6. Compra de plano com assinatura ativa cria segunda subscription no Stripe (dupla cobrança)
- files: app/api/stripe/checkout/route.ts:61-90; app/api/stripe/webhook/route.ts:52-56
- evidence: A rota de checkout cria `mode: 'subscription'` sem verificar se o profile já tem stripe_subscription_id ativo (:75-89) — só lê o profile para reusar customer (:45-49). No webhook, a ativação sobrescreve `stripe_subscription_id` com a nova sub (:52-56). A assinatura antiga continua viva no Stripe cobrando todo ciclo; seu invoice.paid não casa mais com o profile (filtro eq stripe_subscription_id, :107) e vira apenas warn.
- impact: Usuário que faz upgrade/downgrade pela tela de billing paga DUAS assinaturas simultaneamente até perceber e cancelar manualmente — chargeback e dano reputacional praticamente garantidos no primeiro upgrade real.
- recommendation: No checkout: se profile.stripe_subscription_id existir, usar stripe.subscriptions.update (proration) ou Billing Portal em vez de nova session; no mínimo, cancelar a sub anterior no webhook de ativação quando subscriptionId mudar.
- effort: medio
- (sem verificacao adversarial)

### [P1] 7. Bolsa do escritório: pre-checks e balance_after usam o saldo do MEMBRO, débito vai no DONO
- files: app/api/edits/route.ts:131-148; app/api/spaces/[spaceId]/generate/route.ts:182-199; app/api/spaces/[spaceId]/vistas/[vistaId]/edit/route.ts:145-153; app/api/video/route.ts:79-87; app/api/generate/route.ts:286-301
- evidence: consume_workspace_nodes debita o owner do workspace (office_wallet.sql:27-35), mas os pre-checks de saldo consultam `user_node_balance ... .eq('user_id', user.id)` do membro (edits/route.ts:131-137; spaces/generate:183-189) e o `balance_after` devolvido pra UI também (edits:310-314; generate:286-289). /api/video checa profiles.credits do membro (:79-87).
- impact: Membro de escritório sem saldo pessoal recebe 402 mesmo com a bolsa do dono cheia (quebra o fluxo principal do plano Office recém-lançado); no caminho inverso a UI mostra saldo errado depois de cada geração. Em /api/video combina com a cobrança pós-geração e vira geração grátis.
- recommendation: Resolver payerId via getPayerId (lib/workspaces/context.ts) e usar esse id em todos os pre-checks de user_node_balance e nas consultas de balance_after. Centralizar num helper getPayerBalance(admin, userId).
- effort: baixo
- (sem verificacao adversarial)

### [P1] 8. consume_credits legado em produção sem guard auth.uid() — possível dreno de saldo de terceiros (conferir em prod)
- files: supabase/migrations/20260507000000_pricing_v2_engines.sql:47-52; supabase/migrations/20260503000001_create_consume_credits_rpc.sql:99-101
- evidence: Comentário explícito na migration 20260507000000:48-52: 'NÃO replicar o auth.uid() guard que consta na migration 20260503000001 (essa versão do consume_credits nunca foi aplicada — em produção roda a versão simples sem guard)'. A versão legada tinha GRANT EXECUTE TO authenticated. Se em produção consume_credits continua sem guard e executável por authenticated, qualquer usuário logado pode chamar rpc('consume_credits', { user_id_input: <vítima>, amount: N }) e queimar o saldo de outro usuário.
- impact: Ataque de griefing: drenar saldo de qualquer conta conhecendo o UUID (vaza em convites/workspaces). Nenhum código do app chama mais consume_credits (grep só acha docs), então é superfície morta com risco puro.
- recommendation: Verificar o estado real em produção (pg_proc + grants) e dropar: `DROP FUNCTION public.consume_credits(uuid,integer)` ou no mínimo REVOKE EXECUTE FROM authenticated. Versionar em migration.
- effort: baixo
- (sem verificacao adversarial)

### [P1] 9. Jobs órfãos: débito sem refund quando a função morre; vistas/attempts presos em 'processing' para sempre
- files: app/api/spaces/[spaceId]/generate/route.ts:257-287; app/api/edits/route.ts:150-175; app/api/generate/route.ts:25; vercel.json:1-10
- evidence: Fluxo é débito → row 'processing' → chamada FAL de até 90-120s (FAL_TIMEOUT_MS=90_000 em generate/route.ts:25; 120s em vistas/upscale). /api/generate, /api/edits e as rotas de spaces NÃO declaram maxDuration (só /api/video e /api/upscale têm maxDuration=300) — se o runtime Vercel encerrar a função no limite default, o catch nunca roda: sem refund, vista/attempt fica 'processing' eternamente. Não há nenhum reaper: vercel.json não tem crons e pg_cron está 'não-instalado' (expire-lumens/index.ts:24-25).
- impact: Nodes debitados e perdidos silenciosamente em cada timeout de plataforma; histórico polui com jobs 'processing' infinitos; sem visibilidade para suporte. Conferir o maxDuration efetivo do projeto na Vercel (Fluid vs default).
- recommendation: Declarar maxDuration explícito (> FAL_TIMEOUT + folga) em todas as rotas de geração; criar job (Vercel Cron ou pg_cron) que marca como 'failed' e reembolsa vistas/image_edit_attempts em 'processing' há mais de N minutos usando nodes_cost/cost_nodes gravados na própria row.
- effort: medio
- (sem verificacao adversarial)

### [P1] 10. Não existe ledger de nodes nem log de custo real de IA
- files: supabase/migrations/20260508140000_pricing_v2_1_office_lumen.sql:71-179; supabase/migrations/20260507000000_pricing_v2_engines.sql:91-109
- evidence: O saldo é só um contador mutável (profiles.credits + lumen_packs.nodes_remaining); consume_nodes_v2/refund_nodes não gravam nenhuma linha de movimento. Rastros parciais e inconsistentes: renders.nodes_charged (generate), renders.cost_credits (video), vistas.nodes_cost, image_edit_attempts.cost_nodes/provider_cost_usd (único lugar com custo USD), user_monthly_usage. Impossível auditar webhook replay, refund duplicado ou reconciliar custo FAL vs receita.
- impact: Sem trilha de auditoria, qualquer bug de cobrança (vários listados acima) é indetectável e irrecuperável; impossibilita relatório de margem por usuário/ferramenta — crítico para um negócio cujo COGS é chamada de API.
- recommendation: Criar node_ledger (id, user_id, payer_id, workspace_id, delta integer, kind check in ('debit','refund','grant_signup','grant_plan','grant_renewal','grant_lumen','expiry','adjustment'), source text, job_table text, job_id uuid, stripe_event_id text, balance_after integer, created_at) preenchido DENTRO de consume_nodes_v2/refund_nodes/add_lumen_pack (mesma transação); e ai_cost_log (id, job_table, job_id, provider, endpoint, cost_usd numeric, duration_ms, created_at). UNIQUE (kind, job_table, job_id) previne refund duplo.
- effort: medio
- (sem verificacao adversarial)

### [P2] 11. Timeout FAL refunda o usuário mas não cancela o job — empresa paga o custo FAL
- files: app/api/generate/route.ts:221-226; app/api/spaces/[spaceId]/generate/route.ts:329-334; app/api/vistas/[vistaId]/upscale/route.ts:101-106
- evidence: `Promise.race([fal.subscribe(...), timeout 90s])` — quando o timer vence, o catch refunda os nodes, mas a request FAL continua rodando no provider (não há AbortController/cancel da queue) e será cobrada em USD mesmo que complete depois.
- impact: Custo FAL sem receita correspondente em todo timeout; em horários de fila longa (4K, clarity 120s) pode virar sangria recorrente de margem.
- recommendation: Usar a queue API do FAL com requestId e cancelar (fal.queue.cancel) no timeout; ou registrar o requestId e reconciliar depois (se completou, re-cobrar/aproveitar o output em vez de refundar).
- effort: medio
- (sem verificacao adversarial)

### [P2] 12. Endpoints de IA gratuitos sem rate-limit — custo Gemini/SAM2 abusável
- files: app/api/analyze/route.ts:14-36; app/api/edits/segment/route.ts:44-61; app/api/video/analyze/route.ts; app/api/vistas/[vistaId]/verify-dna/route.ts
- evidence: analyze/route.ts:14 documenta 'NÃO consome Nodes' e chama fal.storage.upload + analyzeImage (Gemini Vision) por request; edits/segment chama SAM2 (fal-ai/sam2/image) sem débito; nenhum dos quatro tem qualquer throttle/quota além de autenticação.
- impact: Usuário no plano free (40 nodes) pode martelar esses endpoints em loop e gerar custo de API ilimitado sem gastar um node — vetor de abuso de custo direto.
- recommendation: Rate-limit por usuário (ex.: N chamadas/min e M/dia via contador no Supabase ou Upstash) e teto diário para contas free; registrar custo no ai_cost_log proposto.
- effort: medio
- (sem verificacao adversarial)

### [P2] 13. Painel de saldo insuficiente chama stub 503 ('disponível em agosto') em vez do checkout real de Lumens
- files: components/spaces/InsufficientBalancePanel.tsx:33-46; app/api/billing/avulso-checkout/route.ts:10-18
- evidence: handleAvulso faz fetch('/api/billing/avulso-checkout') que é um stub fixo retornando 503 {error:'available_in_august'} e mostra alert 'estará disponível em agosto' — enquanto o checkout real de Lumens já existe e funciona em /api/stripe/checkout (type:'lumen'), usado pelo BillingClient.tsx:28.
- impact: Exatamente no momento de maior intenção de compra (usuário travado sem saldo no meio de um fluxo de geração), o funil aponta para um endpoint morto — perda direta de conversão/receita.
- recommendation: Trocar o fetch para POST /api/stripe/checkout com { type: 'lumen', id } (tratando o 403 de plano free/starter com CTA de upgrade) e remover o stub avulso-checkout.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 14. Contabilidade do histórico inconsistente: custo em duas colunas e upscale gravando custo default 1
- files: app/api/video/route.ts:146; app/api/generate/route.ts:269; app/api/upscale/route.ts:145-156; supabase-schema.sql:38
- evidence: generate/apresentar gravam `nodes_charged` (generate:269); video grava `cost_credits` (video:146); /api/upscale não grava custo NENHUM no insert de renders (:145-156 — sem nodes_charged nem cost_credits), então cai no default cost_credits=1 (supabase-schema.sql:38) mesmo quando computeUpscaleCost cobrou dezenas de nodes. A view de uso em 20260509000000:221 filtra por nodes_charged > 0, ignorando vídeo e upscale.
- impact: Relatórios de consumo (usage, workspace reports da Fase 2) subestimam vídeo e upscale; reconciliação débito-vs-histórico impossível; refunds não aparecem em lugar nenhum.
- recommendation: Padronizar numa única coluna (nodes_charged) em todas as inserções de renders, gravar o custo real do upscale, e backfillar cost_credits→nodes_charged. O node_ledger proposto resolve na raiz.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 15. invoice.paid frágil (lê só lines.data[0]) e renovação reseta saldo sem rollover
- files: app/api/stripe/webhook/route.ts:88-105
- evidence: `const lineItem = invoice.lines.data[0]` (:89) — invoices com múltiplas linhas (proration de upgrade, taxas) podem ter o price do plano em outra posição, caindo no warn 'price_id desconhecido' e perdendo a renovação. `update({ credits: match.plan.nodes })` (:105) zera qualquer saldo remanescente do mês anterior (sem rollover) — se intencional, ok, mas combinado com re-entrega de webhook (sem dedupe) reseta saldo já consumido.
- impact: Renovações perdidas em cenários de proration; comportamento de rollover não documentado nem testável; interação com replay agrava o finding de idempotência.
- recommendation: Iterar invoice.lines procurando um price conhecido (findPlanByStripePriceId em todas as linhas); decidir e documentar a política de rollover; condicionar o update à idempotência por invoice.id.
- effort: baixo
- (sem verificacao adversarial)

### [P2] 16. extract-dna: guard de double-submit não-atômico permite débito duplo de 8 nodes
- files: app/api/spaces/[spaceId]/extract-dna/route.ts:39-53
- evidence: O guard é read-then-write sem condição atômica: lê o space (:27-31), checa `status === 'locked' || 'archived'` (:39), e faz `update({ status: 'dna_extracting' })` sem cláusula de status anterior (:44-47). Duas requests concorrentes (double-click) passam ambas pela checagem e ambas debitam DNA_EXTRACTION_COST e chamam o Gemini.
- impact: Cobrança dupla de 8 nodes + 2x custo Gemini em double-click; reclamação de suporte.
- recommendation: Update condicional atômico: `.update({ status: 'dna_extracting' }).eq('id', spaceId).in('status', ['draft','dna_extracted']).select()` e abortar com 409 se 0 rows retornadas.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 17. expire-lumens nunca roda (pg_cron não instalado, função não agendada)
- files: supabase/functions/expire-lumens/index.ts:24-25; supabase/migrations/20260508140000_pricing_v2_1_office_lumen.sql:53-56
- evidence: Comentário no próprio arquivo: 'pg_cron está disponível mas não-instalado neste projeto. Habilitar via Dashboard ... antes de agendar'. consume_nodes_v2 filtra expires_at > NOW(), então não há bug financeiro — mas packs vencidos ficam com status 'active' e a view user_node_balance os exclui só pelo filtro de data.
- impact: Status visual incorreto em lumen_packs (pack vencido aparece 'active' na tabela da tela de billing via daysUntil=0); risco de algum consumidor futuro confiar no status em vez da data.
- recommendation: Instalar pg_cron e agendar conforme o snippet documentado, ou simplesmente rodar o UPDATE de expiração inline no início de add_lumen_pack/consume_nodes_v2.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 18. Webhook não trata charge.refunded/dispute nem invoice.payment_failed
- files: app/api/stripe/webhook/route.ts:31-143
- evidence: O handler só processa checkout.session.completed, invoice.paid e customer.subscription.deleted. Um refund/chargeback de Lumen ou de plano no Stripe não remove os nodes creditados (lumen_packs fica intacto); invoice.payment_failed não marca o plano como past_due — o usuário segue com os nodes do ciclo até o subscription.deleted da régua de cobrança do Stripe.
- impact: Quem pedir refund/chargeback fica com os nodes (perda pequena mas certa); inadimplente usa o ciclo inteiro de nodes antes do cancelamento.
- recommendation: Tratar charge.refunded/charge.dispute.created zerando o lumen_pack da session correspondente (lookup por payment_intent→session) e registrando no ledger; opcionalmente tratar invoice.payment_failed com badge de aviso.
- effort: medio
- (sem verificacao adversarial)

### [P3] 19. Status 'refunded' de image_edit_attempts nunca é usado — refunds invisíveis no histórico
- files: supabase/migrations/20260603000002_edit_attempts_quality_gate.sql:7-9; app/api/edits/route.ts:183-189; app/api/edits/route.ts:330-334
- evidence: O CHECK aceita ('pending','processing','completed','failed','refunded','rejected_quality_gate'), mas o catch das rotas de edição grava sempre 'failed' via failAttempt (edits/route.ts:334) mesmo quando houve refund dos nodes (:331). Nenhum código grava 'refunded' (grep em app/ não encontra).
- impact: Impossível distinguir no histórico tentativa que falhou COM reembolso de uma que falhou sem; dificulta auditoria de cobrança e suporte ao cliente.
- recommendation: No catch, quando o refund for executado com sucesso (checando .error — ver finding do refund silencioso), gravar status 'refunded' em vez de 'failed', mantendo error_message.
- effort: baixo
- (sem verificacao adversarial)
