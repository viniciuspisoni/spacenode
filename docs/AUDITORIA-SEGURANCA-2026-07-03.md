# Auditoria Defensiva de Segurança — SPACENODE (2026-07-03)

> **Metodologia:** 8 auditores especializados em paralelo (somente leitura), um por domínio — autenticação/autorização, Supabase/RLS/service-role, Nodes/custos, APIs de geração/abuso/SSRF, storage/uploads, secrets/env, billing/Stripe, hardening Next.js/Vercel + dependências. Os achados P0/P1 mais graves foram **verificados manualmente linha a linha** na sessão principal (leitura direta de `proxy.ts`, `supabase-schema.sql`, `app/api/video/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/edits/route.ts`, `lib/spaces/edit-crop.ts`, `lib/auth/privileged.ts`).
>
> **Nada foi alterado:** sem migrations, sem deploy, sem mudança de env/Stripe/Supabase. Apenas leitura + este relatório.
>
> **Limitação transparente:** os conectores MCP do Supabase e da Vercel exigiam autorização OAuth indisponível nesta sessão não-interativa. Portanto **o estado real do RLS/policies/buckets em produção não foi verificado no servidor** — a auditoria se baseia no código-fonte e nas migrations do repositório (fonte de verdade do schema versionado). Itens marcados **[verificar em produção]** precisam de confirmação via dashboard/SQL do Supabase.
>
> **Contexto de billing (respeitado):** o Stripe **ainda não está ativo** (CNPJ em abertura). A ausência do Stripe **não** é tratada como bug. Achados de billing são separados em "estado atual" e "preparação para ativação futura".

---

## 1. RESUMO EXECUTIVO

A postura de segurança do SPACENODE é **melhor do que a superfície sugere**, mas tem **buracos críticos exploráveis hoje, antes mesmo do Stripe**. O núcleo está bem construído: **toda** rota `/api` privada faz seu próprio `getUser()` + 401 (não depende só do `proxy.ts`); custo/plano/pagador/engine/resolução são derivados no servidor, nunca do frontend; o débito de Nodes é atômico (`consume_nodes_v2` com `FOR UPDATE` + `P0001`); o webhook do Stripe verifica assinatura; RPCs de crédito são `service_role`-only; e vários achados da auditoria anterior (2026-06-09) **foram corrigidos** (mask_coverage medido server-side, router do Editar nunca manda máscara para engine sem máscara, `consume_credits` legado com guard, Editar V3 com SSRF fechado e débito on-success).

**Porém**, quatro problemas **críticos** continuam abertos, a maioria exploráveis por qualquer usuário logado, **independentemente do Stripe**:

1. **RLS de `profiles` sem restrição de coluna** → qualquer usuário se concede `credits`/`plan` ilimitados via PostgREST direto do browser. Anula todo o sistema de cobrança.
2. **`/api/video` cobra DEPOIS de gerar, com o erro do débito engolido e sem refund** → vídeo (item mais caro, até 280 nodes) sai grátis por corrida ou falha.
3. **Tabela `edits` sem DDL/RLS versionada + `GET /api/edits` sem filtro por `user_id`** → potencial vazamento de edições entre usuários, **inauditável pelo repositório**.
4. **Fragmento real da `FAL_KEY` comitado em 2 docs versionados** (`docs/CLAUDE_CONTEXT.md:37`, `SPACENODE_STATUS.md:132`) → credencial de provider pago exposta no histórico do git; **rotacionar já**.

Além disso, há um conjunto **alto** que representa sangria de custo e exposição de dados: **zero rate limiting** (endpoints de IA grátis e ilimitados), **SSRF** no caminho de produção do Editar v1, **refund best-effort que nunca detecta falha** (sem ledger), **conteúdo privado de clientes em buckets públicos permanentes** sem deleção, **custo de upscale manipulável pelo cliente**, e o **Next.js 16.2.4 com advisory de bypass de middleware/proxy**.

**Veredito para lançamento:** **não lançar** ao público sem fechar os 3 críticos + os altos de segurança (SSRF, rate limit, buckets privados) e os altos de billing (idempotência do webhook) **antes de ativar o Stripe**. Os itens médios/baixos são hardening pós-lançamento.

---

## 2. PRINCIPAIS RISCOS (TOP 10)

| # | Risco | Severidade | Explorável hoje? |
|---|---|---|---|
| 1 | Auto-concessão de `credits`/`plan` via RLS de `profiles` | CRÍTICO | **Sim** (qualquer logado) |
| 2 | Vídeo grátis/subcobrado por corrida em `/api/video` | CRÍTICO | **Sim** |
| 3 | Vazamento de edições entre usuários (`edits` drift + GET sem filtro) | CRÍTICO | Condicional ao RLS de produção |
| 3b | Fragmento da `FAL_KEY` comitado em docs versionados | CRÍTICO | **Sim** (quem lê o repo/histórico) |
| 4 | SSRF autenticado no Editar v1 + helper Gemini (fetch sem allowlist) | ALTO | **Sim** (logado) |
| 5 | Zero rate limit → abuso de custo em endpoints de IA grátis | ALTO | **Sim** |
| 6 | Refund best-effort nunca checa `{error}`; sem `node_ledger` | ALTO | Sangria silenciosa |
| 7 | Conteúdo privado de clientes em buckets públicos permanentes + sem deleção | ALTO | **Sim** (por URL) |
| 8 | Custo de `/api/upscale` manipulável (megapixels vêm do cliente) | ALTO | **Sim** |
| 9 | Webhook Stripe 200-em-falha + sem idempotência (perda quando ativar) | ALTO | Depende do Stripe |
| 10 | Next.js 16.2.4 — advisory de bypass de middleware/proxy | ALTO | Contido pela auth por rota |

