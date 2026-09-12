# Tráfego pago SpaceNode — diagnóstico, mensuração e setup (08/09/2026)

Pedido: configurar o tráfego pago com foco em assinantes e CAC controlado; confirmar números antes de
calcular; separar aquisição × ativação × conversão; configurar rastreamento; propor distribuição de
verba e evento de otimização; deixar campanhas prontas e PAUSADAS; 3 conceitos de anúncio; plano de 14 dias.

Fontes lidas nesta sessão: banco de produção (Supabase `nucyyqmurhnakhldshwr`), conta Google Ads
`842-846-3209` (na sua sessão do Edge), conta Meta `act_10202044711098425` (Gerenciador, Cobrança,
Gerenciador de Eventos), site público, código na `main` e a PR #142, e os planos anteriores em
`marketing/ads/`. Tudo o que é premissa está marcado como **premissa**.

---

## 1. Diagnóstico

### 1.1 Os números reais (confirmados no banco e nas plataformas)

| Métrica | Valor | Fonte |
|---|---:|---|
| Contas criadas (total) | 125 (120 externas + 5 internas) | `profiles` |
| Assinaturas reais na história | **4** (todas Starter R$ 89) | `acquisition_events` + `profiles.stripe_subscription_id` |
| Ativas hoje | **3** (MRR R$ 267) | idem |
| Cancelamentos | 1 (assinou 29/07, cancelou 29/08, após 1 mês) | `subscription_canceled` |
| Assinaturas atribuídas a clique pago | **0** | nenhuma das 4 tem `gclid`, `fbclid` ou `utm_*` no cadastro |
| 1ª fatura das 4 | R$ 44,50 (oferta 50%, encerrada 31/08); renovações R$ 89 | Stripe via webhook |

Quem assinou: 2 vieram do beta de maio (assinaram quando o Stripe abriu, 28–30/07) e 2 assinaram **no
mesmo dia do cadastro** (29/07 e 31/08) depois de 25–27 gerações na 1ª semana. O padrão de quem paga é
**uso pesado imediato com projeto real**, não demografia.

Correção ao seu relato: não foram "3 assinantes de R$ 2.000 de mídia". Foram 4 assinaturas orgânicas
(beta, rede, Instagram) e **zero** de mídia paga. O que a mídia comprou foi cadastro barato que não
ativou.

### 1.2 Gasto em mídia que consegui comprovar

| Plataforma | Período | Gasto | Cliques | Cadastros (first-party) | CPL | Ativaram 7d | Assinaram |
|---|---|---:|---:|---:|---:|---:|---:|
| Google Ads "[BR] Pesquisa - Render IA" | 23/07 → hoje (rodou 24–31/07) | **R$ 451,18** | 269 (CPC R$ 1,68; CTR 6,8%) | **62** (gclid) | **R$ 7,28** | 16 (26%) | 0 |
| Meta (cobranças pagas) | 20/08 → 08/09 | **R$ 468,07** (107,01 + 107,05 + 254,01) | não lido | **0–1** | — | — | 0 |
| **Total comprovado** | | **≈ R$ 919** | | | | | **0** |

Meta: além dos pagos, há **7 cobranças que falharam** entre 27/08 e 08/09 (R$ 68,73; 2× R$ 182,20;
4× R$ 254,01), saldo devedor R$ 4,53 e o aviso "Algumas formas de pagamento não foram verificadas".
A grade de campanhas da Meta não renderizou (limitação da janela oculta), então **não vi nome, período
e gasto por campanha** — só a cobrança. Nos últimos 7 dias a conta gastou R$ 32,06 com "0 campanhas
ativas". Cadastros com `fbclid` de anúncio: 1 em julho (`trafego-render-ia`); os 4 de agosto com
`fbclid` vieram do **link da bio** (orgânico, `utm_content=link_in_bio`).

**Preciso que você confirme os R$ 2.000+**: pelo que as duas contas mostram, o pago é ≈ R$ 919 mais o
que estiver fora das 10 transações que a Meta listou (jul–set). Se houve gasto em julho na Meta ou em
outra frente (criadores, impulsionamento pelo app do Instagram), me manda o export.

### 1.3 O que a campanha de julho do Google comprou (e por que não converteu)

- Tipo Pesquisa, R$ 50/dia, 3 grupos (**Arquitetura**, **Interiores**, **Render IA**), palavras genéricas
  em frase: `"ia para arquitetos"` (76 cliques), `"ia para design de interiores"` (71), `"ia para
  arquitetura"` (31), `"decoracao com ia"`, `"renderizar com ia"` (6 cliques, CTR 2,2%).
