# AREA: supabase

## MAP
SCHEMA RECONSTRUIDO (supabase-schema.sql + 23 migrations em supabase/migrations/, ordem cronologica):

Tabelas versionadas: profiles (id=auth.users, credits default 40 via 20260529000000, plan check free/starter/pro/studio/office via 20260508140000, stripe_customer_id/subscription_id, project_config jsonb via 20260508000000_add_project_config); renders (historico do Renderizar + Ampliar + Animar + Apresentar; colunas acumuladas: engine/resolution/nodes_charged com CHECKs em 20260507000000, folder_id em 20260508000000_create_render_folders, upscale_meta jsonb+GIN parcial em 20260527000000, cma_stage/gemini_request_id em 20260519000000, free_fixes_used/source_tool/generated_by_spacenode em 20260603000000, workspace_id em 20260608000001, review_status em 20260608000003); waitlist; migration_audits e pre_pricing_v2_balance_snapshot (RLS deny-all via 20260508000001); lumen_packs (packs 500/1500/4000, expira em 90 dias, indices parciais user+expires_at p/ FIFO); spaces, vistas, packs, architect_identity, pack_comments (20260509000000_spaces_block_1, com RLS completa por dono e buckets); render_folders; image_edit_attempts, user_monthly_usage, edit_reference_assets (editRouter v1, 20260603*); workspaces, workspace_members (indice unico parcial uq_wm_one_active_per_user garante 1 workspace ativo por usuario), workspace_invites (20260608*).

Views: spaces_with_counts, node_usage_daily, user_node_balance (todas security_invoker=on, grant a authenticated); workspace_member_usage e workspace_generations (revogadas de anon/authenticated, lidas so via service_role apos checagem owner/admin em codigo — app/app/equipe/page.tsx:43-61).

Funcoes: todas com SET search_path fixado. consume_credits (guard auth.uid, grant authenticated), consume_nodes/refund_nodes/consume_nodes_v2/add_lumen_pack/add_credits/bump_monthly_usage/accept_workspace_invite/remove_workspace_member/consume_workspace_nodes/refund_workspace_nodes — todas REVOKE de public/anon/authenticated e GRANT so a service_role (hardening em 20260508000002, 20260603000001, 20260608000002). Cobranca atual (Fase 1.5): rotas chamam consume_workspace_nodes via admin.rpc, que resolve o dono do workspace ativo e delega a consume_nodes_v2 (debito plano primeiro, depois lumens FIFO com FOR UPDATE).

Storage: 2 buckets versionados, ambos PUBLICOS — space-mestres (15 MB, jpeg/png/webp) e architect-identity (2 MB), com policies INSERT/UPDATE/DELETE por pasta do uid ((storage.foldername(name))[1] = auth.uid()) em 20260509000000:237-256. Paths reais: {uid}/retocar/{result|crop|crop-mask|reference|source|mask}/..., {uid}/sketches/{spaceId}/..., {uid}/... (vista mestre). Todo o resto (Renderizar, Ampliar, Animar, Apresentar) usa fal.storage.upload e guarda URLs do CDN da FAL direto em renders.input_url/output_url — so o Editar re-hospeda resultado no Supabase (lib/spaces/edit-route-helpers.ts:126-150).

DRIFT GRAVE entre repo e producao: as tabelas edits, walkthroughs e shots NAO existem em nenhum SQL do repo, mas sao referenciadas por codigo (app/api/edits/route.ts) e pelas migrations 20260608000001/3/5; profiles.project_materials so existe num arquivo solto na raiz (migration-materials.sql); renders.config_snapshot (inserido em app/api/generate/route.ts:272) nao tem DDL em lugar nenhum; ha duas migrations com o MESMO timestamp 20260508000000; e 20260519000000 esta untracked no git. Um ambiente novo nao sobe a partir do repo.

Lifecycle: inexistente. 3 TODOs explicitos no codigo (mascaras, sketches, referencias), edge function expire-lumens escrita mas pg_cron nao instalado, vercel.json sem crons. renders/vistas/image_edit_attempts/edit_reference_assets e o bucket space-mestres crescem sem poda.

Workspaces: modelo solido para o presente (1 ativo por user, carimbo por trigger SECURITY DEFINER, backfill idempotente, convite atomico com checagem de email), mas com lacunas para o futuro: spaces/projetos nao tem workspace_id (biblioteca compartilhada exigira backfill), workspace.type vira office e nunca reverte, review_status sem auditoria de quem aprovou, e a pre-checagem de saldo das rotas ainda olha o saldo do MEMBRO enquanto o debito vai na bolsa do DONO.