---

## 3. VULNERABILIDADES CRÍTICAS

### CR-1 — RLS de `profiles` permite o usuário setar `credits`/`plan` (auto-concessão de saldo e plano)
- **Arquivo:** `supabase-schema.sql:62-66` (policy `users_update_own_profile`). Ausência confirmada (grep negativo) de qualquer `REVOKE UPDATE`/`GRANT UPDATE (coluna)` em todas as migrations. Prova do caminho aberto: `app/app/generate/GenerateClient.tsx:346,378` já faz `supabase.from('profiles').update(...)` do browser com a anon key.
- **Risco:** A policy restringe a **linha** (`auth.uid() = id`), não as **colunas**. `authenticated` tem `UPDATE` na tabela inteira. Logo qualquer usuário atualiza `credits`, `plan` (e `stripe_*`) da própria linha.
- **Como abusar (geral):** Um usuário logado abre o devtools e faz um `UPDATE` na própria linha de `profiles` setando `credits` altíssimo e `plan` no topo. Passa a ter Nodes e plano ilimitados — que financiam consumo ilimitado das APIs pagas (FAL, vídeo, upscale).
- **Correção:** `REVOKE UPDATE ON public.profiles FROM authenticated;` seguido de `GRANT UPDATE (full_name, project_materials, project_config, theme_preference) ON public.profiles TO authenticated;` (mapear antes todas as colunas que o client legitimamente edita). Mantém a policy de linha; tira as colunas financeiras do alcance do PostgREST. Nada legítimo quebra — `credits`/`plan` já só são escritos via webhook/RPC service_role.
- **Prioridade:** P0 — antes de tudo. **Impacto no produto:** nenhum (correção invisível ao usuário; só fecha a brecha).
- **[verificar em produção]** se já existe um REVOKE manual não-versionado (`information_schema.column_privileges` / `\dp profiles`).
- **Nota de escalonamento futuro:** `lib/auth/privileged.ts:30-38` (`isInternalStaff`) lê `profiles.role`. Esse coluna **não existe** hoje nas migrations — então a brecha só concede saldo/plano. **Mas se um dia adicionarem `profiles.role`, esta mesma brecha vira auto-promoção a `admin`.** Fechar a coluna agora previne isso.

### CR-2 — `/api/video`: vídeo grátis/subcobrado (débito depois da geração, erro engolido, sem refund, pré-check no saldo errado)
- **Arquivo:** `app/api/video/route.ts:79-87` (pré-check lê `profiles.credits` do membro), `:123-133` (gera), `:137-153` (débito dentro de `Promise.all`, `{error}` da RPC ignorado), `:157-176` (catch sem refund).
- **Risco:** (1) o débito só ocorre **depois** da geração e o `{error}` de `consume_workspace_nodes` não é checado (o `.rpc` não lança — devolve `{error}`), então o vídeo já foi entregue; (2) o pré-check lê `profiles.credits` do **membro**, ignorando Lumens e a bolsa do pagador do workspace; (3) não há refund em falha; (4) grava `cost_credits` em vez de `nodes_charged`.
- **Como abusar (geral):** Disparar gerações concorrentes com saldo suficiente para uma só; ambas passam o pré-check, ambas geram, e o débito falho é engolido → vídeos (o item mais caro) entregues sem cobrança efetiva.
- **Correção:** Copiar o padrão de `/api/generate`: debitar **antes** via `consume_workspace_nodes` checando `{error}` (P0001→402), pré-check em `user_node_balance` (pagador), `refund_workspace_nodes` verificado no `catch`, gravar `nodes_charged`, `timeout` explícito no adapter.
- **Prioridade:** P0. **Impacto:** nenhum para o usuário honesto; fecha sangria no produto mais caro.

### CR-3 — Tabela `edits` sem RLS versionada + `GET /api/edits` sem filtro por `user_id`
- **Arquivo:** `app/api/edits/route.ts:412-431` (GET sem `.eq('user_id', user.id)`); tabela `edits` **sem `CREATE TABLE`/`CREATE POLICY` em nenhum `.sql` do repo** (grep negativo) — só é `ALTER`-ada por migrations posteriores. Idem `walkthroughs`, `shots`.
- **Risco:** O GET usa o client RLS e seleciona `edits` só com `.order().limit(60)` — a autorização depende 100% de uma RLS que **não existe no repositório** e não pode ser auditada. A projeção ainda traz `user_id` explícito.
- **Como abusar (geral):** Se a RLS de `edits` em produção estiver ausente/desabilitada/permissiva, qualquer logado chama o GET e recebe as 60 edições mais recentes de **todos** os usuários (URLs de origem/resultado + prompts).
- **Correção:** (1) adicionar `.eq('user_id', user.id)` no GET (defesa em profundidade, custo zero); (2) versionar o DDL real (`supabase db dump`) de `edits`/`walkthroughs`/`shots` + policies `auth.uid() = user_id`; (3) confirmar `ENABLE ROW LEVEL SECURITY` + policy owner-checked em produção.
- **Prioridade:** P0 (o `.eq` é imediato; o resto exige verificação). **Impacto:** nenhum (adiciona filtro esperado).
- **[verificar em produção]** estado do RLS de `edits`/`walkthroughs`/`shots`.

