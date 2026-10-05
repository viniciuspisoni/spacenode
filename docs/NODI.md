# Nodi — assistente da plataforma (V1 + V2)

> V1 implementada em 2026-07-17 (flag `NODI_ENABLED`); V2 (copiloto agentic)
> no mesmo dia, atrás de flags próprias — ver a seção **V2** ao fim. Este
> documento é a referência de manutenção: arquitetura, base de conhecimento,
> provedores de IA, tools, custos, variáveis e pendências.

O Nodi orienta o usuário dentro do `/app`, responde dúvidas recorrentes,
diagnostica problemas de geração e — quando não resolve — prepara um chamado
completo para o suporte, com confirmação explícita do usuário antes do envio.

## Arquitetura

```
lib/nodi/
  flags.ts            NODI_ENABLED (lido no servidor; sem NEXT_PUBLIC de propósito)
  types.ts            contratos compartilhados (client-safe)
  context.ts          rota → módulo/projeto/vista (puro; usado por painel e rotas)
  redact.ts           redação de segredos/stack/URLs assinadas (puro)
  known-issues.ts     erro bruto → problema conhecido (causa/sugestão/prioridade)
  knowledge/
    index.ts          motor de matching (normalização, score, thresholds)
    entries.ts        CONTEÚDO da base — uma entrada por assunto
  diagnostics.ts      consulta gerações (renders/edits/edit_v3_jobs/vistas) + relatório
  tickets.ts          serviço de chamados (validação, saneamento, Supabase)
  telemetry.ts        eventos sem conteúdo sensível (whitelist dura)
  provider/
    types.ts          interface NodiAiProvider (camada independente de fornecedor)
    gemini.ts         provedor Gemini (reusa lib/gemini)
    index.ts          resolução por env NODI_AI_PROVIDER

app/api/nodi/
  bootstrap/route.ts  GET  sugestões + FAQ do módulo atual
  ask/route.ts        POST pergunta → base (forte) → IA (ancorada) → franqueza
  diagnose/route.ts   GET  gerações recentes · POST diagnóstico de uma geração
  tickets/route.ts    POST cria chamado · GET lista (próprios; ?all=1 p/ staff)
  telemetry/route.ts  POST evento de uso (whitelist)

components/nodi/
  NodiRoot.tsx        casco: botão flutuante, abrir/fechar, Esc/foco, contexto
  NodiPanel.tsx       painel: home, chat, fluxo de problema, revisão, chamados
  NodiAvatar.tsx      símbolo próprio (losango de 4 nós) com estados animados
  nodi-client.ts      wrappers de fetch (contrato {ok} único)

supabase/migrations/20260717120000_nodi_assistant.sql   nodi_tickets + nodi_events
tests/nodi/*.test.ts                                     vitest (npm test)
```

Estilos: seção "Nodi" no fim de `app/globals.css` — tokens semânticos (claro e
escuro automáticos), hairline 0.5px, raio 14px, verde apenas funcional (nó de
sucesso do avatar e botão de confirmação do chamado).

### Fluxo de resposta (`/api/nodi/ask`)

1. Clique em sugestão/FAQ (`kbId`) → resposta determinística da base.
2. Pergunta livre com score forte na base (≥ `KB_STRONG_SCORE`) → base.
3. Provedor de IA configurado → responde ANCORADO nos candidatos da base
   (nunca inventa valor/recurso; o prompt exige JSON com confiança).
   Erro do provedor cai no passo 4 — nunca vira erro para o usuário.
4. Sem resposta segura → o Nodi diz isso com franqueza e oferece o fluxo de
   problema/suporte. Nada de resposta inventada.

### Identidade visual

O símbolo do Nodi é um losango de 4 nós conectados em ciclo — mesma gramática
do "N" da constelação oficial (nós r=3, traço 1.5, monocromático), arranjo
próprio. O logotipo oficial (`components/brand`) não foi tocado. Estados:
`idle` (respiração do nó superior), `thinking` (pulso percorrendo o ciclo),
`success` (nó superior em verde funcional), `muted` (linhas tracejadas —
indisponível), `error` (esmaecido). `prefers-reduced-motion` desliga tudo.