## FINDINGS

### [P0] 1. Usuario pode editar os proprios credits/plan via PostgREST (policy de UPDATE de profiles sem restricao de coluna)
- files: supabase-schema.sql:62; app/app/generate/GenerateClient.tsx:328; app/app/generate/GenerateClient.tsx:360
- evidence: Policy `users_update_own_profile ... for update using (auth.uid() = id) with check (auth.uid() = id)` (supabase-schema.sql:62-66) cobre TODAS as colunas, e nenhuma migration faz REVOKE/GRANT por coluna em profiles (grep de revoke/grant em supabase/migrations só atinge funções). O grant default do Supabase dá UPDATE total a `authenticated`, e o app PROVA que esse caminho está aberto: o browser atualiza profiles direto com o anon key + JWT (`supabase.from('profiles').update({ project_materials }).eq('id', user.id)` em GenerateClient.tsx:328 e project_config em :360). Logo qualquer usuário logado pode enviar PATCH /rest/v1/profiles?id=eq.<seu-id> com {"credits": 999999, "plan": "office"}.
- impact: Perda financeira direta e ilimitada: saldo de nodes é profiles.credits — auto-atribuir créditos gera consumo real de FAL/Gemini sem pagamento; plan='office' ainda eleva o teto de correções grátis (80/mês em lib/spaces/edit-free-fix.ts:23). Também permite corromper stripe_customer_id/subscription_id.
- recommendation: Migration: REVOKE UPDATE ON public.profiles FROM authenticated; GRANT UPDATE (full_name, project_config, project_materials) ON public.profiles TO authenticated. Alternativa/complemento: trigger BEFORE UPDATE que rejeita mudança de credits/plan/stripe_* quando current_setting('request.jwt.claims') não for service_role.
- effort: baixo
- (sem verificacao adversarial)

### [P0] 2. Animar (/api/video): cobranca depois da geracao, sem refund, checando saldo errado (profiles.credits do membro)
- files: app/api/video/route.ts:79; app/api/video/route.ts:137; app/api/video/route.ts:151
- evidence: A rota checa saldo lendo `admin.from('profiles').select('credits').eq('id', user.id)` (linhas 79-87) — ignora lumen_packs e a bolsa do escritório — e só debita DEPOIS do `adapter.generate(...)` retornar, dentro de `Promise.all([admin.from('renders').insert(...), admin.rpc('consume_workspace_nodes', ...)])` (linhas 137-152). consume_nodes_v2 lança P0001 se o saldo (do DONO) for insuficiente; a rejeição derruba o Promise.all → 500, sem refund nem registro de falha, com o vídeo já gerado e pago à FAL.
- impact: TOCTOU: N requests concorrentes passam na pré-checagem com saldo para 1 vídeo; todos geram (vídeo é o item mais caro do catálogo) e os débitos excedentes falham — custo FAL sem receita. Para membro de escritório: bloqueado com 402 mesmo com bolsa cheia (checa credits pessoais), ou gera sem o dono ter saldo. Também grava cost_credits em vez de nodes_charged, sumindo dos relatórios (workspace_member_usage soma nodes_charged).
- recommendation: Replicar o padrão do /api/generate: consume_workspace_nodes ANTES da geração, refund_workspace_nodes em catch, gravar nodes_charged e checar saldo via user_node_balance do pagador. Migrar para fila+polling (o próprio comentário nas linhas 14-19 reconhece o risco).
- effort: medio
- (sem verificacao adversarial)

### [P1] 3. Tabelas edits, walkthroughs e shots existem so em producao — RLS naoverificavel e ambiente novo quebra
- files: app/api/edits/route.ts:345; supabase/migrations/20260608000001_generations_workspace_id.sql:16; supabase/migrations/20260608000003_phase2_team_usage.sql:32; migration-materials.sql:3; app/api/generate/route.ts:272
- evidence: Nenhum CREATE TABLE para edits/walkthroughs/shots em nenhum .sql do repo (grep em todos os SQLs), mas 20260608000001:16-19 faz ALTER TABLE nelas e o GET /api/edits confia 100% na RLS dessa tabela invisível: `supabase.from('edits').select('*')` SEM filtro .eq('user_id') (app/api/edits/route.ts:345-349). Drift adicional: profiles.project_materials só existe em migration-materials.sql solto na raiz; renders.config_snapshot (inserido em generate/route.ts:272) não tem DDL; duas migrations compartilham o timestamp 20260508000000; 20260519000000 está untracked no git status.
- impact: Se a RLS de `edits` em produção estiver ausente/permissiva, o GET vaza edições entre usuários — impossível auditar pelo repo. `supabase db push`/provisionamento de staging falha nas migrations 20260608* (tabelas inexistentes). Recuperação de desastre a partir do repo é impossível.
- recommendation: Despejar o schema de produção (supabase db dump) e versionar migrations de baseline para edits/walkthroughs/shots/config_snapshot/project_materials; adicionar filtro .eq('user_id', user.id) no GET /api/edits como defesa em profundidade; corrigir timestamps duplicados e commitar a migration untracked.
- effort: medio
- (sem verificacao adversarial)