- Termos de pesquisa que passaram o limiar de privacidade (10 de 269 cliques): *"ia para decorar
  ambientes grátis"*, *"ia de arquitetura grátis"*, *"criar planta de casa com ia"*, *"fazer projeto de
  casa com ia"*, *"ia para criar planta baixa gratuito"*, *"ia para ajudar a decorar a casa"*, *"ia para
  reforma de casa"*. É **pessoa física querendo decorar/projetar a própria casa de graça**, não
  arquiteto com cliente. Isso explica CTR alto (6,8%), CPL de R$ 7 e 0 assinaturas.
- Destino: home genérica (`landing_path=/`). Anúncio "Render Fotorrealista com IA | Render IA para
  Arquitetos" com caminho `spacenode.app/ia-arquitetura/render` — promessa "IA" para quem busca "IA".
- Conversão medida na conta: ação **"Inscrição"** com 4 conversões (custo/conv. R$ 112,80) e status
  "Requer atenção". O código em produção não dispara conversão (não existe label configurado), então
  essas 4 vieram de outra configuração que preciso que você abra (Metas → Conversões → Inscrição →
  origem/tag). O funil first-party contou 62 cadastros — a conta do Google via 4. **A conta estava cega
  em 94%.**
- Conta hoje: **PAUSADA — "Seu prazo de verificação passou. Conclua a verificação do anunciante"**.
  Nenhum anúncio roda até você concluir (Adm. → Verificação do anunciante). Codificação automática
  ATIVADA (ok), aplicação automática de recomendações DESATIVADA (ok), saldo R$ 0, último pagamento
  01/08 R$ 200.

### 1.4 O que a Meta comprou

- **Sem Pixel, sem dataset, sem Conversions API** (Gerenciador de Eventos vazio: "Conecte seus dados").
  Toda campanha que rodou otimizou para clique/visualização, não para cadastro.
- Cartões recusados repetidamente desde 27/08 → qualquer campanha nova será interrompida no primeiro
  limite de cobrança. Aviso de verificação da conta ("A verificação poderá ser necessária em breve").
- Rascunho de setembro já existe no Gerenciador (campanha `SN_META_PROSPECCAO_ARQUITETO`, conjunto
  FIDELIDADE, 1 anúncio sem mídia), montado em 08/09.

### 1.5 Funil separado em três problemas

**Aquisição (o clique errado)**
- Palavras genéricas com "ia" + "grátis" trouxeram curioso, não profissional.
- Destino = home, sem prova específica para quem chega de "sketchup"/"planta".
- Meta sem sinal de cadastro → o algoritmo entrega para quem clica, não para quem cadastra.

**Ativação (o cadastro que não gera)**
- 60% das 120 contas nunca geraram nada; na coorte do Google, 47 de 62 nunca renderizaram.
- Coorte de julho gerou em **3 minutos** (login Google em 1 clique, 1 render) e sumiu: não tinha projeto
  em mãos. Não existe e-mail de boas-vindas (nenhum provedor no repo), nem projeto de exemplo.
- Agosto (sem mídia, com Guia da 1ª imagem e landing nova): 67% ativaram, 40% com 5+ gerações — o
  funil orgânico já ativa bem; o pago não.

**Conversão (do uso à assinatura)**
- Preditor: 10+ gerações na 1ª semana → 22% assinam; 0–2 gerações → 1,4%.
- 26 contas free "na parede" (saldo ≤ 15 nodes) nunca receberam um contato.
- CTA de saldo insuficiente só existe em Renderizar/Spaces; Editar/Ampliar/Animar têm botão morto.
- Checkout não aceita cupom digitado; Pix desligado; oferta de 50% acabou (a PR #150 que tira o kill
  switch ainda está aberta).

**Conclusão**: o investimento não virou assinatura porque (1) comprou a intenção errada, (2) mediu 6%
do que aconteceu e (3) não tinha nada entre o cadastro e o primeiro projeto real. Escalar mídia antes de
corrigir 2 e 3 repete julho.

---

## 2. Mensuração — o que existe, o que fiz, o que falta

### 2.1 Estado em produção (main)

| Peça | Estado |
|---|---|
| Cookie first-party `sn_attribution` (utm_*/gclid/fbclid, 90 d) + evento `signup` | Funciona (foi assim que li julho). Só grava quando há parâmetro de campanha |
| `lp_view` nas LPs `/lp/print-do-sketchup` e `/lp/planta-humanizada` | Publicadas (200, noindex), atribuição testada em 08/09 |
| Eventos Stripe (`checkout_started`, `subscription_started`, `subscription_renewed`, `subscription_canceled`) | Gravam, mas **sem UTM/atribuição** e sem dedupe formal |
| Google tag `AW-18345260541` | Carrega em produção, **sem label** → `reportSignupConversion()` é no-op |
| GA4 | **Não existe propriedade** (analytics.google.com abre a tela de criar conta) |
| Meta Pixel / CAPI | **Não existe dataset** |
| Painel `/admin/marketing/ads` + CSV de gasto + crons de alerta/relatório | Funcionam (campanhas Meta e Google já cadastradas como draft, 8 anúncios com UTM) |