## Como atualizar a base de conhecimento

Tudo em **`lib/nodi/knowledge/entries.ts`** — nunca espalhar resposta fixa por
componente. Cada entrada:

```ts
{
  id: 'custo-video',                  // estável (telemetria referencia)
  title: 'Quanto custa animar?',      // como aparece no FAQ/sugestão
  keywords: ['video custo', …],       // termos normalizados (sem acento)
  patterns: [/quanto custa/],         // regex contra a pergunta normalizada (+6)
  modules: ['animar'],                // boost (+3) e sugestão nesses módulos
  faq: true,                          // entra na lista de dúvidas frequentes
  suggest: true,                      // candidata a chip de sugestão
  build: () => ({ text, actions }),   // resposta SEMPRE construída na hora
}
```

Regras:

- **Números vêm de import** (`lib/plans`, `lib/engines`, `lib/video/models`,
  `lib/extra-nodes`, `lib/support`) — nunca digitados. Se o valor não é importável
  (ex.: nodes de cortesia do cadastro, DEFAULT de coluna), a resposta fica
  qualitativa (regra de marca: não citar número sem fonte no código).
- Voz do manual da marca: direto, específico, sem hype, sem emoji, sem jargão
  de IA. Só recursos ativos em produção.
- Ações permitidas (`NodiAction`): `navigate` (rota interna), `link` (nova
  aba), `whatsapp`, `copy`, `start-problem`. Nada destrutivo/cobrável.
- Erros novos do produto entram em `lib/nodi/known-issues.ts` (padrão regex →
  causa/sugestão/prioridade).
- Depois de editar: `npm test` (tests/nodi cobrem matching e conteúdo dinâmico).

## Como plugar outro provedor de IA

1. Criar `lib/nodi/provider/<nome>.ts` implementando `NodiAiProvider`
   (`answer(input) → { text, confidence, needsSupport }`). O `input` traz a
   pergunta, o contexto de página, o histórico truncado e os candidatos da
   base (grounding). Ver `gemini.ts` como referência — inclusive o prompt com
   as regras duras (não inventar, PT-BR, escopo da plataforma).
2. Registrar o case em `lib/nodi/provider/index.ts`.
3. Configurar `NODI_AI_PROVIDER=<nome>` no ambiente (+ chave que o provedor
   precisar). Paridade de env na Vercel + redeploy.

Sem provedor configurado, o Nodi continua funcionando 100% determinístico
(base de conhecimento + fluxo de problema) — é o fallback permanente.

## Chamados

- Tabela `nodi_tickets` (RLS: usuário insere/lê só os próprios; triagem via
  service_role). Protocolo humano `ND-<seq>`.
- O rascunho passa por `buildTicketRow`: whitelist de contexto, redação de
  segredos, clamps. A transcrição (≤12 turnos, ≤400 chars cada) só vai após o
  usuário revisar o resumo e confirmar.
- Canal externo existente: WhatsApp do suporte (`lib/support`) — após criar,
  o painel oferece enviar o protocolo/resumo por lá.
- Consulta: usuário vê os próprios em "Meus chamados" (painel). Suporte lista
  todos via `GET /api/nodi/tickets?all=1` (gate `isInternalStaff`) — base para
  um painel admin futuro.

## Telemetria

`nodi_events` — política dura: **nenhum texto livre do usuário**. Só evento da
whitelist (`panel_open`, `question_asked`, `answer_kb/ai/none`,
`problem_flow_started`, `diagnose_run`, `ticket_created`, `action_clicked`,
`provider_error`), rota, módulo e slugs (`kb`, `confidence`, `category`…).
Deny-all no browser; só rotas gravam (admin client). Inerte até a migration.

## Segurança e privacidade

- Redação **no servidor** (`lib/nodi/redact.ts` + `known-issues.ts`): erro
  bruto de provider, chaves, tokens, env vars, URLs assinadas e stack traces
  nunca chegam ao painel nem ao chamado — o usuário recebe o problema
  conhecido mapeado; o suporte usa o `generation_id` no caminho privilegiado
  já existente (`/api/history/detail`).
