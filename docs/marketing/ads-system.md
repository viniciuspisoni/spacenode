# SPACENODE — Sistema de aquisição / tráfego pago

> Documentação operacional do sistema de mídia paga: schema `marketing.ad_*`,
> serviços em `lib/marketing/ads/`, rotas `/api/admin/marketing/ads/*` e painel
> `/admin/marketing/ads` (staff only). Complementa
> [`integration-roadmap.md`](./integration-roadmap.md) (itens 4 e 7) e
> [`prohibited-content.md`](./prohibited-content.md) (§7 — processo).
>
> **Nada aqui está aplicado em produção neste sprint** — ver seção Deploy.

---

## 1. Visão geral e princípios

O sistema cobre o ciclo completo de aquisição paga: planejar campanha → montar
conjuntos e anúncios (matriz de experimentação) → aprovar → publicar **pausado**
no gerenciador → ativar por decisão humana → ingerir métricas → alertar,
reportar e recomendar o próximo passo.

Princípios inegociáveis, gravados no desenho (schema + workflow + service):

1. **Nada ativa gasto sozinho.** Campanha/anúncio nunca nasce ativo; `active`
   só é alcançável a partir de `published_paused`/`paused`, e essas transições
   exigem uma `ad_pending_action` com status `approved`
   (`transitionRequiresApproval` em `lib/marketing/ads/workflow.ts`). O sistema
   recomenda; quem aperta o botão de gasto é humano.
2. **First-party only.** A atribuição usa exclusivamente o cookie próprio
   `sn_attribution` + eventos gravados pelo nosso servidor. Meta Pixel e GA4
   **não estão instalados de propósito** — ver seção 4.
3. **Amostra insuficiente nunca decide.** Toda métrica derivada sai como
   `MetricValue { value, reliable, sampleNote }` (`lib/marketing/ads/metrics.ts`).
   Painel e relatório exibem o valor, mas rotulam "amostra insuficiente" quando
   `reliable=false`; `classifyAds` nunca declara perdedor por falta de dado, e
   experimento sem amostra termina `inconclusive`, não `invalidated`.
4. **Copy segue as regras editoriais.** Léxico proibido, claims falsos e módulos
   desativados (`prohibited-content.md`) valem para anúncio e landing page;
   `runAdBrandCheck` reusa `lib/marketing/brand-check.ts`.
5. **Acesso deny-by-default.** O schema `marketing` não tem policies para
   anon/authenticated; todo acesso passa pelo service-role client
   (`admin.schema('marketing')`) atrás do gate `staffOr404()` — o browser nunca
   fala com o schema.

## 2. Mapa de tabelas (schema `marketing`)

| Tabela | Papel | Chave de idempotência/único |
|---|---|---|
| `ad_channels` | Canais (meta, google_ads, …); `enabled` habilita planejamento | `slug` |
| `ad_audiences` | Personas/públicos com dores e ferramentas (matriz) | `slug` |
| `ad_campaigns` | Campanhas; status via workflow; orçamento em centavos | `identifier` (`SN_CANAL_OBJETIVO_PERSONA`) |
| `ad_sets` | Conjunto = público × orçamento dentro da campanha | `identifier` |
| `ads` | Anúncio = célula da matriz; copy + UTM + brand_check | `identifier` (vira `utm_content`) |
| `landing_pages` | LPs de campanha servidas em `/lp/[slug]`; `sections` estruturado | `slug` |
| `ad_metrics_daily` | Métricas brutas por dia/entidade (manual/CSV hoje) | `(metric_date, level, entity_id)` |
| `acquisition_events` | Funil first-party: lp_view → signup → assinatura | índice parcial: 1 `signup`/`first_generation` por usuário |
| `ad_experiments` | Hipótese → critério → conclusão → próxima ação | — (sem unique em `name`) |
| `ad_pending_actions` | Fila de aprovação humana; nada muda gasto sem ela | — |
| `ad_alerts` | Anomalias/oportunidades (recomendam, nunca executam) | dedupe no service (não recria alerta `open` igual) |
| `ad_reports` | Relatórios periódicos (markdown + dados) | — |