### 2.2 O que implementei hoje (código)

A PR #142 (`feat/analytics-funnel`) já continha exatamente o funil pedido — cadastro, primeira geração,
início de checkout, primeira assinatura paga — com dedupe e adapters GA4/Meta, mas estava 3 semanas
atrás da `main` e **conflitava em 12 arquivos**. Fiz o merge da `main` atual nela numa worktree
isolada (`C:\Users\Pisoni\spacenode-analytics-rebase`, branch `feat/analytics-funnel-rebased`, commit
`7367a352`), preservando o redesign da landing, nodes unificados e Office legado. Validação:

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm test` (vitest) | 27 arquivos, **322 testes passando**, 2 skipped, 0 falhas (inclui 21 testes do funil) |
| `npm run build` (Next 16, Turbopack) | Compiled successfully |

O push para atualizar a PR foi bloqueado pela política desta sessão; rode você:

```bash
git -C C:/Users/Pisoni/spacenode-analytics-rebase push origin feat/analytics-funnel-rebased:feat/analytics-funnel
```

O que a PR entrega (nomes exatos em `lib/analytics/events.ts`, doc em `docs/ANALYTICS.md`):

| Evento (first-party) | Onde dispara | GA4 | Meta | Dedupe |
|---|---|---|---|---|
| `signup_completed` (armazenado como `signup`) | callback de auth (e-mail e Google), com `plan_intent` | `sign_up` | `CompleteRegistration` | índice único por usuário |
| `first_generation` | `after()` em /api/generate, spaces, edit-v3, upscale, video | `first_generation` | custom | 1× por usuário |
| `checkout_started` | /api/stripe/checkout, grava anon id + UTMs + oferta no `metadata` da session | `begin_checkout` | `InitiateCheckout` | — |
| `subscription_started` | webhook, **só session paga**, checa `alreadyActive`, valor = 1ª fatura, `BRL` | `purchase` (transaction_id = session) | `Subscribe` (value/currency, `event_id` = `sub_started:{sub_id}`) | `sub_started:{subscription_id}` |
| `subscription_renewed` | webhook `invoice.paid` (billing_reason=cycle) | **não vai para as plataformas** | **não vai** | `renewal:{invoice_id}` |
| `subscription_cancelled` | webhook | — | — | — |

Regras que atendem ao pedido: renovação nunca vira `purchase`/`Subscribe`; valor e moeda vêm do Stripe
(hoje R$ 89,00 BRL); o mesmo `event_id` é usado no Pixel e na CAPI (a Meta deduplica); GA4 recebe
`transaction_id`. Adapters ficam **desligados sem env** — 100% first-party até você ligar.

Ajuste que o agente fez e você deve conferir na revisão: no webhook, o `checkout_completed` de pacote
avulso passou de `product_type: 'lumen'` para `'extra'` (naming da main). Migration
`supabase/migrations/20260818000000_analytics_funnel.sql` **não aplicada** (banco de produção — precisa
da sua autorização; sem ela os eventos novos são descartados com aviso e nada quebra).

### 2.3 O que só você pode ligar (com o passo exato)

1. **Google Ads — verificação do anunciante** (Adm. → Verificação do anunciante). Sem isso nada roda.
2. **Google Ads — ações de conversão** (Metas → Conversões → + Criar ação → *Importar* → *Outras fontes de
   dados ou CRMs* → *Acompanhar conversões de cliques*): `Cadastro` (categoria Inscrição, contagem Uma,
   janela 90 d, **Principal**) e `Assinatura` (categoria Compra, valor da conversão "usar valores
   diferentes", padrão R$ 89, contagem Uma, **Principal**). Abra a ação `Inscrição` existente e me diga a
   origem/tag; se for tag do site sem label, marque como **Secundária** para não competir.
   Upload: `node marketing/scripts/ads/export-google-conversions.mjs --since 2026-09-14` gera o CSV
   (Metas → Conversões → Uploads). Os 62 gclid de julho ainda valem até ~22/10 — subir só depois da
   cláusula 7 (item 6).
   Alternativa client-side: criar `Cadastro` como *Site → Tag do Google → evento manual*, copiar o label
   e setar `NEXT_PUBLIC_GADS_SIGNUP_LABEL` na Vercel + redeploy. Recomendo a importação (server-side,
   sem cookie de terceiro) e manter a tag só se você quiser Smart Bidding em tempo real.
3. **Meta — dataset + CAPI**: Gerenciador de Eventos → Conectar dados → Web → nome `SpaceNode Web` →
   pular a instalação do Pixel → Configurações → Conversions API → *Gerar token de acesso*. Setar na
   Vercel `NEXT_PUBLIC_META_PIXEL_ID` (id do dataset) e `META_CAPI_ACCESS_TOKEN`. O adapter só manda
   `fbc` (derivado do `fbclid`), evento, hora, URL e `action_source=website` — sem e-mail/IP/UA.
   Se você quiser o Pixel no navegador também, a mesma env liga o snippet (cláusula 7 antes).
4. **GA4** (opcional; o funil first-party já cobre a leitura): criar propriedade em analytics.google.com
   → fluxo Web `spacenode.app` → copiar `G-XXXX` → `NEXT_PUBLIC_GA4_ID`; Admin → Fluxos de dados →
   Measurement Protocol → criar `GA4_API_SECRET`. Ative "Sinais do Google" só depois da cláusula 7.
5. **Migration da PR #142** no SQL Editor de produção (ou autorizar que eu aplique) e merge da PR.
6. **Cláusula 7 da Política de Privacidade** (`app/privacidade/page.tsx`): hoje diz "Não usamos cookies
   de publicidade de terceiros nem rastreadores de terceiros" — e a tag `AW-18345260541` já carrega em
   produção. Antes de ligar CAPI/GA4/label, trocar por (texto para o advogado): "Quando um clique em
   anúncio resulta em cadastro ou assinatura, informamos esse fato ao Google Ads e à Meta de forma
   pseudonimizada (identificador do clique, data e valor), por servidor, para medir e otimizar nossas
   campanhas. Base legal: legítimo interesse; você pode se opor em Configurações." + listar `_gcl_au`
   se mantiver a tag. A PR #142 já adiciona `sn_aid`/`sn_intent` ao texto.

### 2.4 Como vou validar (e como você confere)

- **Atribuição**: janela anônima → `https://spacenode.app/lp/print-do-sketchup?gclid=teste&utm_source=google&utm_medium=cpc&utm_campaign=sn_google_captacao_arquiteto&utm_content=sn_google_captacao_arquiteto_plugin_rsa01_copy01&utm_term=arquiteto` → CTA → cadastrar com e-mail interno → `select * from marketing.acquisition_events where event_type='signup' order by created_at desc limit 1` mostra `utm_content` e `gclid`. Depois apagar o usuário de teste (o painel não filtra internos).
- **Primeira geração**: gerar 1 render com a conta de teste → `first_generation` aparece 1× (segunda geração não repete).
- **Checkout/assinatura**: modo teste do Stripe (`.env.local` é chave de TESTE) → `checkout_started` com UTMs no metadata; `subscription_started` com `value_cents=8900`, `currency=BRL`; renovar a fatura de teste → só `subscription_renewed`.
- **Meta**: Gerenciador de Eventos → Testar eventos → código `TEST` na env `META_CAPI_TEST_CODE` (se existir no adapter) ou ver o evento `Subscribe` chegar com `event_id`; repetir o webhook (Stripe → Reenviar) e conferir que a Meta mostra 1 evento deduplicado.
- **Google**: Uploads → status "Processado" e a coluna Conversões na campanha 4–6 h depois. Ferramentas → Diagnóstico de conversão sem alerta.
- **SQL semanal**: `marketing/ads/setup-2026-09/leitura-semanal.sql` (cadastro → ativado → checkout → assinatura por célula, contas internas fora).