### CR-4 — Fragmento real da `FAL_KEY` comitado em 2 arquivos versionados
- **Arquivo:** `docs/CLAUDE_CONTEXT.md:37` e `SPACENODE_STATUS.md:132` (ambos **tracked** no git — confirmado por `git ls-files`). O valor é uma string de 45 chars no formato `<prefixo-uuid>:<32-hex>` — a metade secreta (32-hex) está completa. (Valor **não** reproduzido aqui.)
- **Risco:** Uma `FAL_KEY` autoriza geração paga de imagem/vídeo cobrada na conta. Diferente das linhas vizinhas (que são placeholders `sb_secret_.../sb_publishable_...`), a linha da FAL embute um segmento secreto real. Persiste no histórico do git mesmo após editar o arquivo.
- **Como abusar (geral):** Qualquer pessoa com acesso de leitura ao repositório ou ao histórico (colaborador, clone vazado, push público futuro) herda a credencial e pode gerar às custas da conta.
- **Correção:** **Rotacionar a FAL_KEY agora** (tratar como comprometida); substituir as 2 linhas por placeholder puro (`FAL_KEY=<sua-chave-fal>`); purgar do histórico (`git filter-repo`/BFG) se o repo for/ficar compartilhado; manter o valor real só no `.env.local`/Vercel.
- **Prioridade:** P0 (rotação imediata). **Impacto:** nenhum ao produto (a chave real continua no env).

---

## 4. VULNERABILIDADES ALTAS

### AL-1 — SSRF autenticado no Editar v1 e no helper Gemini (fetch de URL do cliente sem allowlist)
- **Arquivo:** `lib/spaces/edit-crop.ts:35-39` (`fetchImageBuffer` → `fetch(url)` cru), alcançado por `app/api/edits/route.ts`, `app/api/edits/segment/route.ts`, `app/api/edits/references/crop/route.ts` (aceitam `source_image_url`/`mask_url`/`references[].url` do body). Também `lib/gemini.ts:82-89` e `lib/ai/google/editImage.ts:60-69` (`fetchImagePart` sem allowlist). **Contraste:** o padrão correto já existe em `app/api/download/route.ts` (`ALLOWED_HOSTS`), `lib/edit-v2/pipeline.ts:51` e `lib/edit-v3/ssrf.ts:25` (`assertSafeImageUrl`).
- **Risco:** O servidor busca qualquer URL fornecida pelo cliente sem validar host/protocolo/faixa privada.
- **Como abusar (geral):** Um usuário (conta free basta) envia uma URL apontando para a rede interna ou o endpoint de metadados de nuvem (link-local); o servidor faz o fetch → varredura de rede interna / metadados.
- **Correção:** Aplicar `assertSafeImageUrl` (https + allowlist `*.fal.media` + host do Supabase, bloqueio de IP privado/link-local) em `fetchImageBuffer` e nos helpers Gemini/Google, e em toda rota v1 que aceita URL do cliente. Padrão pronto no v2/v3/download.
- **Prioridade:** P0-segurança. **Impacto:** nenhum ao usuário.

### AL-2 — Zero rate limiting (abuso de custo em endpoints de IA grátis)
- **Arquivo:** nenhum limitador em todo o app (grep `upstash|ratelimit|kv|firewall` só bate em node_modules). Grátis e ilimitados: `app/api/analyze`, `app/api/video/analyze`, `app/api/edits/segment` (SAM2), `app/api/edits/preview`, `app/api/edits/v2/detect-surface`, `app/api/vistas/[vistaId]/verify-dna`. Público floodável: `app/api/waitlist` (service-role, sem auth, sem limite, email check fraco).
- **Risco:** Rotas que gastam Gemini/SAM2/FAL/storage por request não têm teto de frequência; o débito atômico só protege as rotas **pagas** (e limita ao saldo do atacante), não as grátis. Conta free é criada de graça.
- **Como abusar (geral):** Loop de requisições às rotas grátis → custo de provider orgânico sem receita; INSERT em massa no `waitlist`.
- **Correção:** Limitador por `user.id` (e IP nas públicas) — Upstash/`@vercel/kv`, Vercel Firewall, ou contador em tabela Supabase (janela/min + teto diário); 429 amigável. Começar pelas grátis + waitlist (+ CAPTCHA/Turnstile no waitlist).
- **Prioridade:** P1. **Impacto:** transparente ao usuário legítimo.

### AL-3 — Refund best-effort nunca detecta falha; sem `node_ledger`/`ai_cost_log`
- **Arquivo:** `app/api/generate/route.ts:360-370`, `app/api/edits/route.ts:268,393`, `app/api/spaces/[spaceId]/extract-dna/route.ts:106`, `app/api/upscale/route.ts:186`, `app/api/vistas/[vistaId]/upscale`, `app/api/spaces/[spaceId]/generate` + `generate-from-sketches`, `app/api/apresentar/*`. Nenhuma migration cria `node_ledger`/`ai_cost_log`.
- **Risco:** `admin.rpc('refund_workspace_nodes', ...)` **não lança** em erro — devolve `{error}`. O `try/catch` só pega falha de rede; o refund que falha logicamente é invisível e loga "refund executado". Sem ledger, é irreconciliável. Status `refunded` nunca é gravado.
- **Como abusar:** Não é ataque — é sangria/erro silencioso: falha de geração pode debitar sem devolver, sem rastro.
- **Correção:** Helper único `refundNodes()` que cheque `{error}`, grave `refunded`/`refund_pending` e escreva no ledger. Criar `node_ledger` (com `UNIQUE(kind, job_table, job_id)` p/ prevenir refund duplo) e `ai_cost_log`, preenchidos **dentro** dos RPCs.
- **Prioridade:** P1. **Impacto:** auditabilidade financeira (invisível ao usuário).