Derivadas (CTR/CPC/CPM/CAC/ROAS) **não são persistidas** — calculadas na
leitura para nunca divergirem da fonte.

## 3. Fluxos

### 3.1 Campanha → conjunto → anúncio → aprovação → publicação → ativação

1. **Criar campanha** (painel): nome, canal, frente, objetivo, estágio de
   funil, persona → `identifier` gerado por `buildIdentifier` (naming.ts).
   Status `draft`.
2. **Criar conjuntos e anúncios**: anúncio recebe as dimensões da matriz
   (persona/dor/promessa/formato/criativo/copy), copy dentro dos limites Meta
   (headline ≤ 40, descrição ≤ 30, botão `SIGN_UP`/`LEARN_MORE`) e destino com
   UTMs padronizados (`buildUtmParams` + `appendUtmToUrl`).
3. **Brand-check + revisão**: anúncio `draft → ready_for_review →
   pending_approval → approved`. Issue bloqueante sem registro de motivo não
   passa.
4. **Publicação manual PAUSADA**: com campanha `approved`, cria-se uma
   `ad_pending_action` (`publish_campaign`). Aprovada, o operador publica **no
   Gerenciador de Anúncios, com a campanha pausada**, cola o `external_id` no
   painel e a campanha vai a `published_paused`. Publicação via API não existe
   até haver token de System User — e quando existir, continuará criando tudo
   com status `PAUSED`.
5. **Ativação aprovada**: `published_paused → active` (ou `paused → active`)
   exige `ad_pending_action` do tipo `activate`/`resume` com status `approved`
   referenciada na chamada (`advanceCampaign`/`advanceAd` com
   `approvedActionId`). Sem ela, o service recusa. A ativação real no
   gerenciador é feita pelo humano; o status aqui espelha a decisão.
6. **Pausa/encerramento**: `active → paused/completed` não exige aprovação
   (reduzir gasto é sempre permitido).

### 3.2 Matriz de experimentos

Cada experimento (`ad_experiments`) registra: hipótese, célula da matriz
(persona × dor × promessa × formato × criativo × copy × CTA × LP × canal ×
estágio), métrica primária, critério de sucesso **numérico e verificável**
(ex.: "custo por cadastro ≤ R$ 40 com ≥ 10 cadastros"), anúncios vinculados.

Ciclo: `planned → running → validated | invalidated | inconclusive | abandoned`.
Concluir em `validated`/`invalidated` exige `conclusion` preenchida;
`inconclusive` existe para amostra insuficiente e pode voltar a `running`.
Sempre registrar `next_action` — experimento sem próxima ação é dado morto.

### 3.3 Ingestão de métricas (CSV)

Enquanto não há API de métricas, os números saem do gerenciador (export diário)
e entram pelo painel. Passo a passo:

1. No Gerenciador de Anúncios, exportar o relatório por dia no nível desejado
   (campanha, conjunto ou anúncio).
2. Converter para o cabeçalho aceito por `lib/marketing/ads/csv.ts` (ordem
   livre; separador `,` ou `;`; datas `YYYY-MM-DD` ou `DD/MM/YYYY`;
   investimento em **reais** — vírgula ou ponto decimal, "R$" tolerado):

   ```csv
   data,identificador,impressoes,cliques,investimento,leads
   2026-07-14,SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_VIDEO01_COPY02,4310,57,104.50,3
   ```

   (aliases em inglês também funcionam: `date,identifier,impressions,clicks,spend,platform_leads`)

   - `identificador`: o `SN_*` da entidade — o servidor resolve sozinho o
     nível (campanha/conjunto/anúncio) e o `entity_id` interno; linha com
     identificador desconhecido ou ambíguo é rejeitada com o número da linha.
   - `leads` é opcional (vazio = null). Máximo de 500 linhas por envio.