---

## 3. Estratégia e orçamento

### 3.1 Orçamento

**R$ 2.000/mês confirmado pelo dono em 08/09 (à tarde), com a divisão Meta R$ 40 / Google R$ 25 por dia.**
Se um dia cair abaixo de R$ 1.200, a célula PLUGIN da Meta sai antes de qualquer outra.

| Canal | Diário | 30 dias | Por quê |
|---|---:|---:|---|
| Meta — 2 conjuntos × R$ 20 | R$ 40 | R$ 1.200 | Reels com demonstração real pré-qualificam (mostram SketchUp, print, reunião). Sem CAPI ainda, otimiza para visualização de LP; migra para Leads quando o dataset tiver evento |
| Google Search — 3 grupos exatos | R$ 25 | R$ 750 | Julho provou clique barato (R$ 1,68) e cadastro a R$ 7; o erro foi a intenção. `sketchup` / `plugin` / `planta humanizada` são intenção de quem tem projeto |
| **Total** | **R$ 65** | **R$ 1.950** | Reserva R$ 50 para reprovação/ajuste |

Não fragmentar: 1 campanha por canal, 2 conjuntos + 3 grupos. Nada de PMax, Display, Advantage+
Shopping, remarketing (não há consentimento) ou lookalike (< 100 pagantes).

### 3.2 Evento de otimização (pelo volume real)