### AL-4 — Conteúdo privado de clientes em buckets públicos permanentes + saída no CDN da FAL + sem deleção
- **Arquivo:** `supabase/migrations/20260509000000_spaces_block_1.sql:233-234` (buckets `space-mestres` e `architect-identity` com `public:true`); `createSignedUrl` = **0 usos** no repo (tudo `getPublicUrl`). Saídas em `fal.media`: `generate/route.ts:247,280`, `spaces/generate:406,415`, `video/route.ts:135`, `upscale/route.ts:154`. Nenhum `storage.remove` em nenhuma rota de deleção; sem rota de exclusão de conta.
- **Risco:** Sketches, fotos de origem, máscaras, resultados, exports e logos ficam em URLs públicas permanentes e não-revogáveis; renders/vistas/vídeo vivem só no CDN público da FAL sem SLA. Deleção de projeto/vista/pack remove só a linha do DB — os arquivos ficam órfãos para sempre e acessíveis por URL.
- **Como abusar (geral):** Qualquer vazamento de URL (compartilhamento, `Referer`, histórico, logs) dá acesso permanente ao arquivo privado, inclusive após "exclusão". Impossível atender "direito ao esquecimento" (LGPD).
- **Correção:** Mover prefixos privados para bucket **privado** + `createSignedUrl` com TTL curto; re-hospedar as saídas da FAL no Supabase; nas rotas de deleção, `storage.remove` do prefixo do usuário; adicionar cascata de exclusão de conta + cron de limpeza de órfãos.
- **Prioridade:** P1. **Impacto:** requer troca de bucket + assinatura de URL (mudança de infra, testar histórico/pack).

### AL-5 — Custo de `/api/upscale` manipulável pelo cliente (megapixels vêm do body)
- **Arquivo:** `app/api/upscale/route.ts:78-87` — `width/height` vêm do form e alimentam `computeUpscaleCost`, sem serem validados contra as dimensões reais da imagem enviada.
- **Risco:** Nos tiers sensíveis a área (custo por MP), o cliente subdeclara `width/height` para pagar o piso enquanto envia uma imagem grande (custo real alto).
- **Como abusar (geral):** Enviar dimensões minúsculas com imagem 4K → cobra o mínimo, paga-se o máximo na FAL. Margem negativa induzida.
- **Correção:** Medir MP no servidor com `sharp(file).metadata()` e ignorar `width/height` do cliente (ou usar só como piso). O `/api/edits` já faz o certo (mede a máscara server-side).
- **Prioridade:** P1. **Impacto:** nenhum ao usuário honesto.

### AL-6 — extract-dna: double-debit por double-submit (TOCTOU, guard não-atômico)
- **Arquivo:** `app/api/spaces/[spaceId]/extract-dna/route.ts:27-53` — o "guard" é um `UPDATE ... SET status='dna_extracting'` sem `WHERE status IN (...)` e sem checar linhas afetadas; o débito de 8 nodes vem depois.
- **Risco:** Dois POSTs concorrentes ao mesmo `spaceId` leem `draft`, ambos marcam `dna_extracting`, ambos debitam → 16+ nodes.
- **Como abusar (geral):** Disparar 2 requisições simultâneas → cobrança em dobro (prejudica o próprio usuário; corrupção de contabilidade).
- **Correção:** Débito idempotente com guard atômico: `UPDATE spaces SET status='dna_extracting' WHERE id=$1 AND status IN ('draft','dna_extracted') RETURNING id` e só debitar se retornou 1 linha (ou advisory lock por `space_id`).
- **Prioridade:** P1. **Impacto:** nenhum (corrige cobrança injusta).

### AL-7 — Webhook Stripe: 200 em falha de DB + sem idempotência de `event.id` *(depende do Stripe)*
- **Arquivo:** `app/api/stripe/webhook/route.ts:56-58,66-72,105-118,130-140,143` (todo erro de escrita vira `console.error` + `return 200`); sem tabela `stripe_events`. Planos usam `SET credits = nodes` (absoluto).
- **Risco:** Quando o Stripe ativar: falha transitória de DB → Stripe recebe 200, não retenta → **pagamento sem produto**. Sem dedupe, re-entrega natural re-executa `SET credits`, **restaurando saldo já gasto** (o path de Lumen é idempotente por `session_id`; plano/renovação não).
- **Correção:** Tabela `stripe_events(event_id PK)` + `INSERT ON CONFLICT DO NOTHING` no topo (sair se já processado); retornar **500** quando qualquer escrita falhar.
- **Prioridade:** P0 **antes de ativar o Stripe** (não urgente enquanto inativo). **Impacto:** perda de receita/suporte manual quando live.