3. Colar/enviar no painel (aba Métricas). O upsert é por
   `(metric_date, level, entity_id)` — reenviar o mesmo dia corrige a linha,
   sem duplicar.
4. Conferir o funil no dashboard: gasto/cliques vêm do CSV; cadastros,
   ativação e assinaturas vêm de `acquisition_events` (nunca somamos
   `platform_leads` ao funil — evita dupla contagem).

### 3.4 Relatório e alertas

- **Alertas** (`lib/marketing/ads/alerts.ts` + tabela `ad_alerts`): o motor de
  regras lê os limites de `brand_rules.ads_guardrails` (meta de CAC, teto de
  gasto sem conversão, razões de CPC/CTR, mínimos de LP, fadiga, orçamento
  próximo do teto) e cria alertas `open` com os números que o sustentam.
  Alerta **recomenda**; qualquer ação decorrente vira `ad_pending_action`.
- **Relatório** (`ad_reports`): consolida período — investimento, funil,
  vencedores/perdedores (`classifyAds`), hipóteses validadas/refutadas,
  recomendação de orçamento (`suggestBudgetSplit`) e próximos testes. Métricas
  com `reliable=false` aparecem sempre rotuladas como amostra insuficiente.
- Os limiares de amostra das métricas derivadas são fixos em código
  (`DEFAULT_THRESHOLDS` em `lib/marketing/ads/metrics.ts`); os guardrails de
  ALERTA (meta de CAC, razões de anomalia etc.) vivem em
  `brand_rules.ads_guardrails` e são lidos por `loadGuardrails`.
- **Automático via Vercel Cron** (decisão 2026-07-18, não depende de nenhuma
  API do Meta): `app/api/cron/ads-alerts` roda `runAlertScan` todo dia; `app/api/cron/ads-report`
  roda `generateAdsReport` (últimos 7 dias) toda segunda — schedules em
  `vercel.json`. Ambas as rotas exigem o header `Authorization: Bearer
  $CRON_SECRET` (a Vercel injeta automaticamente quando a env `CRON_SECRET`
  existe — ver `lib/cron-auth.ts`); sem a env configurada, as rotas recusam
  qualquer chamada. Os botões "Verificar agora" e "Gerar relatório" do painel
  continuam disponíveis para rodar fora do horário do cron.

## 4. Rastreamento e LGPD

### 4.1 Como funciona (100% first-party)

- **Cookie `sn_attribution`** (first-party, 90 dias): gravado pelo nosso
  servidor quando a URL de chegada traz sinal de campanha (`utm_*`, `gclid`,
  `fbclid`). Guarda apenas parâmetros da URL, referrer, path de chegada e
  timestamps — **nenhum dado pessoal**. Estrutura: último toque sempre
  atualizado + primeiro toque preservado (`mergeAttribution` em `naming.ts`).
- **Bind no signup**: ao criar conta, o servidor lê o cookie e grava **um único
  evento `signup` por usuário** (`bindSignupAttribution`, índice parcial
  `uq_mkt_acq_signup_per_user`) — a atribuição de cadastro é imutável.
- **Eventos** (`acquisition_events`, escritos sempre pelo servidor,
  best-effort — nunca derrubam fluxo de produto): `lp_view`, `lp_cta_click`,
  `signup`, `first_generation`, `project_created`, `checkout_started`,
  `subscription_started`, `subscription_renewed`, `subscription_canceled`.
- **Ativação computada**: quando `first_generation` não foi instrumentado, a
  ativação é derivada das tabelas de produto (renders/vistas por `user_id` dos
  cadastros do recorte) na leitura do funil — sem rastreador extra.

### 4.2 Situação jurídica — ATENÇÃO antes de escalar