- Diagnóstico consulta com o client do usuário (RLS) + filtro por `user_id` —
  dado de outro usuário não entra.
- Rate limit por usuário em todas as rotas (helper `lib/rate-limit`, fail-open).
- Rotas retornam 404 com o flag desligado.

## V2 — copiloto agentic

### Arquitetura

```
lib/nodi/v2/
  flags.ts          5 flags + gate de internos (isNodiV2EnabledFor)
  types.ts          envelope NodiV2Answer + artefatos (análise/plano/prompt/
                    recomendação/proposta/memória/pré-voo)
  validate.ts       validador de schemas (args de tools; specToJsonSchema)
  budget.ts         limites por request (6 etapas, 8 tools, 2 visões, 45s,
                    900 tokens/turno) + min/dia/mês via rate_limits +
                    circuit breaker (3 falhas → 90s aberto)
  llm.ts            sessão function-calling (@google/genai) — API key OU Vertex
  system-prompt.ts  persona + método + regras anti-injection (wrapUntrusted)
  context-pack.ts   contexto estruturado do request (rota/módulo/saldo/anexo)
  memory.ts         memória por projeto (nodi_project_memory, RLS)
  images.ts         kind+id → URLs da linha DO usuário (nunca URL do modelo)
  orchestrator.ts   loop: modelo → tools → modelo → texto + artefatos
  tools/            registry + leitura + visão + ação

app/api/nodi/v2/chat    orquestrador (atalho KB → agentic → fallback V1)
app/api/nodi/v2/memory  leitura/gravação confirmada da memória de projeto
```

**Fluxo do chat:** flags/gate → budget (min/dia/mês) → atalho determinístico
(match forte na base, sem imagem = custo zero de LLM) → orquestrador →
fallback V1 em qualquer falha (breaker aberto, timeout, erro do provedor) —
o usuário sempre recebe resposta.

### Modelos e custos

| Uso | Modelo | Notas |
|---|---|---|
| Orquestrador | `gemini-2.5-flash` (`NODI_V2_MODEL`) | thinking 0, ≤900 tokens/turno, temp 0.2 |
| Visão (tools) | `gemini-2.5-flash` via `lib/gemini` | só quando a tool é chamada; ≤2 por request |

Referência de preço (2026): flash ≈ US$0,30/1M entrada · US$2,50/1M saída;
imagem conta como entrada (~250–500 tokens típicos por imagem 1080p). Pior
caso por request (6 turnos + 2 visões) ≈ US$0,01–0,03. Tetos por usuário:
`NODI_V2_DAILY_LIMIT` (80) e `NODI_V2_MONTHLY_LIMIT` (1200) — janelas do
rate_limits, fail-open. Telemetria de tokens em `nodi_events` (`v2_chat`).

### Tools (18)

Leitura: `consultar_contexto`, `consultar_projeto`, `consultar_geracao`,
`listar_historico`, `consultar_engines`, `consultar_modulos`,
`consultar_saldo_custos`, `consultar_documentacao` (base de conhecimento),
`consultar_erros_conhecidos`, `consultar_memoria_projeto`†.
Visão‡: `analisar_imagem`, `comparar_imagens` (original × resultado).
Ação (viram cards; usuário confirma): `recomendar_configuracao`,
`criar_prompt`, `montar_plano`, `preparar_chamado`, `propor_acao`§,
`propor_memoria`†.

† só com `NODI_PROJECT_MEMORY_ENABLED` · ‡ só com `NODI_MULTIMODAL_ENABLED`
· § só com `NODI_SUPERVISED_ACTIONS_ENABLED`. Tool desligada nem entra no
toolset (o modelo não a vê).

Regras duras das tools: argumento do modelo passa por `validate.ts` (uuid,
enums, clamps) antes do handler; consultas usam o client do usuário (RLS) +
`eq(user_id)`; navegação só em rotas da whitelist; custo de pré-voo vem das
tabelas reais (`lib/engines`, `lib/video/models`) e o saldo de
`getPayerBalance`; imagem nunca chega por URL do modelo (kind+id → linha
própria → `fetchStorageBytes` com allowlist anti-SSRF).

### Ações supervisionadas

