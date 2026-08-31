# SPACENODE — Roadmap de integrações do sistema editorial

> Nenhuma destas integrações está implementada ou ativa. Este documento define responsabilidade,
> contratos de dados, eventos, segurança e ordem recomendada — para que a fundação atual
> (schema `marketing`, serviços em `lib/marketing/`, painel `/admin/marketing`) as receba sem
> retrabalho. Regra permanente: **nenhuma integração publica conteúdo sem aprovação humana peça a
> peça**, e mídia paga sobe **pausada**.

---

## 0. Pontos de acoplamento já preparados

| Preparação | Onde |
|---|---|
| Registro de execuções de automação | `marketing.automation_runs` (run_type, status, input/output, model, error) |
| Estrutura de publicação | `marketing.content_publications` (platform, external_post_id, scheduled_at, published_at, status, publication_url, metrics jsonb) |
| Templates com provider externo | `marketing.content_templates` (template_provider, external_template_id, campos dinâmicos em visual_rules) |
| Regras da marca legíveis por máquina | `marketing.brand_rules` (JSON por chave) |
| Verificador de marca auto-contido | `lib/marketing/brand-check.ts` (zero dependências — portável para um nó de código do n8n) |
| Provider de IA plugável | `lib/marketing/generation.ts` (interface `ContentGenerationProvider`) |
| Fluxo de status completo | `scheduled → published → analyzed` já modelados em `lib/marketing/workflow.ts` |

## 1. n8n — orquestração

- **Responsabilidade:** orquestrar rotinas (gerar pauta semanal, rodar brand-check em lote,
  lembrar revisões pendentes, mover briefings agendados). Não decide conteúdo; move estados e
  chama serviços.
- **Entrada:** eventos do sistema editorial (briefing aprovado, agendamento criado) via webhook ou
  polling autenticado; regras de calendário.
- **Saída:** chamadas às APIs `/api/admin/marketing/*`; registros em `automation_runs`.
- **Eventos:** `brief.approved`, `brief.ready_to_schedule`, `publication.due`, `review.pending_24h`.
- **Segurança:** service account própria (token de API dedicado, NUNCA o service role do
  Supabase); allowlist de operações (n8n não aprova, não publica sem flag por peça); segredos só
  no n8n/Vercel env.
- **Aprovação necessária:** toda ação de escrita disparada por n8n referencia um brief já aprovado
  por humano; ações novas de escrita exigem revisão de segurança antes do deploy do workflow.

## 2. Canva (MCP/Connect API) — produção de arte

- **Responsabilidade:** materializar `content_templates` como templates reais no Canva e preencher
  campos dinâmicos (headline, apoio, imagens) a partir do briefing aprovado.
- **Entrada:** brief aprovado + assets vinculados (URLs assinadas de `marketing-assets`) +
  `external_template_id`.
- **Saída:** arte exportada (PNG/MP4) gravada em `content_assets` (source_type `external`,
  metadata com id do design).
- **Eventos:** `brief.ready_for_production` → criar design; `design.exported` → anexar asset e
  mover para `final_review`.
- **Segurança:** OAuth da conta da marca; URLs de asset assinadas com TTL curto; nada de service
  role; export sempre revisado por humano antes de `ready_to_schedule`.
- **Aprovação necessária:** humano confere a arte exportada (revisão final) — o Canva não fecha
  peça sozinho.

## 3. Instagram Publishing API (Meta Graph) — publicação orgânica

- **Responsabilidade:** publicar/agendar conteúdo **aprovado e explicitamente liberado peça a
  peça**, e devolver `external_post_id`/permalink.
- **Entrada:** `content_publications` com status `scheduled` + asset final + legenda.
- **Saída:** `published_at`, `external_post_id`, `publication_url`, status `published`; erros
  voltam como status `failed` + log.
- **Eventos:** `publication.scheduled`, `publication.published`, `publication.failed`.
- **Segurança:** conta Business + token de sistema com escopo mínimo (`instagram_content_publish`);
  tokens fora do frontend; rate limits respeitados; dry-run obrigatório em ambiente de teste.
- **Aprovação necessária:** dupla — aprovação editorial (fluxo) **e** liberação de publicação
  (ação separada no painel). Sem liberação explícita, nada sai.

## 4. Meta Marketing API — mídia paga

- **Responsabilidade:** criar campanhas/adsets/anúncios de tráfego a partir de peças aprovadas —
  **sempre com status PAUSED**. Já existe leitura em `lib/meta/ads.ts` (Graph v25.0); aguarda
  token de System User.