A cláusula 7 de `/privacidade` hoje afirma: **"Não usamos cookies de
publicidade nem rastreadores de terceiros"** e promete atualizar a Política
antes de qualquer mudança. O cookie `sn_attribution` é first-party e não é
rastreador de terceiros, mas é um cookie ligado a publicidade — **a Política
deve ser ATUALIZADA para citá-lo explicitamente antes de escalar campanhas**.

Rascunho sugerido para a cláusula 7 (revisar com o responsável jurídico):

> Usamos apenas o essencial para a plataforma funcionar: cookies de sessão
> para manter você autenticado, armazenamento local do navegador para
> preferências de interface (como o tema) e um cookie próprio de atribuição de
> campanha (`sn_attribution`), que guarda por até 90 dias os parâmetros da
> campanha que trouxe você ao site (como `utm_source` e `utm_campaign`), o
> endereço da página de origem e a data do acesso. Esse cookie é nosso
> (first-party), não contém dados pessoais e não é compartilhado com
> terceiros. **Não usamos cookies de publicidade de terceiros nem rastreadores
> de terceiros.** Se isso mudar, esta Política será atualizada antes e, quando
> exigido, o seu consentimento será solicitado.

**Meta Pixel e GA4 não estão instalados de propósito.** Instalar qualquer
rastreador de terceiros exige, nesta ordem: (1) atualização prévia da cláusula
7 da Política de Privacidade, (2) banner de consentimento (hoje não existe —
e os docs jurídicos prometem "sem rastreadores"), (3) decisão explícita do
dono. Sem os três, a resposta é não. Consequência aceita: as plataformas
otimizam sem sinal de conversão do site — a leitura de verdade é o funil
first-party deste sistema.

## 5. Integrações e credenciais

### 5.1 Meta Marketing API (canal `meta`) — DECISÃO: gestão manual

**2026-07-18: a gestão de campanha no Meta fica MANUAL no Gerenciador de
Anúncios.** A conta de negócios (`pisonihub`, vinculada ao Instagram do
SpaceNode) não tem um perfil pessoal com acesso liberado ao Meta for
Developers, então criar o app/token de System User ficou bloqueado. O sistema
**não depende disso para funcionar** — a regra de ouro já era "campanha sobe
sempre pausada, ativação é humana"; sem o token, o fluxo é:

1. Planeje a campanha/anúncio no painel → gere copy (IA ou manual) → brand
   check → pegue o **identificador + link com UTM** que o sistema monta.
2. Crie e publique manualmente no Gerenciador de Anúncios, usando essa copy e
   esse link, sempre pausado.
3. Ative manualmente lá quando decidir (a fila de aprovação do painel segue
   existindo como governança interna — não aciona nenhuma API do Meta).
4. Exporte o CSV de desempenho do Meta periodicamente e cole no painel (§3.3)
   — dali em diante tudo (funil, CAC, ROAS, alertas, relatório) é automático.

Cliente em `lib/meta/ads.ts` (Graph v25.0) e adapter em
`lib/marketing/ads/channels.ts` continuam no repo, prontos para o dia em que
alguém com um perfil pessoal liberado (ou uma conta de negócios já verificada)
quiser reativar a automação de leitura/diagnóstico. Envs (opcionais; não
bloqueiam nada enquanto ausentes):

| Env | O que é |
|---|---|
| `META_ACCESS_TOKEN` | Token de System User (longa duração) |
| `META_AD_ACCOUNT_ID` | Conta de anúncios (com ou sem `act_`) |
| `META_PAGE_ID` | Página do Facebook vinculada ao Instagram |
| `META_IG_ACCOUNT_ID` | Conta profissional do Instagram |
| `META_APP_ID` / `META_APP_SECRET` | App na Meta (debug de token + `appsecret_proof`) |

Se um dia isso for retomado: `business.facebook.com` → Usuários do sistema →
gerar token com escopos `ads_read` (+ `ads_management` só se for automatizar
publicação) → validar com `test-meta-connection.mjs` (raiz do repo).
`publishCampaignPaused` do adapter lança erro orientando publicação manual —
comportamento intencional, não um bug a corrigir.