| Canal | Semanas 1–2 | A partir da semana 3 | Justificativa |
|---|---|---|---|
| Google | **Maximizar cliques, CPC máx. R$ 3,00** | **Maximizar conversões** na ação `Cadastro` quando houver ≥ 15 `Cadastro` importados em 30 d; tCPA só com ≥ 30 | Julho: 62 cadastros em 8 dias com R$ 50/dia. Com R$ 25/dia e exata a expectativa (**premissa**) é 20–40/mês — suficiente para Max. conversões, insuficiente para tCPA. `Assinatura` fica como conversão secundária (valor) até ter ≥ 10 |
| Meta | **Tráfego → Visualizações da página de destino** | **Leads → `CompleteRegistration`** via CAPI quando o dataset receber ≥ 8 cadastros/semana | 50 eventos/7 d para sair do aprendizado é inalcançável com R$ 40/dia; ainda assim otimizar por cadastro com aprendizado limitado costuma bater LPV em qualidade. `Subscribe` nunca é evento de otimização em setembro (0–5/mês) |

### 3.3 CAC sustentável (com as incertezas)

- ARPU R$ 89 (100% Starter). Margem bruta: custo de insumo ≤ R$ 0,031/node no pior caso (vídeo,
  `docs/CAMPANHA-LANCAMENTO-2026-07.md`) → Starter 100% consumido custa ≤ R$ 23 → **≥ 74% de margem**;
  uso médio menor → ~80%. Contribuição ≈ **R$ 66–71/mês**.
- Retenção: 4 assinaturas, 1 cancelou no 1º mês (25%); 2 estão no 2º mês, 1 no 1º. Amostra de 4 não
  define churn. **Premissa**: churn mensal 15–25% → vida média 4–6,7 meses → LTV de contribuição
  **R$ 270–470**.
- CAC: **saudável ≤ R$ 150** (payback ≈ 2 meses, 1/3 do LTV); **aceitável para aprender ≤ R$ 400**
  (payback ≤ 6 meses); **acima de R$ 600 = parar**. Com R$ 1.950 no mês, "aceitável" exige ≥ 5
  assinaturas atribuídas; "saudável" exige ≥ 13 — o que julho e o orgânico dizem ser improvável em 30
  dias. Por isso o critério de 14 dias é **custo por usuário ativado** (leading), não CAC.

---

## 4. Configuração (arquivos prontos em `marketing/ads/setup-2026-09/`)

Gerados e validados por `node marketing/ads/setup-2026-09/build.mjs` (limites de caracteres do
Google/Meta conferidos; vídeos existem no disco).

| Arquivo | O que é | Como usar |
|---|---|---|
| `google-01-campanha-e-grupos.csv` | Campanha Pesquisa **pausada**, R$ 25/dia, Max. cliques, só Rede de Pesquisa, Brasil (presença), pt, 14/09–13/10, 3 grupos (CPC máx. R$ 3) | Google Ads Editor → Conta → Importar → do arquivo. Conferir o mapeamento de colunas na tela de importação |
| `google-02-palavras-chave.csv` | 29 exatas + 2 frases | idem |
| `google-03-negativas-SN_NEG_CAPTACAO_v2.csv` | 101 negativas (lista compartilhada) | Ferramentas → Biblioteca compartilhada → Listas de negativas → criar `SN_NEG_CAPTACAO_v2` e aplicar à campanha |
| `google-04-anuncios-rsa.csv` | 3 RSAs (12–13 títulos ≤ 30, 4 descrições ≤ 90, 2 títulos fixados na posição 1, caminhos), URL final com UTM | idem |
| `google-05-extensoes.csv` | 9 sitelinks (nível grupo, com UTM), 6 frases de destaque, 1 snippet Serviços | idem |
| `meta-01-bulk-import.csv` | Campanha Tráfego ABO **pausada**, limite R$ 1.250, 2 conjuntos R$ 20/dia (Brasil, 24–55, pt-BR, Advantage+ público, posicionamentos Reels/Stories/Feed IG + Reels/Stories FB), 6 anúncios com vídeo, copy, CTA Cadastre-se e URL Tags | Gerenciador → Criar → Importar em massa. Se a planilha for recusada, exporte a campanha rascunho existente como modelo e cole as colunas |
| `utms-e-destinos.csv` | 9 anúncios → identificador, célula, destino, URL final | Cadastrar no painel `/admin/marketing/ads` (o identificador é o nome do anúncio no gerenciador; `utm_content` = ele em minúsculas) |
| `leitura-semanal.sql` | Funil por célula + assinaturas tardias + pool de reengajamento | SQL Editor de produção, toda segunda |

### 4.1 Google — decisões de conta e campanha

- Antes de importar: Recursos → ⋮ → recursos automáticos no nível da conta **OFF** (sitelinks/frases
  dinâmicas chegam sem `utm_content`); conversões avançadas OFF; AI Max **OFF** nos 3 grupos (nasce
  ligado); "Incluir parceiros de pesquisa" e "Rede de Display" **desmarcados**; Locais = **Presença**.