### AL-8 — Next.js 16.2.4 com advisory de bypass de middleware/proxy + DoS
- **Arquivo:** `package.json:18` (`next: 16.2.4`). `npm audit` aponta **GHSA-26hh-7cqf-hhc6** (bypass de middleware/proxy via segment-prefetch, HIGH, corrigido em 16.2.6) + advisories de DoS (16.2.5) e XSS (moderado).
- **Risco:** O `proxy.ts` é o único guard declarativo de rota. Um bypass de proxy poderia alcançar rota gateada sem o redirect. **Contido** porque a API re-checa auth por rota (56/60 arquivos) e dados de página passam por RLS — mas mina a defesa que se acredita ter, e o DoS é independente.
- **Correção:** `npm i next@^16.2.6 eslint-config-next@^16.2.6` + `npm audit fix` (limpa `ws`/`protobufjs` transitivos). Bump de patch, sem mudança de código esperada.
- **Prioridade:** P1. **Impacto:** baixo risco de regressão (patch).

### AL-9 — Logs com dados sensíveis + erros crus ao cliente
- **Arquivo:** `app/api/generate/route.ts:206-251` (loga prompt + URLs de imagem do cliente + payload FAL completo); `spaces/generate:397`, `apresentar/isometric:98`, `apresentar/humanized-plan:122`, `analyze`, `video/analyze` idem. `spaces/generate:259-270` e `generate-from-sketches:180-195,231,254` retornam **mensagens de erro cru (Postgres/FAL)** no `errors[]`. `spaces/upload-sketch:71` retorna a mensagem do storage.
- **Risco:** Prompts (conteúdo de projeto do cliente) + URLs privadas em logs da Vercel; erros internos revelam schema/constraints/identificadores.
- **Como abusar (geral):** Forçar uma falha e ler o texto interno; ou quem tiver acesso aos logs vê prompts + URLs.
- **Correção:** Gate de log verboso por `NODE_ENV`/flag (nunca prompt/URL assinada em `info`); mapear erros internos para mensagens genéricas ao cliente (o `catch` do `/api/generate` já faz certo — replicar).
- **Prioridade:** P1/P2. **Impacto:** nenhum ao usuário.

---

## 5. VULNERABILIDADES MÉDIAS

- **ME-1 — Sem security headers** (`next.config.ts`, `vercel.json`, `proxy.ts` não setam nenhum). Faltam CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. O app autenticado é **framável → clickjacking** (arquiteto logado é induzido a clicar em ação destrutiva cookie-autenticada). **Correção:** `async headers()` em `next.config.ts` — começar por `frame-ancestors 'self'` + `nosniff` + HSTS (atenção ao `<script>` inline do theme-guard em `app/layout.tsx:66` → precisa nonce/hash na CSP estrita). **Prioridade:** P1/P2.
- **ME-2 — Validação de MIME só pelo `file.type` declarado** (sem magic-byte) em todas as rotas de upload (`upload-vista-mestre`, `upload-sketch`, `edits/upload-asset`, `edits/references/upload`, `finalizar/upload`, `apresentar/moodboard`). Cap de tamanho existe server-side. **Correção:** sniff de assinatura via `sharp().metadata()` e rejeitar mismatch. **Prioridade:** P2.
- **ME-3 — `maxDuration` ausente** em rotas que chamam FAL/Gemini: `edits`, `edits/segment`, `spaces/generate-from-sketches`, `extract-dna`, `vistas/[id]/verify-dna`, `vistas/[id]/upscale`, `analyze`, `video/analyze` → kill da função pode debitar sem rodar o refund. **Correção:** `export const maxDuration = 300` (ou apropriado). **Prioridade:** P2.
- **ME-4 — Sem cap de tamanho de input** (base64/prompt) em `generate`, `analyze`, `video`, `upscale` (o v2/v3 já capa em 2000 chars / 64 MP — padrão a replicar). **Correção:** limitar body/base64 e prompt. **Prioridade:** P2.
- **ME-5 — `free_fixes_used` read-modify-write não atômico** (`edits/route.ts:351-357`) → correções grátis simultâneas na mesma imagem podem ambas rodar grátis (custo USD real). **Correção:** incremento condicional atômico. **Prioridade:** P2.
- **ME-6 — Quality gate reprova, estorna, mas devolve `result_url` público utilizável** (`edits/route.ts:298-308`). **Correção:** não retornar a URL no ramo reprovado (ou preview degradado/assinado). **Prioridade:** P2.
- **ME-7 — Rotas Apresentar retornam o `prompt` interno** (`apresentar/isometric:172`, `humanized-plan:199`); `upscale` retorna `provider`/`engine`. **Correção:** remover campos internos da resposta (o v2/v3 gateia por debug — replicar). **Prioridade:** P2.
- **ME-8 — Pack share nunca verifica `password_hash`** (`app/p/[slug]/page.tsx:23-34`; coluna existe em `spaces_block_1.sql:93`, nunca lida). Todo link de pack é público (o token de 96 bits é forte, mas senha é ilusória). **Correção:** implementar o gate de senha ou remover a coluna e documentar que o link é público. **Prioridade:** P2. **[decisão do dono]**
- **ME-9 — `/api/edits/v2` com cobrança SIMULADA** (grava `cost_nodes:0`, não debita — `edits/v2/route.ts:1-16`), atrás de `EDIT_V2_ENABLED`. Se ligada em prod, é geração paga grátis. **Correção:** garantir a flag off em prod até implementar o débito. **Prioridade:** P2. **[decisão do dono]**
- **ME-10 — Bypass de sessão por header em dev** (`x-edit-v2-test-user`/`x-edit-v3-test-user`) em `edits/v2*` e `edit-v3/google`, gateado por `NODE_ENV!=='production' && !VERCEL`. Correto hoje; perigoso se rodar fora da Vercel sem `NODE_ENV=production`. **Correção:** gate por env dedicada (`EDIT_TEST_BYPASS`, default off). **Prioridade:** P2.
- **ME-11 — Sem biblioteca de validação de schema** (validação ad-hoc em 60 rotas; risco de inconsistência, não injeção — Supabase parametriza + RLS). **Correção:** adotar `zod` incremental nas rotas mutantes de maior valor. **Prioridade:** P2/P3.
- **ME-12 — Upgrade de plano cria SEGUNDA subscription** (`stripe/checkout` não checa `stripe_subscription_id` ativo) → dupla cobrança. *(Depende do Stripe.)* **Correção:** Billing Portal / `subscriptions.update` com proration. **Prioridade:** P1 antes de ativar Stripe. **[decisão do dono]**
- **ME-13 — Plano anual refila 1×/ano mas a UI vende "nodes/mês"** (`webhook:88` só em `subscription_cycle`; `BillingClient.tsx:111`). *(Depende do Stripe.)* Risco comercial/CDC. **Correção:** decidir modelo (grant anual 12×, cron mensal, ou copy). **Prioridade:** P1 antes de ativar Stripe. **[decisão do dono]**