Toda ação é PROPOSTA num card; a execução confirmada usa o handoff
`spn:nodi:handoff:v1` (sessionStorage) + navegação — o módulo de destino lê no
mount e pré-preenche. Consumidores implementados: **Renderizar** (engine,
resolução, direção de refino) e **Editar V3** (instrução). Animar fica pra
adoção incremental: o estado é preset-driven (VideoTypePresets/DurationSelector
etc.) — mapear o handoff exige mexer no state machine do painel, não só num
campo. `start_generation` mostra o pré-voo (módulo, motor, config, imagem,
prompt, custo, saldo, riscos) e, confirmado, apenas abre a ferramenta
preenchida — **o débito de nodes continua acontecendo só no botão real do
módulo**. O pré-voo herda settings/prompt propostos antes no mesmo pedido
(`ToolScratch`) — achado do smoke real: o modelo não repete settings entre
tools.

### Smoke com LLM real

`scripts/smoke-nodi-v2.mjs` — valida o loop completo com Gemini de verdade
(function calling → tools → resposta), com userId sintético (nenhum dado real
lido) e sem visão. DRY-RUN por padrão; executar:
`node --import ./scripts/_qa-alias-register.mjs scripts/smoke-nodi-v2.mjs --approve-paid-call`
(≈ <US$0,01). Rodado em 2026-07-17: 2/2 cenários OK (~3s cada, ~5-7k tokens
de entrada, 90-230 de saída).

### Segurança

- Modelo nunca toca banco/Storage/credenciais — só tools.
- Anti-injection: contexto/resultados demarcados (`wrapUntrusted`), regra
  explícita para texto dentro de imagens, artefatos validados server-side.
- Isolamento: RLS + `eq(user_id)` em toda leitura; memória por projeto com
  policies próprias; testes em `tests/nodi/v2-isolation.test.ts`.
- Custo: budget por request + min/dia/mês + circuit breaker + modelo
  econômico com atalho determinístico; multimodal só sob flag e por tool.
- Telemetria: nunca imagens nem conversas — só contagens (`tools`, `vision`,
  `tokens_in/out`, `duration_ms`) e feedback binário (`answer_feedback`).

### Variáveis (.env.example)

`NODI_V2_ENABLED`, `NODI_INTERNAL_USERS_ONLY` (default FECHADO),
`NODI_MULTIMODAL_ENABLED`, `NODI_PROJECT_MEMORY_ENABLED`,
`NODI_SUPERVISED_ACTIONS_ENABLED`, `NODI_V2_MODEL`, `NODI_V2_USE_VERTEX`
(+ envs `GOOGLE_VERTEX_*` já existentes), `NODI_V2_DAILY_LIMIT`,
`NODI_V2_MONTHLY_LIMIT`.

### Checklist de ativação interna

1. ~~Aplicar migrations~~ **FEITO 2026-07-17** (dev `spacenode-dev` + prod):
   `nodi_assistant`, `nodi_v2_project_memory` e também `rate_limits`
   (20260703160000 — estava criada no repo e NÃO aplicada em prod; todos os
   rate limits e os tetos dia/mês da V2 rodavam fail-open até aqui).
2. Conferir `INTERNAL_STAFF_EMAILS` no ambiente (gate de internos).
3. Ligar em dev: `NODI_ENABLED=1 NODI_V2_ENABLED=1` (+ `GEMINI_API_KEY` já
   existente). Testar: pergunta livre, "montar um plano", análise de imagem
   (ligar `NODI_MULTIMODAL_ENABLED=1`), pré-voo (ligar
   `NODI_SUPERVISED_ACTIONS_ENABLED=1`), memória (após migration, ligar
   `NODI_PROJECT_MEMORY_ENABLED=1`).
4. Vercel: paridade de envs + redeploy. Manter `NODI_INTERNAL_USERS_ONLY`
   sem valor (fechado) até validar com a equipe.
5. Acompanhar `nodi_events` (v2_chat/v2_fallback/answer_feedback) por alguns
   dias antes de considerar abrir (`NODI_INTERNAL_USERS_ONLY=0`).

## V3 — execução direta pelo chat (2026-07-18)