- Grupos e intenção:
  - `SN_GOOGLE_CAPTACAO_ARQUITETO_SKETCHUP` → `/lp/print-do-sketchup` — `[renderizar sketchup]`,
    `[render sketchup]`, `[render sketchup online]`, `[renderizar modelo do sketchup]`, `[sketchup com ia]`,
    `[ia para sketchup]`, `[render com ia sketchup]`, `[renderizador sketchup]`, `[render rápido sketchup]`,
    `"renderizar sketchup"`.
  - `..._PLUGIN` → `/sketchup` (página oficial do plugin) — `[plugin render sketchup]`, `[plugin de render
    para sketchup]`, `[plugin de renderização sketchup]`, `[plugin renderizador sketchup]`, `[renderizador
    para sketchup]`, `[render sketchup plugin]`, `[extensão render sketchup]`, `[plugin ia sketchup]`,
    `[plugin de render sketchup grátis]`, `"plugin de render sketchup"`. **Hipótese do plugin**: quem
    procura plugin de render já tem modelo aberto e cliente esperando.
  - `..._PLANTAHUM` → `/lp/planta-humanizada` — `[planta humanizada]`, `[planta humanizada online]`,
    `[planta humanizada com ia]`, `[fazer planta humanizada]`, `[programa para planta humanizada]`,
    `[planta baixa humanizada]`, `[humanizar planta baixa]`, `[humanizar planta]`…
- Fora, de propósito: `ia para arquitetura`, `render com ia`, `decoração` — foi o que julho comprou.
  Negativas novas em relação ao plano anterior: `decorar`, `decoração`, `reforma`, `"minha casa"`,
  `"casa própria"` (termos reais de julho); `plugin`/`extensão` **saíram** das negativas porque agora
  há grupo e página para isso.
- Marcas concorrentes (lumion, vray, enscape, d5…) só como negativas (STJ REsp 2.032.932 e 2.096.417).
- Verificação de destino: `/lp/print-do-sketchup` (200, noindex) promete print → render fiel, sem
  plugin; `/sketchup` promete plugin grátis v0.9.0, SketchUp 2021+, Windows/macOS, "renders usam os
  Nodes" — igual ao anúncio; `/lp/planta-humanizada` promete planta técnica → humanizada. As três têm
  CTA para `/login?mode=signup` e o cookie de atribuição é lido em qualquer página (UtmCapture no layout
  raiz), inclusive `/sketchup`.
- Ponto de atenção do plugin: o `.rbz` **não é assinado** (Trimble). O SketchUp avisa na instalação
  com a política padrão "Identificado" — o usuário precisa mudar para "Irrestrito". Isso reduz a
  ativação da célula PLUGIN; vale a hipótese mesmo assim porque é o único ativo que ninguém mais tem.
  Assinar a extensão é a correção (pendência sua desde 05/09).

### 4.2 Meta — decisões

- Campanha `SN_META_PROSPECCAO_ARQUITETO` (o rascunho de 08/09 já existe, id 52601952235675; reaproveitar,
  renomear o conjunto FIDELIDADE para `RENDER`). Objetivo Tráfego, ABO, limite R$ 1.250, sem A/B nativo,
  categorias especiais nenhuma.
- Conjuntos (idênticos exceto criativo/copy/destino):
  - `..._RENDER` R$ 20/dia → `/lp/print-do-sketchup`: drone-nada-sai-do-lugar (COPY01), pisca-fachada
    (COPY01), entre-duas-reunioes (COPY02).
  - `..._PLUGIN` R$ 20/dia → `/sketchup`: plugin-render-real (COPY03), plugin-no-sketchup (COPY03),
    tres-cenas-um-clique (COPY04).
- Segmentação: Brasil (moram), 24–55, português (Brasil), Advantage+ público com sugestões
  "Arquitetura", "Design de interiores", "3ds Max", "Desenho assistido por computador" (SketchUp/Revit
  não existem mais como interesse) + públicos personalizados de engajamento (IG 365 d; vídeo 50% 365 d).
  Exclusões: nenhuma (sem Pixel não dá para excluir cadastrados; quando a CAPI entrar, excluir
  `CompleteRegistration` 30 d).
- Posicionamentos manuais: Reels/Stories/Feed do Instagram + Reels/Stories do Facebook. Sem Audience
  Network, Messenger, in-stream, pesquisa, Threads, coluna direita.
- Aprimoramentos Advantage+ creative todos OFF, exceto música (Sound Collection, mesma faixa nos 6).
- URLs literais por anúncio (não usar `{{ad.name}}`); `utm_medium=paid_social`.
- Bloqueios: **método de pagamento** (7 falhas) e verificação da conta. Sem cartão válido a campanha
  para no 1º limite (R$ 254).

---

## 5. Criativos e destino (3 conceitos, só demonstração real)

Regras: nada de resultado, depoimento, promoção ou funcionalidade inventados. Todos os vídeos citados já
existem em `marketing/output/` (1080×1920, H.264, mudos), gerados a partir do acervo real e de
capturas reais no SketchUp Pro 2022 (render de716672, 28 nodes, 07/09).