---

## 6. VULNERABILIDADES BAIXAS

- **BX-1 — Rotas confiando só no RLS** (sem `.eq('user_id')` defensivo): `packs/[packId]` (GET/PUT/DELETE), `packs/[packId]/share`, `spaces/[spaceId]` (GET), `spaces/[spaceId]/lock`, `vistas/[vistaId]` (GET/DELETE), `vistas/[vistaId]/favorite`. **Não exploráveis hoje** (RLS presente e correta), mas defesa em ponto único. **Correção:** adicionar `.eq('user_id', user.id)` (padrão já usado em folders/finalizar/renders).
- **BX-2 — Chaves de upload previsíveis** (`vista-mestre`/`logo` usam `Date.now()` sem sufixo aleatório + `upsert:true`) → auto-sobrescrita. **Correção:** sufixo aleatório de 6 chars + `upsert:false`.
- **BX-3 — URL pública completa logada** em `spaces/generate-from-sketches:272`. **Correção:** logar só a chave/últimos N chars.
- **BX-4 — Sem `robots.txt`; `app/layout.tsx:48-51` seta `index:true` global.** Páginas `/app/*` são gateadas (não indexáveis de fato), mas share pages `/p/[slug]` são indexáveis se o link vazar. **Correção:** `app/robots.ts` bloqueando `/app/` e `/api/`; `noindex` nas share pages.
- **BX-5 — Dead/legacy:** página `app/app/theme-qa` (QA interna shipping), stub `avulso-checkout` (503), coexistência `edit-v2`×`edit-v3`, scaffolds `fix-*.sh`/`setup-generate.sh` na raiz (**`setup-generate.sh` sobrescreve `generate/route.ts` com versão pior** — loga prompt, retorna erro cru). **Correção:** remover scaffolds; remover/gatear `theme-qa`; decidir edit-v2 vs v3.
- **BX-6 — ~66 arquivos soltos na raiz não git-ignorados** (`_*.png`, `test-*.js`, `start-*.log`, `codex-dev-server.*.log`, `public/billing-subscriber-preview.html`). Risco: `git add -A` futuro comita renders de cliente/logs; o `.html` em `public/` seria **servido publicamente** se comitado. **Correção:** ampliar `.gitignore` e apagar os artefatos.
- **BX-7 — Advisories transitivos `ws`/`protobufjs`** (via `@google/genai`/`supabase-js`) — risco prático baixo (conexões só a hosts confiáveis). **Correção:** `npm audit fix`.
- **BX-8 — Flags `NEXT_PUBLIC_*` de feature no client** (`EDIT_V2`, `EDIT_V3`, `SPACES_PRESERVE_V2`, `ENABLE_GEMINI_OMNI`, etc.) — revelam roadmap, mas **não desbloqueiam comportamento server-side** (as rotas gateiam por env server como `EDIT_V2_ENABLED`). Sem brecha de bypass. **Correção:** nenhuma obrigatória; conferir que nenhuma flag NEXT_PUBLIC é a única barreira de um recurso pago.
- **BX-9 — `waitlist` com `WITH CHECK (true)`** (insert público via PostgREST; a rota já usa service_role). **Correção:** remover a policy permissiva ou manter (impacto: só poluição de leads, sem PII cross-user; sem policy de SELECT).
- **BX-10 — CTAs de compra mortos** (`GenerateClient` POST sem body → 400; `avulso-checkout` 503; `AvatarComConsumo` alert "agosto") — receita, não segurança. **Correção:** apontar para o fluxo Lumen real de `/app/billing`.
- **BX-11 — `FALLBACK_PLAN='beta'`** dá 20 free-fixes em vez de 2 (`lib/spaces/edit-free-fix.ts`). **Correção:** trocar para `'free'`.
- **BX-12 — Higiene de env/gitignore (M1/M2):** `.npm-cache*`, `.vercel-cli-data/`, `start-*.log`, `codex-dev-server.*.log` **não** estão no `.gitignore` (só no `.vercelignore`) — hoje limpos, mas um `git add -A` poderia comitar logs/tokens futuros (a Vercel CLI grava `auth.json` em `.vercel-cli-data/`). Sem `.env.example` canônico (env docs espalhados — foi por aí que a `FAL_KEY` vazou, CR-4). Log de chave mascarada em `test-integration.js:35`. **Correção:** ampliar `.gitignore`; criar `.env.example` só com nomes; logar presença booleana.