### [P1] 4. Policy vistas_update_own sem restricao de coluna permite zerar free_fixes_used e adulterar nodes_cost/review_status
- files: supabase/migrations/20260509000000_spaces_block_1.sql:173; supabase/migrations/20260603000000_edit_router_v1.sql:70; lib/spaces/edit-route-helpers.ts:69
- evidence: `CREATE POLICY vistas_update_own ON public.vistas FOR UPDATE TO authenticated USING (auth.uid() = user_id)` (spaces_block_1.sql:173) cobre todas as colunas. O editRouter lê vistas.free_fixes_used para decidir correção grátis (edit-route-helpers.ts:69-78) e o limite por imagem é o único freio além do teto mensal. Um PATCH /rest/v1/vistas?id=eq.<id> com {"free_fixes_used": 0} reabre correções grátis (cada uma tem custo real de provider); {"nodes_cost": 0, "review_status": "approved"} corrompe workspace_member_usage/workspace_generations.
- impact: Burla do racionamento de correções grátis (custo USD real por edição no FAL/Vertex, sem cobrança em nodes) e corrupção dos relatórios da Equipe usados pelo dono do escritório.
- recommendation: REVOKE UPDATE ON public.vistas FROM authenticated e GRANT UPDATE só nas colunas legitimamente editáveis pelo cliente (is_favorited, review_status se desejado); mover favorite/review para rotas server-side (já existe /api/vistas/[id]/favorite). Aplicar o mesmo racional a image_edit_attempts (iea_update_own/iea_insert_own em 20260603000000:54-59 — escrita é toda via service_role, policies podem ser dropadas).
- effort: baixo
- (sem verificacao adversarial)