### Conceito A — "Nada sai do lugar" (print → render)
- **Onde**: Meta conjunto RENDER (3 vídeos) + Google grupo SKETCHUP.
- **Promessa**: o print do SketchUp vira render fotorrealista sem a IA reinventar o projeto.
- **Roteiro (6–9 s, mudo com legenda)**: 0–1,5 s print cru do viewport (linhas, sem textura) → 1,5–5 s
  o render aparece por *wipe* na mesma câmera → 5–8 s zoom em um detalhe que continuou no lugar
  (esquadria, guarda-corpo) → card final "80 nodes grátis · sem cartão" + botão.
- **Texto principal (COPY01)**: "Nada sai do lugar: o print do SketchUp vira render fotorrealista, fiel
  ao seu modelo. Feito por arquiteto, em português. Planos a partir de R$ 89/mês. Comece com 80 nodes
  grátis, sem cartão." · **Título**: "Render fiel ao seu SketchUp" · **Descrição**: "80 nodes grátis ·
  sem cartão" · **CTA**: Cadastre-se.
- **Google RSA**: títulos "Renderize Prints do SketchUp" / "Do SketchUp ao Render com IA" fixados;
  descrições no CSV. Caminho `spacenode.app/sketchup/render`.
- **Destino**: `/lp/print-do-sketchup` — h1 "Do print do SketchUp ao render fiel", antes/depois reais,
  Geometry Lock, "Em minutos", FAQ "Preciso de plugin? Não". Coerente.

### Conceito B — "Render dentro do SketchUp" (plugin em uso, geração real)
- **Onde**: Meta conjunto PLUGIN (3 vídeos) + Google grupo PLUGIN.
- **Promessa**: um clique na barra do SketchUp, o render volta no painel, mesma câmera.
- **Roteiro (15 s, real)**: viewport do SketchUp com o painel SPACENODE ao lado → clique em "Gerar
  render" → time-lapse real das fases (Capturando a vista → Enviando → Gerando → Refinando materiais)
  → antes/depois no comparador do próprio painel (100 → 50 → 0) → card "Plugin grátis · SketchUp 2021+".
  É o `2026-09-07-reel-plugin-render-real.mp4` (geração real, e-mail mascarado).
- **Texto principal (COPY03)**: "Renderize sem sair do SketchUp: o plugin captura a cena, a lente e o
  sol do seu modelo e devolve a imagem em minutos. Plugin grátis. Cadastro com 80 nodes, sem cartão."
  · **Título**: "Render dentro do SketchUp" · **Descrição**: "Plugin grátis · SketchUp 2021+" · **CTA**:
  Cadastre-se (o cadastro dá os nodes; o download fica na página).
- **Variante COPY04 (cenas em lote)**: "Três cenas do SketchUp, um clique, três renders com o mesmo
  preset. O plugin renderiza em lote, dentro do seu modelo. Plugin grátis. Cadastro com 80 nodes, sem
  cartão." · Título "Cenas em lote, dentro do SketchUp".
- **Google RSA**: "Renderize Dentro do SketchUp" / "Plugin Grátis para SketchUp" fixados; "Um Clique na
  Barra do SketchUp", "Sol e Lente do Seu Modelo", "SketchUp 2021 ou Superior", "Windows e macOS".
- **Destino**: `/sketchup` — "seu modelo, renderizado de dentro do SketchUp", v0.9.0, 3 passos de
  instalação, "Grátis — os renders usam os Nodes da sua conta", CTA "Crie grátis". Coerente com a
  promessa; o aviso de extensão não assinada é o risco (ver 4.1).

### Conceito C — "Entre duas reuniões" (rotina do escritório)
- **Onde**: Meta conjunto RENDER (3º vídeo) — mede se "prazo" vende melhor que "fidelidade".
- **Promessa**: reunião de manhã com o print, reunião da tarde com a imagem.
- **Roteiro (8,5 s)**: agenda/relógio → print no navegador → render na tela do notebook na mesa de
  reunião → card final.
- **Texto principal (COPY02)**: "Reunião de manhã com o print, reunião da tarde com a imagem. Render em
  minutos, no navegador, feito por arquiteto. Planos a partir de R$ 89/mês. Comece com 80 nodes
  grátis, sem cartão." · **Título**: "Do print à imagem, em minutos" · **CTA**: Cadastre-se.
- **Destino**: `/lp/print-do-sketchup` (mesma LP; a seção "Em minutos — sem fila, sem madrugada" cobre
  a promessa).

Fallbacks já previstos: se a Meta/Google reprovarem "SketchUp" (marca), usar "Render fiel ao seu
modelo" / "Renderize o Print do Modelo"; contestar uma vez antes de trocar. "Photoshop" não aparece em
nenhum texto.

---

## 6. Validação e plano de 14 dias (14/09 → 27/09)

### 6.1 Antes de ativar (checklist, ordem obrigatória)