Flag `NODI_V3_EXECUTE_ENABLED` (exige ações supervisionadas ligadas). Com ela,
`propor_acao start_generation` no Renderizar com ORIGEM (geração/vista do
usuário, ou a imagem anexada) + projeto (interior|exterior) + custo computável
vira **execução direta**: o servidor assina uma intent (HMAC, 10min, usuário +
payload + custo — `lib/nodi/v3/intents.ts`) e o card ganha "Confirmar e gerar".
A confirmação (clique ou "sim"/"pode"/"confirma" digitado) chama
`/api/nodi/v3/execute`, que verifica a intent e faz uma chamada SERVER-SIDE ao
`/api/generate` com os cookies do próprio usuário — reusa o pipeline inteiro
(validações, débito atômico, estorno, histórico). O resultado aparece no chat
(URL assinada) com atalho pro Histórico. Telemetria: `v3_executed` {cost}.
Rate limit: 10 execuções/hora/usuário.

Invariantes que a V3 NÃO quebra: custo sempre explícito antes; débito só após
confirmação; nada de caminho paralelo de cobrança; intent adulterada/vencida/
de outro usuário é recusada (tests/nodi/v3-intents.test.ts).

Limites atuais: só Renderizar executa (Ampliar/Animar seguem via pré-voo +
ferramenta preenchida — próximos candidatos, mesmos moldes); a origem precisa
ser uma geração existente (upload novo continua na página da ferramenta).

## Pendências e decisões em aberto

1. ~~Migration não aplicada~~ — **RESOLVIDO 2026-07-17**: `nodi_assistant`,
   `nodi_v2_project_memory` e `rate_limits` aplicadas em dev e prod (via MCP;
   os arquivos em supabase/migrations são a fonte). Chamados, telemetria,
   memória e tetos de uso estão operacionais.
2. **Flag desligado** — ligar com `NODI_ENABLED=1` (dev primeiro; Vercel +
   redeploy depois).
3. **IA desligada** — decisão de custo/fornecedor em aberto. Ligar =
   `NODI_AI_PROVIDER=gemini` (reusa `GEMINI_API_KEY` já existente). Custo
   estimado baixo (gemini-2.5-flash, ~450 tokens de saída por pergunta livre).
4. **Painel admin de chamados** — V1 entrega o endpoint staff (`?all=1`);
   UI dedicada fica para quando houver volume.
5. **Enriquecimento por página** — o evento `spn:nodi:context`
   (`NODI_CONTEXT_EVENT`) permite a uma ferramenta registrar engine/config
   selecionadas; nenhuma página dispara ainda (adotar aos poucos).
6. **Custos por ferramenta não importáveis** (Editar/Ampliar) — respostas
   qualitativas de propósito; se esses módulos exportarem tabela estática de
   custo um dia, importar em `entries.ts`.

## V4 — copiloto central (2026-07-18)

**Modos de autonomia** (`nodi_user_settings`, seletor no painel, default copiloto):
consultor (analisa/recomenda, propor_acao nem entra no toolset) · copiloto
(prepara e aguarda aprovação) · **autopiloto** (executa sozinho DENTRO dos
limites por ação/por dia; fora deles a proposta espera confirmação). O
servidor revalida os limites (`checkAutoAllowance` + gasto do dia somado de
`nodi_events`) — o client nunca compra autonomia.

**Memória de série**: com projeto aberto, estilo/materiais/iluminação/travas/
decisões e o Plano do Projeto entram no contexto do modelo automaticamente
(regra dura no prompt: nunca perguntar o que já se sabe).

**Avaliação pós-geração** (`lib/nodi/v4/review.ts`): toda execução (manual ou
autopiloto) dispara comparação original × resultado e uma decisão
determinística — aprovar · editar_local · melhorar · regenerar · decidir —
com a regra "não regenerar quando correção localizada resolve". O card do
resultado mostra achados + botão do próximo passo. Desligável em
`auto_review`.

