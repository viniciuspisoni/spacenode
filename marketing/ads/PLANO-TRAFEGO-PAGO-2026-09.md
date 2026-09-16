# Plano de tráfego pago — encontrar quem paga (set–nov/2026)

> Escrito em 2026-09-05 a partir do banco de produção (125 cadastros, eventos de atribuição,
> assinaturas Stripe), do plano de Google Search de agosto (`PLANO-GOOGLE-SEARCH-2026-08.md`),
> do brief de conteúdo (`marketing/BRIEF.md`) e do sistema de tráfego já em prod
> (`docs/marketing/ads-system.md`, painel `/admin/marketing/ads`). Nenhum número aqui é estimado
> onde havia dado real; onde é premissa, está marcado como premissa.

## Resumo executivo

1. **Não falta gente: falta a gente certa.** Julho teve um pico de 93 cadastros. 62 deles vieram de
   uma campanha do Google Ads (24–31/07, `gclid` no cookie) e resultaram em **zero assinaturas**:
   só 24% renderizaram alguma coisa e nenhum fez 5 gerações na primeira semana.
2. **Quem paga tem um padrão claro.** As 4 assinaturas reais vieram dos 57 cadastros sem anúncio
   (rede, beta, Instagram): 60% ativaram, 21% fizeram 5+ gerações na 1ª semana, 7% assinaram.
   Duas assinaram **no mesmo dia** em que se cadastraram, com 25–27 gerações na primeira semana.
   Quem paga chega com um projeto em mãos e uma apresentação para fazer.
3. **O funil está cego.** Nenhuma assinatura pode ser atribuída a campanha hoje, a ação de conversão
   do Google não existe, o PR #142 (funil first-party completo) está aberto e a tag do Google no
   site contradiz a cláusula 7 da Política de Privacidade. Gastar sem resolver isso repete julho.
4. **O plano tem 4 frentes, em ordem de retorno por real:** (A) reengajar quem já bateu na parede
   do saldo, (B) prospecção no Instagram com Reels que pré-qualificam (já prontos), (C) Google
   Search com o plano de agosto revisado, (D) criadores de conteúdo pagos como teste tardio.
5. **Orçamento de aprendizado: R$ 2.520/mês por 4 semanas** (Meta R$ 50/dia + Google R$ 40/dia),
   mais R$ 1.000–2.000 opcionais em criadores nas semanas 5–8. Escala só com CAC ≤ R$ 400 e
   ativação ≥ 50% da fonte.
6. **Sem 4 correções de ativação (e-mail de boas-vindas, projeto de exemplo, CTA de saldo em todos os
   módulos, pergunta de perfil no cadastro), o tráfego pago não fecha a conta** no Starter de R$ 89.

---

## 1. O que os dados dizem

### 1.1 Cadastro por origem (todo o histórico até 05/09)

| Origem do cadastro | Cadastros | Ativaram (1ª geração) | 5+ gerações na 1ª semana | Assinaram | Ativas hoje |
|---|---:|---:|---:|---:|---:|
| Google Ads (`gclid`, campanha de 24–31/07) | 62 | 15 (24%) | 0 | 0 | 0 |
| Meta Ads (anúncio `trafego-render-ia`) | 1 | 0 | 0 | 0 | 0 |
| Instagram, link da bio (orgânico, com UTM) | 5 | 3 | 1 | 0 | 0 |
| Sem atribuição (direto, rede do dono, beta de abr–jun) | 57 | 34 (60%) | 12 (21%) | 4 reais (7%) | 3 |
| **Total** | **125** | **52** | **13** | **4** | **3** |

Contas internas (dono, `spacenodetestes`, cortesias) e as validações do próprio dono no Stripe
estão fora das assinaturas "reais". MRR hoje: **R$ 267** (3 × Starter).