---

## 7. O QUE JÁ ESTÁ CORRETO (não regredir)

- Auth por rota: **56/60** arquivos `/api` fazem `getUser()`+401 (as 4 exceções: webhook com assinatura, stub 503, waitlist público, share por token). Não depende só do `proxy.ts`.
- Custo/plano/pagador/engine/resolução **sempre server-side**; frontend nunca é fonte de verdade para gating.
- Débito atômico `consume_nodes_v2` (`FOR UPDATE`, `P0001`); RPCs de crédito `REVOKE ... FROM anon,authenticated` + `GRANT service_role`.
- Webhook Stripe **verifica assinatura** (`constructEvent`); Lumen top-up **idempotente** por `session_id`; secrets Stripe server-only.
- `consume_credits` legado **com guard** `auth.uid()` re-aplicado; overload sem guard **dropado**.
- **mask_coverage medido server-side** (corrigido); router do Editar **nunca** manda máscara para engine `usesMask:false` (corrigido).
- **Editar V3** é o padrão-ouro: SSRF com allowlist, débito on-success atômico, custo server-side, telemetria em `edit_v3_jobs`, atrás de flag.
- `download` restrito a `fal.media` (não é open proxy). Sem CORS permissivo. Sem `.env` comitado (`.gitignore` cobre `.env*`/`*.pem`). Sem service-role em componente client. Sem secret hardcoded **no código** (a exceção é o fragmento da `FAL_KEY` em 2 **docs** `.md` — CR-4). Service-role e todas as chaves de provider lidas de `process.env` server-only; nenhum vazamento transitivo para o bundle client.

---

## 8. PONTOS QUE PRECISAM DE DECISÃO SUA

1. **Bucket privado + signed URLs (AL-4):** migrar assets privados quebra URLs existentes no histórico/packs; precisa de janela e teste. Migrar tudo ou só os prefixos mais sensíveis primeiro?
2. **Pack com senha (ME-8):** implementar o gate de `password_hash` ou remover a coluna e assumir "todo link é público"?
3. **`edit-v2` vs `edit-v3` (BX-5):** qual é o caminho de produção? Aposentar o outro reduz superfície.
4. **`theme-qa` em produção (BX-5):** remover ou gatear por `INTERNAL_STAFF_EMAILS`?
5. **Rate limit — infra (AL-2):** Upstash/`@vercel/kv`/Vercel Firewall (mais robusto) vs contador em tabela Supabase (zero dependência nova)?
6. **Ledger (AL-3):** aprovar as tabelas `node_ledger`/`ai_cost_log` (aditivas, não mudam saldo)?

## 9. PONTOS QUE DEPENDEM DO STRIPE/CNPJ

- **AL-7** (webhook idempotente + 500 em falha), **ME-12** (upgrade sem segunda subscription), **ME-13** (refil anual vs "nodes/mês") — **implementar antes de ligar o Stripe**, não agora.
- Provisionar `STRIPE_PRICE_ID_OFFICE_*` e `STRIPE_PRICE_ID_LUMEN_*` no `.env.local` **e** na Vercel antes de habilitar esses SKUs (hoje faltam → checkout retorna 500).
- Garantir que o `plan` CHECK inclua `office` em qualquer schema aplicado do zero.
- Consertar os CTAs de compra (BX-10) quando o funil de pagamento entrar no ar.

---

## 10. PLANO DE CORREÇÃO (ordem de prioridade)

> Guardrails: **nenhuma migration aplicada em produção sem sua revisão**; sem deploy; sem mudança de env/Stripe/Supabase; commits pequenos por tema; `tsc`/lint/build a cada bloco; toda mudança de RLS documentada antes/depois.

### FASE A — Críticos de auth/RLS/billing-integridade (P0, imediato)
1. **CR-1** — migration REVOKE/GRANT por coluna em `profiles` (+ mesmo tratamento em `vistas`/`renders` para `free_fixes_used`/`nodes_cost`/`review_status`). Mapear antes as colunas escritas pelo client.
2. **CR-3** — `.eq('user_id', user.id)` no `GET /api/edits`; versionar DDL+RLS de `edits`/`walkthroughs`/`shots`. **[verificar em produção]**
3. **CR-2** — reescrever `/api/video` no padrão do `/api/generate` (débito antes, `{error}` checado, refund verificado, pré-check no pagador, `nodes_charged`).

### FASE B — Storage e proteção de arquivos (P1)
4. **AL-4** — bucket privado + `createSignedUrl` para prefixos privados; re-hospedar saídas da FAL; `storage.remove` nas rotas de deleção; cascata de exclusão de conta.

### FASE C — Nodes e controle de consumo (P1)
5. **AL-3** — helper `refundNodes()` verificado + `node_ledger`/`ai_cost_log`.
6. **AL-5** — MP do upscale medido server-side.
7. **AL-6** — extract-dna com guard atômico idempotente.
8. **ME-5/ME-6/ME-9/BX-11** — free-fix atômico; não devolver `result_url` reprovado; garantir `EDIT_V2_ENABLED` off; `FALLBACK_PLAN` → `free`.