**Próxima melhor ação** (`lib/nodi/v4/next-action.ts`): regras puras no
bootstrap (falha recente → diagnóstico; saldo baixo → planos; render sem
ampliação → Ampliar; sem vídeo → Animar; conta nova → Renderizar), sempre no
formato identifiquei → ação → porquê → custo → precisa aprovação. Card
"Próximo passo" no home do painel.

**Plano do Projeto** (`nodi_project_memory.plan` + tool
`propor_plano_projeto`): objetivo + etapas com módulo/status/custo, proposto
pelo Nodi e confirmado pelo usuário; view própria no painel com a próxima
decisão. **Ações do Nodi**: registro revisável (`/api/nodi/v4/activity`,
lendo `nodi_events` sanitizado) com execuções (auto ou confirmadas), memórias
e chamados.

Migration `20260718120000_nodi_v4_autonomy.sql` — APLICADA em dev+prod.
Pendências V4: próxima ação por módulo (embutida nas ferramentas), execução
de Ampliar/Animar no autopiloto, edição de status das etapas do plano na UI.


## Evolução de jornada — 02/10/2026 (preparada para revisão)

A auditoria do código confirmou três camadas existentes: suporte/FAQ (V1),
orquestrador com ferramentas, análise e memória (V2), e execução de render
supervisionada/autopiloto limitado (V3/V4). O painel mantém conversa em
sessionStorage, não uma conversa durável entre dispositivos. A execução direta
hoje cobre Renderizar; edição, ampliação e animação podem receber propostas e
preenchimento nas telas, mas não devem ser anunciadas como executadas pelo chat.
A seleção de anexo usa gerações existentes, sem upload inicial direto no chat.
As capacidades continuam sujeitas às flags e ao gate de usuários internos.
Esta revisão não altera flags, planos, cobrança, permissões nem schema.

### Implementação desta etapa

- `lib/nodi/journey.ts`: jornada determinística da conta: preparar a entrada,
  acompanhar geração, diagnosticar falha, revisar imagem ou conferir vídeo para
  apresentação. Status concluído não comprova aprovação ou entrega. A origem é
  o histórico recente da conta, não somente o Space aberto.
- `readRecentGenerations`: mantém sinal de indisponibilidade de qualquer fonte;
  consulta parcial nunca é descrita como conta nova. Client autenticado e filtro
  `user_id` continuam obrigatórios, com fallback de colunas existente.
- Bootstrap entrega cartão de próxima etapa, sem cache privado. O mesmo estado
  entra no contexto do orquestrador e em `consultar_jornada` sem depender de uma
  decisão do modelo de buscar essa informação.
- Resultados e imagens selecionadas mantêm referência por kind/id na conversa;
  a referência não cruza Spaces. Resolução das imagens continua server-side por
  dono da geração. Manter referência não dispara análise visual automaticamente.
- Histórico inclui resultados executados e direção/configuração propostas,
  limitados a oito turnos de até 700 caracteres. Não inclui URL da imagem nem
  token de execução. Texto/dados continuam demarcados como não confiáveis.
- Pedidos de ação e continuação não são desviados para FAQ; respostas
  determinísticas exigem correspondência forte e distância da segunda candidata.
- Confirmação textual de uma ação exige frase completa reconhecida. "Sim, mas
  não gere ainda" e "ok quanto custa?" não executam a proposta pendente.
- O cartão se atualiza após uma execução confirmada. Resultados completos
  priorizam revisão, sem sugestão automática de nova despesa.

### Validação e implantação

Validação local concluída: 152 testes passaram (Nodi e base compartilhada do
WhatsApp), verificação de tipos e lint dos arquivos alterados sem erros. Os testes usam dados fictícios e modelo simulado; não
comprovam qualidade de respostas do provedor real nem entrega em produção.
Esta etapa está somente no branch local `codex/nodi-journey` até autorização
específica para publicar estes novos arquivos no repositório público. Não ampliar
o gate de usuários nem iniciar gerações pagas como parte da instalação.
Após publicação, testar com uma conta autorizada: objetivo inicial, revisão de
imagem própria, pedido de ajuste, confirmação explícita e resultado no Histórico.

### Próximas etapas para assistência de ponta a ponta

1. Upload inicial no chat com validação de imagem, isolamento de Storage e
   vínculo com projeto/vista: prepara a primeira geração sem exigir histórico.