A atribuição só grava evento quando o visitante chega com `utm_*`, `gclid` ou `fbclid` (é assim
no código em prod; o PR #142 muda isso). Ou seja: **todo cadastro rastreado de julho veio de
anúncio**, e os 57 "sem atribuição" são orgânico/rede/direto.

### 1.2 Coortes por mês de cadastro

| Coorte | Cadastros | Ativaram | 5+ gerações (total) | Assinaturas reais | Mediana até a 1ª geração |
|---|---:|---:|---:|---:|---:|
| abr/26 (beta) | 3 | 3 | 1 | 0 | 37 h |
| mai/26 (beta) | 10 | 9 | 8 | 2 | 1 h |
| jun/26 (beta) | 3 | 1 | 0 | 0 | 8 h |
| **jul/26 (campanha Google)** | **93** | **28 (30%)** | **3 (3%)** | **1 (cancelou após 1 mês)** | **3 min** |
| ago/26 | 15 | 10 (67%) | 6 (40%) | 1 (assinou no mesmo dia) | 8 min |
| set/26 (5 dias) | 1 | 1 | 1 | 0 | 4 min |

Leitura: a coorte de julho gerava em 3 minutos (login Google em 1 clique, 1 render) e sumia. A
coorte de agosto, menor e sem anúncio, tem o dobro de ativação e 13× mais usuários de 5+ gerações.
Agosto já tinha o Guia da primeira imagem (13/08) e, no último dia, a landing nova (31/08) —
vale como indício de que o funil de ativação melhorou, mas a amostra é pequena.

### 1.3 Quem paga (comportamento, não demografia)

- **4 assinaturas reais, todas Starter (R$ 89):** 2 vieram do beta de maio (usaram semanas, assinaram
  quando o Stripe abriu em 28–30/07); 2 assinaram **no mesmo dia do cadastro** (29/07 e 31/08), com
  25–27 gerações na 1ª semana. 1 das 4 cancelou após o 1º mês; as outras 3 renovaram.
- **Gerações na 1ª semana × assinatura** (125 usuários): 0 gerações → 75 usuários, 1 assinou;
  1–2 → 31, 1 assinou; 3–9 → 10, nenhum; **10+ → 9 usuários, 2 assinaram (22%)**.
- **Depoimentos da landing** (clientes reais): "apresento três variações para o cliente que antes
  levavam uma semana"; "apresento na própria reunião, o cliente fecha mais rápido". O gatilho é a
  **apresentação ao cliente**, não a curiosidade por IA.

### 1.4 Quem não paga

- 62 cadastros do Google Ads: 47 nunca renderizaram. Perfil provável: buscou "render com IA"
  ou similar, clicou por curiosidade, fez login com Google em 1 clique, não tinha modelo em mãos.
- 75 usuários no total nunca geraram nada (60% da base).
- **26 usuários free estão "na parede"**: já gastaram quase todo o saldo (≤ 15 nodes) e não
  assinaram. Outros 13 ativaram e ainda têm saldo. Só 9 free geraram algo nas últimas 3 semanas.

### 1.5 Conclusões que orientam o plano

1. O problema não é volume de topo. É **qualificação do clique** + **ativação** + **medição**.
2. O melhor preditor de pagamento é **usar muito na 1ª semana**. Tudo no plano (segmentação,
   criativo, landing, e-mails) existe para trazer quem tem um projeto e uma reunião esta semana.
3. Com ARPU de R$ 89, só há duas alavancas para o CAC fechar: **CPL baixo** (Meta com criativo
   que pré-qualifica) e **conversão alta** (ativação + saldo insuficiente bem resolvido).
4. A única campanha paga já feita (julho) nunca foi lida. O relatório de termos de pesquisa e o
   gasto dela são o dado mais barato que existe hoje — abrir antes de gastar de novo.

---

## 2. Público-alvo (definição operacional)

**ICP (quem a gente quer comprar):** arquiteto(a) ou designer de interiores, autônomo ou de
escritório pequeno (2–10), que **modela no SketchUp** (ou Revit/Archicad) e **apresenta a clientes
com frequência**. Hoje entrega print cru, paga render terceirizado (R$ 150–600/imagem) ou perde
noites no Lumion/V-Ray. Tem um projeto aberto agora.

**Sinais de qualificação (o que o clique precisa "provar"):**

- reconheceu um print do SketchUp no criativo (grade amarela, modelo cru) — quem não usa
  ferramenta de modelagem não se identifica;
- aceitou a menção de preço no anúncio ("a partir de R$ 89/mês") — quem quer "IA grátis" pula;
- clicou num CTA de projeto ("Testar com meu projeto"), não num CTA de brinde.

**Anti-persona (não comprar):** estudante sem cliente, curioso de IA generativa, quem procura
"gerador de imagem", quem quer plugin/produto grátis ilimitado, público de "decoração" sem
projeto próprio.

**Como vira segmentação em cada canal:**

| Canal | Segmentação | Pré-qualificação no criativo |
|---|---|---|
| Meta | Brasil, 24–55, PT; conjunto A: interesses SketchUp, Enscape, Lumion, V-Ray, Twinmotion, Archicad, Revit + Arquitetura/Design de interiores; conjunto B: Advantage+ amplo com A como sugestão | Reel abre no print do SketchUp; texto fala de reunião/cliente; preço na legenda |
| Google Search | Só frase/exata; grupos SketchUp e Planta humanizada com 60% da verba; "render com IA" só com modificador profissional; sem "IA para arquitetura" genérico na v1 | Título com "Print do SketchUp", descrição com preço; LP específica por grupo |
| Reengajamento | Quem já se cadastrou e bateu na parede do saldo | Não precisa: já provou intenção |

**O que aprender nas primeiras 4 semanas:** (a) software e papel de quem se cadastra (pergunta
no cadastro), (b) qual mensagem traz usuário de 5+ gerações (fidelidade × velocidade × workflow),
(c) qual termo de busca traz gente com projeto.

---

## 3. Estratégia: quatro frentes

### Frente A — Reengajar quem já chegou na parede (semana 0, custo ~zero)

Pool: 26 free com ≤ 15 nodes (já testaram de verdade) + 13 ativados com saldo + 75 que nunca
geraram. É o público mais qualificado que existe e não custa mídia.

| Segmento | Mensagem | Mecânica |
|---|---|---|
| 26 "na parede" | "Você usou seus nodes. Seu próximo projeto sai por R$ 71 no 1º mês." | Cupom privado `VOLTA20` (20% no 1º mês, 14 dias, só por e-mail — nunca público) |
| 13 ativados com saldo | "3 jeitos de usar os nodes que sobraram esta semana" (Spaces, Editar, Planta humanizada) | E-mail único + link direto para o módulo |
| 75 nunca geraram | "Manda um print. Qualquer print." + botão "Testar com um projeto de exemplo" | E-mail único; depende do projeto de exemplo (§5) |

Meta da frente: 2–3 assinaturas em 3 semanas. Também serve de teste do cupom antes de qualquer
oferta em mídia paga. E-mail para usuário cadastrado é relacionamento com cliente (base legal:
execução do contrato/legítimo interesse, com opt-out) — não exige consentimento novo.

### Frente B — Meta (Instagram) com Reels que pré-qualificam (semanas 1–8, R$ 50/dia)

O acervo já tem **9 Reels em versão anúncio** (`marketing/output/2026-09-04-*-ad`, card final
"Comece agora → · 80 nodes grátis · sem cartão · em português"). Matriz da fase 1 (hipótese do
experimento já semeado no painel: *fidelidade converte melhor que velocidade*):

| Mensagem | Reels (versão -ad) | O que prova |
|---|---|---|
| M1 Fidelidade ("nada sai do lugar") | `drone-nada-sai-do-lugar`, `pisca-fachada-geminada` | medo de a IA deformar o projeto |
| M2 Rotina ("entre duas reuniões") | `entre-duas-reunioes`, `tres-antes-das-14h-ep01` | apresentação ao cliente no mesmo dia |
| M3 Workflow SketchUp ("um print, cinco climas") | `um-print-cinco-climas`, `print-render-video-piscina` | o print do SketchUp como insumo |

- Campanha `SN_META_PROSPECCAO_ARQUITETO` (já cadastrada como draft no painel). Objetivo
  **Leads/Conversões** com evento `Cadastro` via Conversions API server-side (§4). Se a CAPI não
  sair na semana 0, começar com **Tráfego → visualizações de LP** e ler cadastro no funil próprio.
- 2 conjuntos (A interesses, B Advantage+) × 6 anúncios, R$ 25/dia cada. Posicionamentos:
  Instagram Reels/Stories/Feed + Facebook Feed/Reels; **sem** Audience Network e Messenger.
- Legenda com preço ("planos a partir de R$ 89/mês") e CTA "Testar com meu projeto". "Grátis"
  fica no card final e na LP, não como promessa principal.
- Destino: `/lp/print-do-sketchup` (dark, mesma linguagem do Reel), UTMs pelo padrão do painel
  (`utm_content` = identificador do anúncio).
- Rodada 2 (semana 3): promover 4–6 specs de `2026-09-05-organico-*` a versão -ad conforme
  a mensagem vencedora; rodada plugin (`2026-09-05-plugin`) só depois do `.rbz` assinado.

### Frente C — Google Search, plano de agosto revisado (semanas 1–8, R$ 40/dia)

Base: `PLANO-GOOGLE-SEARCH-2026-08.md` (keywords, negativas, RSAs prontos). Revisões de setembro:

1. **Verba por grupo:** SketchUp 35% · Planta humanizada 25% · Render com IA 25% · IA para
   arquitetura 15% (era igualitário). Julho sugere que "render com IA" genérico traz curioso.
2. **"Render com IA" só com modificador profissional** nas frases: "render com ia para arquitetura",
   "renderizar projeto com ia", "render com ia sketchup". A exata `[render com ia]` entra com
   lance baixo e vigiada.
3. **LP por grupo** via `/lp/[slug]` (o painel já publica): `render-do-sketchup`,
   `planta-humanizada`, `render-com-ia`. Habilita sitelinks e alinha a promessa do anúncio.
4. **Conversão por importação off-line** (§4), não pela tag no site. Ação `Cadastro` (principal) e
   `Assinatura` (valor R$ 89) importadas por `gclid`.
5. **Sem extensão de promoção** (a oferta de 50% acabou em 31/08). Cupom só na frente A.
6. **Negativas novas:** `gratis`/`grátis` continua liberado, mas `free`, `sem pagar`, `ilimitado`,
   `estudante` entram como negativas na v1 (anti-persona).
7. Antes de ligar: abrir a campanha de julho na conta (tipo, gasto, termos, custo por conversão
   se havia) e passar os termos bons para exata e os ruins para negativa.

### Frente D — Criadores e parcerias pagas (semanas 5–8, opcional, R$ 1.000–2.000)

"De arquiteto para arquiteto" funciona melhor na voz de quem já ensina SketchUp/archviz em
português. 1–2 integrações pagas (vídeo de 60–90 s mostrando print → render, link com UTM
próprio, cupom exclusivo do criador). Medir CPL e ativação como qualquer fonte. Só entra se a
frente B tiver validado a mensagem (para o criador usar a que converte).

### Fora do plano, de propósito

Performance Max e Display (sem sinal de conversão maduro), YouTube in-stream (custo e formato
16:9), LinkedIn (CPC > R$ 20; escritórios só na fase 2), marcas concorrentes como keyword
(jurisprudência do STJ), "gerador de imagem IA" genérico (posicionamento), desconto público em
mídia (ancora preço; a oferta é só para quem já testou).

---

## 4. Medição e LGPD — pré-requisito, não etapa

**Fonte da verdade continua sendo o funil first-party** (`marketing.acquisition_events` + Stripe),
lido no painel `/admin/marketing/ads` com o CSV semanal de gasto. As plataformas recebem só o
mínimo para otimizar, e por servidor.

| Item | Estado hoje | O que fazer | Esforço |
|---|---|---|---|
| Atribuição de cadastro (`gclid`/`fbclid`/UTM) | Funciona em prod (foi assim que julho foi lido) | Nada | — |
| Atribuição de assinatura a campanha | Evento existe mas sem UTM; PR #142 corrige e adiciona `first_generation`, checkout, CAPI | **Mergear PR #142 + aplicar migration** (precisa da autorização do dono) | 0,5 dia |
| Conversão no Google Ads | Tag no site sem label (no-op) | Criar ações `Cadastro` e `Assinatura` do tipo **importar de cliques**; script semanal exporta CSV (`gclid`, hora, valor) de `acquisition_events` | 0,5 dia |
| Tag do Google no site | Carregada em prod desde 23/07; contradiz a cláusula 7 | **Recomendação: remover** a tag (não mede nada hoje) e ficar 100% server-side. Alternativa: manter e adicionar banner de consentimento | 0,1 dia |
| Meta | Nada | Conversions API server-side (adapter no PR #142) com token gerado no Events Manager; eventos `Cadastro` e `Assinatura` com `fbc` | 0,5 dia |
| Cláusula 7 da Política | Já cita `sn_attribution`; promete "sem rastreadores de terceiros" | Acrescentar: "quando um clique em anúncio resulta em cadastro ou assinatura, informamos isso ao Google Ads/Meta de forma pseudonimizada (identificador do clique), por servidor, sem cookies de terceiros" — **revisar com jurídico** | texto pronto |
| Painel | Campanhas draft cadastradas | Cadastrar conjuntos/anúncios com naming `SN_*`, publicar pausado, aprovar ativação; CSV de gasto toda segunda; cron de alertas já roda 9h | rotina |

Se a CAPI do Meta não sair (bloqueio de acesso conhecido), a campanha roda otimizada por tráfego
e a leitura de cadastro/assinatura vem do funil próprio. Perde-se otimização, não medição.

---

## 5. Ativação: quatro correções antes de escalar

| Correção | Por quê (dado) | Esforço |
|---|---|---|
| **E-mails D0 / D2 / D7** (boas-vindas com "manda um print", exemplos, saldo) | 60% dos cadastros nunca geram; não existe nenhum e-mail além do auth. Precisa de provedor (Resend, plano gratuito cobre) | 1 dia |
| **"Testar com um projeto de exemplo"** no Renderizar | Ativação em 3 min e abandono = não tinha modelo em mãos | 0,5 dia |
| **CTA de saldo insuficiente em Editar, Ampliar e Animar** | Só Renderizar e Spaces têm; 2 das 4 assinaturas aconteceram no dia em que o saldo acabou | 0,5 dia |
| **Pergunta de perfil no cadastro** ("Você usa: SketchUp / Revit / Archicad / outro" · "Você é: arquiteto / designer / estudante / outro") | É a resposta mais barata para "quem é o público"; segmenta e-mails e alimenta públicos | 0,5 dia |

Opcional: opt-in de WhatsApp no cadastro (campo já existe no banco, nunca preenchido) para o dono
falar pessoalmente com os 10 mais ativos da semana.

---

## 6. Orçamento, metas e regras de corte

### Premissas de economia (marcar como premissa até ter 20+ assinaturas)

- ARPU R$ 89 (todas as assinaturas são Starter); margem bruta ~75% após custo de IA →
  **~R$ 67/mês de contribuição**.
- Vida média **6 meses** (premissa: 1 cancelamento em 4 no 1º mês, 3 renovações) → LTV de
  contribuição ≈ **R$ 400**.
- CAC: **aprender ≤ R$ 600** (fase 1) · **escalar ≤ R$ 400** (payback ≤ 6 meses) · **saudável ≤ R$ 200**.

### Fase 1 (4 semanas): R$ 2.520 de mídia

| Frente | Diário | 4 semanas | CPL esperado | Cadastros | Ativação alvo |
|---|---:|---:|---:|---:|---:|
| B Meta | R$ 50 | R$ 1.400 | R$ 15–30 (CPM Reels R$ 8–18, CTR 1%, LP 8–12%) | 45–90 | ≥ 50% |
| C Google Search | R$ 40 | R$ 1.120 | R$ 25–50 (CPC R$ 2–6 na cauda longa PT-BR) | 22–45 | ≥ 50% |
| A Reengajamento | — | R$ 0 | — | — | 2–3 assinaturas |

### Cenários ao fim da fase 1 (R$ 2.520)

| Cenário | CPL | Cadastros | Ativação | Cadastro→assinatura (30 d) | Assinaturas | CAC | Decisão |
|---|---:|---:|---:|---:|---:|---:|---|
| Pessimista | R$ 60 | 42 | 35% | 2% | 1 | R$ 2.520 | pausar mídia, corrigir funil |
| Base | R$ 35 | 72 | 50% | 5% | 3–4 | ~R$ 700 | seguir 4 semanas ajustando; não escalar |
| Alvo | R$ 25 | 100 | 55% | 7% | 7 | ~R$ 360 | escalar ×2 o vencedor |

### Regras de corte (automáticas, sem discussão)

- Grupo/conjunto com **R$ 300 gastos e 0 cadastros** → pausar.
- **CPL > R$ 80 depois de R$ 500** → pausar e trocar criativo/LP.
- **Ativação da fonte < 35% após 30 cadastros** → parar de comprar dessa fonte até trocar a mensagem.
- Anúncio com **CTR < 0,5% após 5.000 impressões** → substituir.
- Amostra insuficiente nunca decide (regra do painel): < 20 cadastros por célula = inconclusivo.

### Critério de sucesso em 60 dias (go/no-go em 10/11)

≥ 120 cadastros pagos · CPL ≤ R$ 35 · ativação ≥ 50% · 5+ gerações na 1ª semana ≥ 20% ·
≥ 6 assinaturas atribuídas · CAC ≤ R$ 450. Escala (R$ 5.000+/mês) só com CAC ≤ R$ 400.

---

## 7. Cronograma (8 semanas)

| Semana | Datas | Entregas |
|---|---|---|
| **0 — pré-voo** | 08–14/09 | Abrir a campanha de julho na conta do Google; mergear PR #142 + migration; ações de conversão off-line + script de exportação; decisão sobre a tag do Google; cláusula 7; CAPI do Meta (ou fallback); 3 LPs publicadas; e-mails D0/D2/D7; cupom `VOLTA20`; **disparo da frente A em 12/09**; campanhas cadastradas pausadas no painel |
| **1–2** | 15–28/09 | Dono ativa Meta (2 conjuntos × 6 anúncios) e Google (4 grupos); ritual de segunda; projeto de exemplo + CTA de saldo + pergunta de perfil entram em prod |
| **3–4** | 29/09–12/10 | Leitura 1 (≥ 60 cadastros pagos): cortar células, mensagem vencedora; rodada 2 de criativos; termos → exatas/negativas |
| **5–8** | 13/10–09/11 | Escalar o vencedor ×2 se CAC ≤ R$ 400; 1–2 criadores (frente D); leitura 2 em 10/11: go/no-go e orçamento de nov–dez |

**Ritual de segunda (30 min):** CSV de gasto → painel · termos de pesquisa · CPL por célula ·
ativação por fonte · assinaturas atribuídas · manter/cortar/escalar · registrar no experimento.
O cron `ads-report` já manda o relatório semanal às 9h de segunda; `ads-alerts` roda diário.

---

## 8. Decisões que precisam do dono

1. Abrir a conta do Google Ads e informar: tipo da campanha de julho, gasto total, termos de
   pesquisa, se havia conversão configurada.
2. Autorizar o merge do PR #142 e a migration `20260818000000_analytics_funnel.sql` em produção.
3. Tag do Google no site: remover e ir 100% server-side (recomendado) **ou** manter com banner
   de consentimento.
4. Cláusula 7: aprovar o acréscimo (revisão jurídica) antes de ligar mídia.
5. Cupom `VOLTA20` (20% no 1º mês, 14 dias, privado) para a frente A.
6. Orçamento da fase 1 (R$ 2.520) e se a frente D entra nas semanas 5–8.
7. Acesso ao Events Manager do Meta para gerar o token da Conversions API (sem isso, fallback
   por tráfego).
8. Pergunta de perfil no cadastro: aprovar as duas perguntas e os valores.

---

## Anexo — o que abrir na campanha de julho antes de gastar de novo

- Tipo (Pesquisa, Smart, Performance Max?) e configuração de correspondência.
- Gasto total 24–31/07 → dividir por 62 = CPL real do teste (com atribuição first-party).
- Relatório de termos de pesquisa: o que trouxe os 15 que ativaram × os 47 que não.
- Se houve ação de conversão: qual, e se estava contando cliques em "Testar grátis" em vez de cadastro.
- Horários e dispositivos dos cliques (madrugada e mobile costumam ser curioso, não escritório).