1. Google: verificação do anunciante concluída; conta sai de "Pausada".
2. Meta: cartão válido/verificado; saldo R$ 4,53 pago; verificação da conta iniciada.
3. Importar os CSVs (Google Ads Editor) e a planilha (Meta) → tudo nasce **pausado**; cadastrar no
   painel; me mandar print ou export para conferir contra este documento.
4. Teste de atribuição (2.4) nas 3 páginas de destino; apagar o usuário de teste.
5. Push da PR #142 + migration + merge (ou, no mínimo, migration + merge) — sem isso a assinatura não
   sai atribuída e as plataformas não recebem nada.
6. Ações de conversão no Google (`Cadastro`, `Assinatura`) e dataset/CAPI na Meta (2.3) — podem entrar
   na semana 1 sem atrasar a ativação, porque a leitura é first-party.
7. **Aprovação sua** da configuração final → ativação numa segunda de manhã (14/09).

### 6.2 Métricas e critérios

| Métrica (por célula) | Dia 7 (21/09) | Dia 14 (27/09) | Ação |
|---|---|---|---|
| Gasto | ≈ R$ 140 (Meta) / R$ 175 (Google) | ≈ R$ 280 / R$ 350 | — |
| CPL (cadastro first-party) | leitura | **≤ R$ 40** com ≥ 10 cadastros | > R$ 80 após R$ 300 gastos → pausar a célula e trocar criativo/keyword |
| **Custo por ativado** (1ª geração em 7 d) | leitura | **≤ R$ 80** | > R$ 150 após 15 cadastros → pausar |
| Ativação da célula | ≥ 35% | **≥ 50%** | < 35% com ≥ 15 cadastros → parar de comprar dessa célula até trocar a mensagem/LP |
| 5+ gerações na 1ª semana | — | ≥ 20% dos cadastros | é o preditor de pagamento; célula com 0 em 20 cadastros = errada |
| Checkout iniciado | — | ≥ 3 na campanha | 0 em 40 cadastros → problema de produto, não de mídia |
| Assinatura atribuída | — | leitura (esperado 0–2) | não decide em 14 dias; decide em 30 d (CAC ≤ R$ 400 mantém; > R$ 600 pausa) |
| Google: termos de pesquisa | 2×/semana | — | termo com cadastro → exata; ≥ 8 cliques e 0 cadastro → negativa; "grátis/gratuito" só negativar se ≥ 60% dos cliques e 0 ativação |
| Meta: CTR de link ≥ 0,8%, frequência ≤ 2,5, taxa de gancho (3 s ÷ impr) ≥ 25% | dia 7 | dia 14 | anúncio abaixo disso em 5.000 impr → substituir pelo reserva (piscina, zoom-cozinha) |
| Regra dura | — | — | célula com **R$ 300 gastos e 0 cadastros → pausar** |

Amostra: < 20 cadastros por célula é inconclusivo (regra do painel). Os crons `ads-alerts` (9h) e
`ads-report` (segunda) vão disparar "CAC > R$ 200" em aprendizado — registrar no experimento que o
teto da fase é R$ 600.

### 6.3 Ritual (segunda 9h–9h30 e quinta 10 min)

CSV de gasto (Meta e Google) → `gerenciador-csv-para-painel.mjs` → painel; `leitura-semanal.sql`;
termos de pesquisa; upload de `Cadastro`/`Assinatura` por gclid (após cláusula 7); Stripe (assinaturas
novas → e-mail → célula); registro manter/cortar no experimento. Toda alteração de anúncio só às segundas.

### 6.4 O que mais move o CAC e não é mídia (fazer em paralelo)

1. E-mail D0/D2/D7 ("manda um print, qualquer print") — PR #140 / Resend já tem chave no `.env.local`.
2. Projeto de exemplo no Renderizar para quem chega sem modelo.
3. CTA de saldo insuficiente em Editar/Ampliar/Animar.
4. Frente A: contato manual com os 26 free "na parede" (lista no SQL 4) com 500 nodes extras após
   assinar (grant SQL). Custo de mídia zero, CAC < R$ 50 (**premissa**).
5. Assinar o `.rbz` do plugin.

---

## 7. Aprovações que estou pedindo

1. ~~Orçamento e divisão~~ — **confirmados em 08/09** (R$ 2.000; Meta R$ 40 / Google R$ 25). Painel de produção atualizado com esses valores (campanhas, conjuntos e anúncios em rascunho).
2. Confirmar os **R$ 2.000 gastos** (as contas mostram ≈ R$ 919) e mandar o export de campanhas da Meta.
3. Autorizar **push + migration + merge da PR #142**.
4. Decidir a **cláusula 7** (texto em 2.3) e se a tag `AW-18345260541` fica (com label) ou sai.
5. Aprovar a **configuração final** (arquivos em `setup-2026-09/`) antes de eu ou você ativar. Nada
   ativo foi alterado; nenhuma campanha foi ligada; nenhum gasto foi aumentado.