2. Registrar aprovação/rejeição explícita da versão, relacionar entrada e
   derivados e acompanhar execução sem confundir imagens de outros projetos.
3. Conversa durável por conta e projeto, com retomada entre dispositivos e
   política de retenção; a memória de decisões atual continua confirmada.
4. Integrar os executores reais de edição, ampliação e vídeo ao mesmo pré-voo,
   reservas de execução e cobrança existentes; evitar caminhos paralelos.
5. Avaliar qualidade com cenários completos de interiores/exteriores, recuperação
   de falha e encaminhamento humano. Expandir acesso apenas após teste controlado.


### Print direto no chat (2026-10-03)

Quando V2 e multimodal estão habilitados para a conta, o painel permite enviar JPG, PNG ou WebP de até 8 MB. O arquivo vai diretamente para o bucket **privado** `spacenode-media`, sob o prefixo do próprio usuário; o servidor confere tamanho, MIME real, limite de 40 milhões de pixels, imagem estática e decodificação antes de emitir a referência cifrada. A referência é vinculada ao dono, expira em 24 horas e não entra no contexto textual do modelo. Esse prazo limita a referência da conversa, não apaga o arquivo do armazenamento; a limpeza por exclusão de conta já contempla o namespace do usuário.

A tool `analisar_print` avalia a entrada quando solicitada. O envio não chama modelo nem gerador. Para gerar, a origem anexada tem prioridade sobre histórico de outros trabalhos. A proposta exibe custo e saldo e **sempre aguarda confirmação**, inclusive no Autopiloto. O executor, débito, estorno e histórico continuam no pipeline existente. Outros módulos mantêm seu encaminhamento atual.

A URL temporária é usada somente no processamento. O registro da geração guarda o proxy autenticado da entrada, e o Nodi renova o acesso ao consultar esse resultado; isso evita perder a imagem-base após expirar o token de download. Não há nova tabela, migração, mudança de permissões do bucket ou ampliação de público. `POST /api/nodi/v2/upload` tem fases `sign` e `confirm`, com autenticação, gates existentes e limites por usuário. A assinatura falha se o bucket estiver público.

Validação: testes de dono, adulteração, expiração, conteúdo inválido/truncado, MIME forjado, tamanho, gates, limites, persistência sem token temporário e geração bloqueada no Autopiloto até confirmação.

Conferência em produção: envio privado e diagnóstico visual validados com print fictício, sem geração paga. A proposta executável permanece no chat: encaminhamentos gratuitos não tiram o usuário da confirmação, mesmo no Autopiloto. Rótulo de custo, referência de entrada e avisos do pré-voo são reconciliados pelo servidor após resolver a imagem.

“Agora não” encerra as propostas daquela resposta e desativa seus botões. Cancelamento é separado do feedback “Não ajudou”; uma proposta cancelada não pode ser executada por uma confirmação textual posterior.

### Revisão e próximo ajuste (2026-10-04)

A comparação manual e a revisão após uma geração apresentam o que foi preservado, o que mudou e a orientação para continuar. A referência da revisão vem da geração resolvida pelo servidor para o próprio usuário. O botão de próximo ajuste mantém essa imagem e o Space; não troca pela imagem mais recente de outro trabalho.

A classificação separa problemas de geometria de correções locais, inclusive escala de textura. Evidência vazia, problemas desconhecidos ou fidelidade inconclusiva pedem decisão do usuário. Problemas atribuídos à entrada orientam preparar a entrada antes de gastar mais Nodes. Ausência de problemas identificados não equivale à aprovação do usuário; ampliação não é apresentada como correção de geometria ou materiais.

O próximo ajuste apenas preenche a conversa com a referência e a orientação. Ao enviar essa orientação, e ao iniciar a revisão pelo cartão da jornada, a requisição exige confirmação: o servidor aplica Copiloto apenas àquela requisição se o modo salvo for Autopiloto. Consultor mantém suas restrições e o modo salvo não muda. Nenhuma nova geração é iniciada pelo botão de revisão. A confirmação de custo e o executor existente continuam obrigatórios.