### FASE D — APIs de geração e anti-abuso (P1)
9. **AL-1** — `assertSafeImageUrl` em `fetchImageBuffer` + helpers Gemini/Google + rotas v1.
10. **AL-2** — rate limit (começar por grátis + waitlist).
11. **ME-3/ME-4** — `maxDuration` + caps de input.

### FASE E — Secrets e env (P0 para o CR-4; resto P1/P2)
12. **CR-4 — rotacionar a `FAL_KEY` e scrubar as 2 linhas dos docs** (P0, imediato); purgar do histórico se o repo for compartilhado.
13. Ampliar `.gitignore` (`.npm-cache*`, `.vercel-cli-data/`, `start-*.log`, `codex-dev-server.*.log`, `.vercel-device-flow*.json`, `_*.png`, `test-*.js`) e criar `.env.example` só com nomes/placeholders (**M1/M2**).
14. Conferir paridade de env na Vercel; **BX-8** (flags NEXT_PUBLIC não são a única barreira); nenhum secret novo no client; downgrade do log de chave mascarada em `test-integration.js:35`.

### FASE F — Hardening: headers, logs, erros, deps (P1/P2)
13. **AL-8** — bump Next ≥16.2.6 + `npm audit fix`.
14. **ME-1** — security headers.
15. **AL-9** — remover prompts/URLs/payloads dos logs; erros genéricos ao cliente.
16. **ME-2/ME-7/ME-10/BX-1..7** — MIME sniff, remover campos internos, gate do bypass, `.eq('user_id')` defensivo, robots, limpeza de scaffolds/artefatos, gitignore.

### FASE G — Preparação segura para Stripe futuro (só quando o CNPJ liberar)
17. **AL-7/ME-12/ME-13** — idempotência do webhook + 500 em falha; upgrade sem segunda subscription; decisão do refil anual; price IDs na Vercel.

### FASE H — Limpeza final + checklist de lançamento
18. Rodar lint/typecheck/build; resumo dos arquivos alterados; lista de envs a conferir (Vercel/Supabase/Stripe).

---

## 11. SECURITY LAUNCH CHECKLIST — SPACENODE

**Bloqueadores de lançamento (fechar antes do público, independentes do Stripe):**
- [ ] **Auth validado** — ✅ toda rota `/api` privada faz `getUser()`+401 (manter). Fechar CR-3 (`.eq user_id` no GET edits).
- [ ] **RLS revisado** — CR-1: `profiles` (e `vistas`/`renders`) com REVOKE/GRANT por coluna. **[verificar em produção]** RLS de `edits`/`walkthroughs`/`shots`.
- [ ] **Buckets revisados** — AL-4: `space-mestres`/`architect-identity` deixam de servir conteúdo privado por URL pública permanente.
- [ ] **Storage privado quando necessário** — prefixos privados em bucket privado.
- [ ] **URLs assinadas quando necessário** — `createSignedUrl` com TTL (hoje: 0 usos).
- [ ] **Service role só no server** — ✅ confirmado (nenhum client component o importa).
- [ ] **APIs caras protegidas** — CR-2 (`/api/video`), AL-5 (upscale server-side), AL-6 (extract-dna atômico).
- [ ] **Rate limit aplicado** — AL-2 (grátis + waitlist + rotas pagas).
- [ ] **Nodes validados no backend** — ✅ custo/plano server-side (manter); fechar CR-1 (RLS).
- [ ] **Consumo de Nodes registrado de forma segura** — AL-3: `node_ledger` + refund verificado.
- [ ] **Geração bloqueada sem saldo/permissão** — ✅ `consume_nodes_v2` P0001→402 (manter; unificar pré-check no pagador).
- [ ] **Logs sem dados sensíveis** — AL-9: sem prompt/URL/payload FAL em `info`.
- [ ] **Secrets fora do client** — ✅ service-role/keys server-only, sem `.env` comitado. **MAS CR-4:** rotacionar a `FAL_KEY` e remover o fragmento de `docs/CLAUDE_CONTEXT.md` + `SPACENODE_STATUS.md`.
- [ ] **NEXT_PUBLIC revisadas** — ✅ só anon key + URL + flags; flags não são barreira única (BX-8).
- [ ] **Erros tratados sem stack trace** — AL-9: `spaces/generate`/`generate-from-sketches`/`upload-sketch` param de vazar erro cru.
- [ ] **SSRF fechado** — AL-1: allowlist no Editar v1 + helpers Gemini.
- [ ] **Headers de segurança** — ME-1: CSP/HSTS/X-Frame-Options/nosniff.
- [ ] **Dependências revisadas** — AL-8: Next ≥16.2.6 + `npm audit fix`.

**Preparado para o Stripe (implementar ao ativar, NÃO agora):**
- [ ] Webhook idempotente (`stripe_events`) + 500 em falha de DB (AL-7).
- [ ] Upgrade sem segunda subscription (ME-12).
- [ ] Refil anual vs copy "nodes/mês" decidido (ME-13).
- [ ] Plano/crédito só via backend (✅ já é — contingente ao CR-1).
- [ ] Nunca confiar em plano/preço/assinatura/saldo do frontend (✅ já é).
- [ ] Separação clara plano ativo × saldo Nodes × Lumens × histórico × permissões (✅ já é).
- [ ] Price IDs (Office/Lumen) na Vercel + `office` no CHECK.
- [ ] **Stripe NÃO implementado nesta etapa.**

---

*Fim do relatório. Nenhuma alteração de código foi feita. Aguardando aprovação do plano de correção para iniciar pela Fase A.*