### 5.2 Google Ads (canal `google_ads` — futuro)

Planejado (roadmap item 7; depois do processo Meta maduro). Vai exigir:
developer token (conta de administrador), credenciais OAuth no Google Cloud +
refresh token da conta gestora e o customer id. Mesmas regras: criação pausada,
ativação com ação aprovada, `utm_medium=cpc`.

### 5.3 IA de apoio

`MARKETING_AI_PROVIDER` (lib/marketing/generation.ts) escolhe o provider de
geração de briefs — vazio = `gemini` (requer `GEMINI_API_KEY`, a mesma chave
do produto). Saída de IA entra sempre como rascunho para revisão humana.

## 6. Deploy

**Status em 2026-07-18: as 4 migrations já foram aplicadas em produção**
(projeto Supabase `nucyyqmurhnakhldshwr`, via MCP) e o schema `marketing` já
foi exposto no PostgREST (Integrations → Data API → Settings → Exposed
schemas) — confirmado com teste real (chave `anon` recebe `401 permission
denied` — schema reconhecido, acesso corretamente negado; chave `service_role`
lê os dados). O que falta é **shipar o código** (nada disso existe em produção
ainda — só o banco). Checklist para quando o código for para o ar:

1. ~~Aplicar as 4 migrations do schema `marketing`~~ ✅ feito
2. ~~Expor `marketing` em Exposed schemas~~ ✅ feito
3. Vercel: cadastrar `CRON_SECRET` (gerar com `openssl rand -hex 32`) — sem
   ele, `/api/cron/ads-alerts` e `/api/cron/ads-report` recusam qualquer
   chamada (fail-closed) e os crons do `vercel.json` sempre retornam 401.
4. Vercel: cadastrar `META_*` só se um dia a automação Meta for retomada
   (hoje a gestão é manual — §5.1); fazer **redeploy** depois de qualquer env
   novo — env sem redeploy não vale (política do projeto).
5. Deploy do código (branch/PR).

Ambientes locais que ainda não têm `marketing` exposto (ex.: `spacenode-dev`)
continuam funcionando: o painel degrada para vazio, `/lp/*` responde 404, e
`/api/marketing/track` devolve `{ok:false}` — nada quebra por trás.

Publicar landing page (`landing_pages.status = published`) é ação humana no
painel — o seed cria tudo como `draft`.

## 7. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Rotas admin devolvem 406 / erro PostgREST `PGRST106`/`42P01` | Schema `marketing` não aplicado ou não exposto | Aplicar migrations na ordem da seção 6 e conferir Exposed schemas |
| Painel abre com aviso de modo degradado (`degraded` no dashboard) | Mesmo caso acima — `getAdsDashboardData` é best-effort e devolve estrutura vazia em vez de quebrar | Resolver o item anterior; o aviso some sozinho |
| Diagnóstico do canal Meta falha com "Token inválido ou expirado" | Token revogado/regenerado ou app com "Require App Secret" sem `META_APP_SECRET` | Regerar token de System User; preencher `META_APP_SECRET` |
| Eventos de aquisição não aparecem | Rotas públicas de evento são rate-limitadas e **fail-open**: sob falha do limiter ou do insert, o fluxo de produto segue e o evento é descartado com `console.warn` | Conferir logs do servidor; perda pontual é aceitável por desenho — nunca travar produto por telemetria |
| CSV rejeitado com "identificador desconhecido" | `identifier` não bate com `ad_campaigns`/`ad_sets`/`ads` | Conferir o identificador exato no painel (é case-insensitive na normalização, mas precisa existir) |
| Cadastro sem atribuição | Usuário chegou sem `utm_*`/`gclid`/`fbclid` (direto/orgânico) ou cookie expirou (90 dias) | Esperado — atribuição first-party não cobre 100%; o funil trata como orgânico |