Sem novas tabelas, permissões de armazenamento ou ampliação dos gates. Validação local: 184 testes de Nodi e WhatsApp, incluindo comparação com modelo simulado, vínculo da imagem e bloqueio de execução no Autopiloto durante a revisão. Esses testes não comprovam a qualidade visual do provedor em produção.

### Preservação de materiais (2026-10-04)

O contrato de Renderizar deixa de autorizar genericamente mudar materiais e texturas: realismo melhora a representação dos materiais existentes. O retry também mantém a mesma identidade, cor e acabamento. Pedidos explícitos de mudança e overrides de material continuam disponíveis; pedidos genéricos de melhorar ou refinar não devem ser tratados pelo Nodi como autorização de redesign.

Novas propostas de Renderizar pelo Nodi usam a entrada da geração selecionada quando disponível, sem anexar seu resultado anterior como autoridade de materiais. Isso evita perpetuar deriva presente nesse resultado. Sem entrada disponível, a única referência é o resultado disponível; não se recupera automaticamente a origem de toda uma cadeia de edições. O comportamento de âncora fora do Nodi permanece disponível no pipeline normal.

Comparação manual e automática passam a avaliar tipo, cor base, acabamento, veios, paginação, juntas e escala, apontando a superfície original → resultado. Trocas visíveis são problemas de fidelidade, não ganhos de realismo. Luz, sombras e reflexos plausíveis não exigem igualdade de pixels; referência ambígua exige incerteza. A revisão não decide se uma troca foi autorizada. Materiais, cores e acabamentos podem pedir restauração local sem confundir o rótulo “fidelidade dos materiais” com geometria.

É orientação e diagnóstico visual, não garantia de identidade pixel a pixel nem um novo bloqueio automático por material. Os gates, custo, confirmação e execução existentes não mudam. Testes usam modelo simulado; validação de qualidade das novas instruções exige comparar gerações reais antes/depois com a mesma referência.

Validação local: 279 testes passaram, dois cenários de benchmark opcional foram ignorados; tipos, lint dos arquivos alterados e verificação de whitespace concluídos. Inclui contrato de Renderizar e retry, propostas assinadas sem âncora de resultado alterado, comparação manual/automática e decisão local sobre materiais.

A resposta de comparação é compacta para caber no orçamento de saída existente. Falhas da comparação manual retornam indisponibilidade sem aprovar a imagem e registram apenas categoria fixa, sem conteúdo ou mensagens do provedor. Regressão de falha com token privado aumenta a suíte para 280 testes aprovados.

### Inventário de materiais por superfície (2026-10-05)

A análise de entrada passa a registrar aparência, padrão e certeza por superfície na chamada de visão existente. Cores chapadas de CAD não permitem presumir madeira em armário ou pedra em piso cinza. O prompt mantém a imagem como autoridade, preserva aparência em casos ambíguos e aceita mudanças explícitas apenas nas superfícies solicitadas. O inventário tem limites de quantidade e tamanho e é persistido no briefing existente, sem migração de banco.

O cache de Renderizar só reutiliza briefings com inventário válido da versão atual; descrições antigas recebem nova análise quando não há briefing explícito fornecido pelo caller. A auditoria semântica também roda em preservações com inventário mesmo quando a geometria passa, respeitando os limites de tempo e a configuração de desativação existentes. A chamada de análise tem maior teto de saída; a auditoria pode ocorrer mais frequentemente, aumentando o uso de visão no servidor, sem mudar o preço de Nodes configurado.

Uma avaliação de materiais abaixo de 0,7 produz aviso mesmo com score geral alto. O diagnóstico permanece best-effort, pode terminar em background ou ficar indisponível e não bloqueia automaticamente o resultado. Não é garantia de preservação nem autorização para regenerar ou registrar aprovação do usuário.

Validação local após incorporar a atualização de aquisição (#277): 906 testes passaram, cinco cenários opcionais foram ignorados; typecheck, lint dos arquivos alterados e whitespace passaram. Os modelos foram simulados nos testes: não houve nova geração paga nesta evolução. A eficácia visual continua pendente de uma nova amostra real; o piloto anterior revelou deriva em armário e piso.