- **Entrada:** peça aprovada (3 variações), orçamento e público definidos por humano.
- **Saída:** ids de campanha/adset/ad em `content_publications.metrics`; status pausado.
- **Eventos:** `ad.created_paused`, `ad.activated` (ação humana no Gerenciador), `ad.metrics_synced`.
- **Segurança:** System User token com escopo mínimo, guardado só no servidor; a **ativação** de
  campanha acontece no Gerenciador de Anúncios, por humano, fora deste sistema.
- **Aprovação necessária:** criação pausada exige peça aprovada; ativação é decisão humana externa.

## 5. Vertex AI — geração de texto/imagem de apoio

- **Responsabilidade:** provider alternativo/complementar ao Gemini API atual (`lib/gemini.ts`)
  para geração de briefing e, futuramente, variações visuais. A conta GCP própria já existe
  (Veo/Animar usa Vertex).
- **Entrada/Saída:** mesmo contrato de `ContentGenerationProvider` (input estruturado → JSON
  validado). Trocar provider = implementar a interface e apontar `MARKETING_AI_PROVIDER`.
- **Eventos:** cada chamada registra `automation_runs` (model, tokens, duração, resultado).
- **Segurança:** service account com escopo mínimo; sem chave no cliente; custo monitorado por run.
- **Aprovação necessária:** saída de IA nunca pula o fluxo de revisão — entra sempre como
  `brief_draft`/versão nova.

## 6. Higgsfield — geração de vídeo/imagem para peças

- **Responsabilidade:** gerar b-roll/efeitos para Reels e anúncios a partir de renders reais
  (image-to-video), respeitando a regra de não reinterpretar a arquitetura.
- **Entrada:** asset aprovado (render real) + preset de movimento sóbrio.
- **Saída:** vídeo em `content_assets` (asset_type `video`, source_type `external`, metadata com
  job id).
- **Eventos:** `asset.generation_requested`, `asset.generation_completed`.
- **Segurança:** API key só no servidor; validação de custo por job; resultado passa por revisão
  visual (fidelidade!) antes de entrar em peça.
- **Aprovação necessária:** revisão humana da fidelidade do vídeo — movimento não pode deformar
  geometria/perspectiva.

## 7. Google Ads — mídia paga (search/YouTube)

- **Responsabilidade:** campanhas de busca e YouTube com as mesmas peças aprovadas; espelho do
  item 4 para o ecossistema Google.
- **Entrada/Saída/Eventos/Segurança:** análogos ao Meta Marketing API; campanhas criadas pausadas;
  ativação humana no Google Ads.
- **Aprovação necessária:** idem item 4.

## 8. PostHog — análise

- **Responsabilidade:** fechar o ciclo `published → analyzed`: correlacionar publicações com
  eventos de produto (cadastro, ativação) e devolver métricas para `content_publications.metrics`.
- **Entrada:** eventos de produto (PostHog não está instalado hoje; instalar é decisão futura) +
  UTMs padronizados por peça.
- **Saída:** métricas agregadas por publicação; leitura no dashboard editorial.
- **Eventos:** `publication.metrics_synced` (job periódico).
- **Segurança:** chaves só no servidor; **sem acesso desnecessário a dados de usuários** —
  métricas agregadas, nunca perfil individual; respeitar privacidade e LGPD.
- **Aprovação necessária:** revisão de privacidade antes de ligar qualquer correlação
  usuário↔conteúdo.

## 9. Ordem recomendada de implementação

1. **n8n** (orquestração interna — sem superfície pública, maior ganho operacional imediato).
2. **Canva** (produção de arte — remove o gargalo manual de montagem).
3. **Instagram Publishing API** (agendamento/publicação com dupla aprovação).
4. **PostHog/metrics** (fechar o ciclo de análise do orgânico antes de escalar pago).
5. **Meta Marketing API** (pago pausado; já há leitura pronta em `lib/meta/ads.ts`).
6. **Higgsfield** (enriquecimento de vídeo — valor incremental).
7. **Vertex AI** (troca/diversificação de provider — quando houver motivo de custo/qualidade).
8. **Google Ads** (depois do pago Meta estar rodando com processo maduro).

Cada integração, antes de ativar: revisão de segurança (escopos, segredos, RLS), teste em
ambiente não-produtivo, e atualização deste documento com o contrato final.