### [P1] 5. Fase 1.5 (bolsa do escritorio) inconsistente: pre-checagem de saldo olha o membro, debito vai no dono
- files: app/api/edits/route.ts:131; app/api/spaces/[spaceId]/generate/route.ts:183; app/api/generate/route.ts:286; supabase/migrations/20260609000000_office_wallet.sql:17
- evidence: consume_workspace_nodes resolve o pagador = owner do workspace ativo (office_wallet.sql:27-35), mas as pré-checagens continuam em cima do PRÓPRIO usuário: `admin.from('user_node_balance').select('total_balance').eq('user_id', user.id)` em edits/route.ts:131-148 e spaces/generate/route.ts:183-200. O `balance_after` devolvido à UI também é o do membro (generate/route.ts:286-290, edits/route.ts:310-314).
- impact: Membro de escritório com saldo pessoal 0 (situação normal pós-convite) recebe 402 'Saldo insuficiente' ANTES do débito mesmo com a bolsa do dono cheia — quebra o fluxo principal do produto Equipes recém-lançado. Inverso também: pré-checagem passa pelo saldo pessoal e o débito real falha, gerando attempts órfãs marcadas como failed.
- recommendation: Criar view/RPC user_workspace_balance que resolve o saldo do PAGADOR (owner via getPayerId de lib/workspaces/context.ts) e usar nas pré-checagens e no balance_after de todas as rotas (edits, spaces/generate, generate-from-sketches, apresentar/*, upscale).
- effort: medio
- (sem verificacao adversarial)

### [P1] 6. Outputs de Renderizar/Ampliar/Animar/Apresentar ficam no CDN da FAL sem re-hospedagem
- files: app/api/generate/route.ts:230; app/api/upscale/route.ts:145; app/api/video/route.ts:135; app/api/apresentar/moodboard/route.ts:118
- evidence: generate/route.ts:230 grava `outputUrl = images[0].url` (URL fal.media) direto em renders.output_url; upscale/route.ts:145-156 idem; video/route.ts:135-136 tem TODO explícito: 'copy output video to permanent Supabase Storage... Currently output_url is a CDN link with no documented retention SLA'. Só o módulo Editar re-hospeda (uploadEditAsset em lib/spaces/edit-route-helpers.ts:126-150). Inputs também vão pra fal.storage.upload (generate:203, upscale:112, video:90).
- impact: Todo o histórico do usuário (renders, upscales, vídeos, pranchas) depende da retenção do CDN da FAL — sem SLA documentado no código (conferir doc oficial da FAL). Se a FAL expirar arquivos, o histórico/portfólio do arquiteto quebra silenciosamente, incluindo imagens já entregues a clientes. Bloqueia também qualquer lifecycle próprio.
- recommendation: Re-hospedar output (e opcionalmente input) no bucket Supabase no momento da geração, como o Editar já faz; processar em background (waitUntil) para não somar latência. Priorizar vídeo (item mais caro de regenerar).
- effort: medio
- (sem verificacao adversarial)

### [P2] 7. Buckets publicos: qualquer pessoa com a URL acessa imagens privadas de projetos de clientes
- files: supabase/migrations/20260509000000_spaces_block_1.sql:231; lib/spaces/edit-route-helpers.ts:148; app/api/spaces/[spaceId]/upload-sketch/route.ts:76
- evidence: `INSERT INTO storage.buckets ... ('space-mestres', ..., true, 15728640, ...)` (spaces_block_1.sql:231-235) cria os 2 buckets com public=true; todo acesso usa getPublicUrl (edit-route-helpers.ts:148, upload-sketch:76 etc.). Paths têm uid + timestamp + 6 chars aleatórios — não adivinháveis na prática, mas as URLs são permanentes, não-revogáveis e vazam por compartilhamento/referrer/logs.
- impact: Projetos de arquitetura pré-lançamento são confidenciais; uma URL repassada continua acessível para sempre, inclusive após o usuário deletar a conta (objects não são limpos). Sem como revogar acesso por cliente/projeto.
- recommendation: Migrar assets privados (retocar/source, masks, sketches, vista-mestre) para bucket privado + createSignedUrl com TTL; manter URL pública apenas para o necessário em /p/[slug] (packs compartilhados) — ou copiar para um bucket público só no momento do share.
- effort: alto
- (sem verificacao adversarial)

### [P2] 8. Nenhum lifecycle/TTL: storage e tabelas de tentativa crescem sem poda; cron de lumens escrito mas nao agendado
- files: app/api/edits/upload-asset/route.ts:11; app/api/spaces/[spaceId]/upload-sketch/route.ts:9; supabase/functions/expire-lumens/index.ts:24; vercel.json:1
- evidence: TODOs explícitos e não resolvidos: 'lifecycle policy de 7 dias pra máscaras nunca referenciadas' (upload-asset:11) e 'lifecycle policy de 7 dias pra sketches' (upload-sketch:9-11). uploadEditAsset grava result/crop/crop-mask por edição (edit-route-helpers.ts:141) — crops e máscaras temporárias viram lixo permanente. expire-lumens/index.ts:24-25 admite 'pg_cron está disponível mas não-instalado neste projeto'. vercel.json não tem "crons". image_edit_attempts registra TODAS as tentativas (inclusive failed/rejected_quality_gate) sem retenção.
- impact: Custo de storage cresce linearmente com uso (máscaras PNG de até 10 MB por edição, sketches, crops); tabelas de log incham consultas e backups. lumen_packs vencidos ficam status='active' para sempre (só cosmético — consume_nodes_v2 filtra expires_at, mas o painel billing/page.tsx lista packs por status).
- recommendation: Definir classes de lifecycle: TEMP (masks, crops, crop-masks, sketches órfãos) → apagar após 7-30 dias se não referenciados por edits/vistas; PREVIEW/tentativas failed → 90 dias; ORIGINAL/OUTPUT → permanente. Implementar com pg_cron (habilitar extensão) ou Vercel Cron chamando rota admin; agendar também o expire-lumens já pronto.
- effort: medio
- (sem verificacao adversarial)

### [P2] 9. Indice composto ausente em renders(user_id, created_at DESC) para as queries reais do historico
- files: supabase-schema.sql:44; app/api/renders/list/route.ts:20; app/app/history/page.tsx:15
- evidence: renders só tem índices separados `renders_user_id_idx (user_id)` e `renders_created_at_idx (created_at desc)` (supabase-schema.sql:44-48). As queries quentes são `.eq('user_id').lt('created_at', cursor).order('created_at desc').limit(60)` (renders/list:20-26) e a do histórico (history/page.tsx:15-20), além de `.eq('user_id').eq('ambient','video')` (video/history:24-30). Em contraste, vistas e image_edit_attempts JÁ têm compostos (idx_vistas_user, idx_iea_user_created) e as tabelas de workspace ganharam (workspace_id, created_at desc) em 20260608000001:111-115.
- impact: renders é a maior tabela do produto (todas as superfícies inserem nela). Com volume, cada paginação vira bitmap-AND ou sort de todas as linhas do usuário; latência do histórico cresce com o total de renders.
- recommendation: CREATE INDEX idx_renders_user_created ON renders(user_id, created_at DESC); considerar parcial `WHERE ambient='video'` para o carrossel do Animar; dropar renders_user_id_idx redundante depois. Adicionar também índice em profiles(email) usado pelo lookup de convite (app/api/workspaces/invites/route.ts:35).
- effort: baixo
- (sem verificacao adversarial)

### [P2] 10. Modelo de workspaces: lacunas de design para projetos compartilhados, reversao de tipo e auditoria de revisao
- files: supabase/migrations/20260608000004_workspace_invites.sql:81; supabase/migrations/20260608000003_phase2_team_usage.sql:15; supabase/migrations/20260608000001_generations_workspace_id.sql:14; app/app/equipe/membro/[userId]/page.tsx:70
- evidence: (a) spaces/packs/render_folders não têm workspace_id — só as 5 superfícies de geração (20260608000001:14-19); a página do membro filtra projetos por `spaces.user_id` (membro/[userId]/page.tsx:70), então 'biblioteca compartilhada' futura exigirá nova migração+backfill. (b) accept_workspace_invite promove o workspace para 'office' (invites.sql:81-82) mas nada o reverte para 'individual' quando o último membro sai (remove_workspace_member não toca em type). (c) review_status (phase2:15-20) não registra QUEM aprovou nem quando — para escritório isso vira requisito rápido. (d) generations.workspace_id é ON DELETE SET NULL: deletar um workspace órfão zera o vínculo do histórico de consumo, perdendo atribuição de custo retroativa.
- impact: Nenhum bug hoje, mas as evoluções prometidas (papéis finos, biblioteca compartilhada, billing por workspace) vão exigir migrações estruturais: melhor preparar agora que o volume é baixo. type 'office' permanente distorce métricas/cobrança futura por tipo.
- recommendation: Adicionar spaces.workspace_id (nullable, trigger de carimbo igual ao das gerações) já; reverter type para 'individual' em remove_workspace_member quando count(membros ativos)=1; trocar review_status por (review_status, reviewed_by, reviewed_at); considerar soft-delete de workspaces em vez de DELETE físico.
- effort: medio
- (sem verificacao adversarial)

### [P3] 11. Pagina do historico carrega folder_id de TODOS os renders do usuario a cada visita
- files: app/app/history/page.tsx:22
- evidence: `supabase.from('renders').select('folder_id').eq('user_id', user.id)` sem limit (history/page.tsx:22) — busca todas as linhas só para contar renders por pasta em JS (linhas 25-31), em paralelo com a página de 60 itens.
- impact: Transferência e memória crescem linearmente com o total de renders do usuário (usuário power com 10k renders = 10k linhas por page view); latência da página principal do histórico degrada.
- recommendation: Substituir por agregação no banco: RPC `select folder_id, count(*) from renders where user_id = auth.uid() group by folder_id`, ou head:true + count:'exact' por pasta.
- effort: baixo
- (sem verificacao adversarial)

### [P3] 12. waitlist aceita INSERT publico irrestrito (with check true) sem rate limit
- files: supabase-schema.sql:185; app/api/waitlist/route.ts:14
- evidence: `create policy "Allow public insert" on public.waitlist for insert with check (true)` (supabase-schema.sql:185-186) — além da rota /api/waitlist, qualquer anon pode inserir direto via /rest/v1/waitlist. Email é unique, mas não há validação de formato nem rate limit no nível do banco.
- impact: Vetor de spam/poluição da base de leads e de inflar storage de uma tabela sem limpeza; risco baixo (sem dados sensíveis expostos — não há policy de SELECT).
- recommendation: Restringir INSERT ao service_role (rota já existe e pode validar formato + rate limit) ou adicionar CHECK de formato de email e captcha na rota.
- effort: baixo
- (sem verificacao adversarial)
