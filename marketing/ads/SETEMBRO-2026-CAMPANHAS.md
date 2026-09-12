# Setembro/2026 — campanhas de tráfego pago (R$ 2.000/mês)

> Escrito em 2026-09-08 a pedido do dono ("gestor de tráfego, R$ 2.000/mês, configurar setembro").
> Processo: 3 frentes de pesquisa (Meta 2026, Google 2026, LGPD/ANPD/STJ) → 3 planos independentes
> (concentração · intenção · receita em 30 dias) → 2 juízes (economia/amostra · execução/risco) → síntese →
> copy de anúncios, LPs e e-mails com revisão adversarial de marca. Dados do funil lidos do banco de
> produção em 08/09. Complementa `PLANO-TRAFEGO-PAGO-2026-09.md` (05/09) e prevalece onde houver conflito.
>
> **Regra da casa mantida:** tudo entra PAUSADO; quem ativa é o dono.

## Decisões do gestor (sobre a síntese)

1. **Alocação: Meta R$ 55/dia em 2 células + Google R$ 10/dia como sonda + reengajamento a custo zero.**
   R$ 66/dia não sustentam nenhuma célula otimizada por cadastro; o criativo faz a segmentação e o número
   de células é o que chega a 20 cadastros em 30 dias.
2. **Incentivo do reengajamento = 500 nodes extras, não cupom.** O checkout de produção não aceita código
   promocional digitado (usa `discounts` fixo via `STRIPE_LAUNCH_COUPON_ID`), e reembolso parcial manual é
   fricção. O dono já credita nodes extras por SQL (`lumen_packs`, `admin_grant_AAAAMMDD_<quem>`, sem
   validade) — o incentivo só paga quando a pessoa assina (custo máximo ~R$ 36 de IA se usar tudo, contra
   R$ 89 de receita). Texto e SQL na seção Frente A.
3. **Nenhum sinal para plataforma em setembro** (sem Pixel, CAPI ou upload de gclid). A cláusula 7 da
   Política segue verdadeira; os `gclid` ficam gravados e valem 90 dias. O script de exportação já existe
   (`marketing/scripts/ads/export-google-conversions.mjs`) e o CSV de julho (62 cadastros) está pronto para
   subir assim que a cláusula 7 for aprovada — até ~22/10 ele ainda é aceito pelo Google.
4. **Leitura semanal por CSV no painel** com `marketing/scripts/ads/gerenciador-csv-para-painel.mjs`
   (converte o export do Gerenciador/Google para o formato do painel; soma posicionamentos; ignora linhas sem
   `SN_`).
5. **LPs publicadas por SQL** (`marketing.landing_pages`, `status=published`, `noindex`) e conjuntos/anúncios
   registrados no painel com os identificadores exatos das URLs — sem isso a leitura por anúncio fica cega.
6. **Acesso às contas nesta sessão não funcionou** (a janela que a extensão do Chrome abre é fechada/congelada
   do lado do dono). As planilhas "cole no Gerenciador" abaixo permitem montar tudo em ~90 min; ou repetir a
   sessão com a janela da extensão aberta.

---

## Plano final

## Resumo executivo
1. Base: **Plano 1 (Concentração)**. É o único que se monta em 2 dias com o que existe, sem gestão diária de lance, e cujos identificadores batem com o gerador do painel (`campanha + PROMESSA_CRIATIVO_COPY`, 7 segmentos) — logo a leitura por anúncio funciona; os outros dois ficam cegos por anúncio até reescrever os ids.
2. Enxertos obrigatórios: **Frente A** do Plano 3 (reengajamento manual, custo de mídia zero, única fonte com histórico real de assinatura), as **regras de qualidade** do Plano 3 (R$ 1.000 sem usuário 5+ → pausa tudo; 30 cadastros sem usuário 10+ → pausa a célula), a **higiene de amostra** do Plano 2 (`?gclid=teste123` + `INTERNAL_STAFF_EMAILS`), a regra de **AI Max religado** do Plano 2 e a **releitura de 45 dias** (assinatura chega semanas depois).
3. Alocação: Meta R$ 55/dia em **2 células ABO de R$ 27,50** (FIDELIDADE × ROTINA, 3 Reels cada, Tráfego → visualizações de LP) = R$ 1.650; Google Pesquisa **R$ 10/dia** como sonda de intenção (exata, Maximizar cliques com teto R$ 4) = R$ 304; reserva R$ 46. Frente A: R$ 0 de mídia.
4. Tese: R$ 66/dia não alimentam nenhuma célula otimizada por cadastro (precisaria ~R$ 250/dia para 50 eventos/7 d). Então o Meta otimiza por LPV (50 eventos em ~4 dias por conjunto) e o **criativo faz a segmentação** (print do SketchUp na abertura, preço na legenda, botão Cadastre-se); o número de células é o que chega a **20 cadastros em 30 dias** (regra do painel): cabem 2.
5. O que decide setembro NÃO é LPV nem CPL: é **ativação por célula**, **usuários com 10+ gerações na 1ª semana** (único preditor calibrado em dado próprio: 22% assinam, n=9) e assinatura atribuída (30 e 45 dias).
6. O Google entra pequeno porque julho é o único dado real da conta e diz que Google genérico traz volume sem ativação (62 → 24% → 0 assinaturas); setembro compra o **relatório de termos e o CPC real** de "renderizar sketchup"/"planta humanizada" para decidir outubro, não uma célula conclusiva.
7. Nenhum sinal vai para plataforma este mês (sem Pixel, sem CAPI, sem upload de gclid): a cláusula 7 continua verdadeira; medição 100% first-party como já roda em prod. Os `gclid` ficam gravados e podem ser subidos retroativamente em até 90 dias, depois da cláusula 7 aprovada.
8. Resultado esperado no cenário base (tudo premissa): **~54 cadastros pagos, CPL ~R$ 36, 2 assinaturas de mídia em 30 d (3 em 45 d) + 1–2 da Frente A**; CAC de mídia ~R$ 650–1.000 em 45 d. A mídia **não se paga em setembro** em nenhum cenário exceto o alvo; ela compra a primeira medição real "mídia → usuário 10+ → assinatura" com clique pré-qualificado.
9. Fica de fora, com o porquê em uma frase: CPC manual com 24 palavras-chave (P2) — exige lance diário que o dono não vai fazer; célula Meta "quente" (P2) — público de engajamento < 5 mil vira fria disfarçada; 3 células iguais/campanha PLANTAHUM a R$ 14 (P3) — nenhuma chega a 20 cadastros; lote 3 "dono renderiza para 73" (P3) — 3 h do dono por 0–1 assinatura; cupom como pré-requisito (P3) — vira decisão opcional do dono, não trava o plano; grupos RENDERIA/IAARQ (plano de agosto) — julho provou que intenção genérica traz curioso; objetivo Leads/CAPI/Pixel/upload de gclid — cláusula 7 e verba; lookalike — < 100 pagantes e sem consentimento; sitelink "Plugin do SketchUp" (P3) — `.rbz` não assinado; criar a ação de conversão "Cadastro" agora (P3) — peça a mais sem uso até a cláusula 7; Frente D (criadores) — só com mensagem validada.
10. Leitura de decisão **qui 08/10** (27 dias de dado); fechamento de gasto **ter 13/10** (12/10 é feriado); releitura de assinaturas **seg 26/10** (45 dias).
11. Condição de derrota número 1: ninguém roda o ritual de segunda (CSV + painel + SQL + Stripe). Sem ele, as regras de corte não existem e o mês vira julho com menos dinheiro.
12. Tudo nasce **PAUSADO**; ativação é do dono (sex 11/09 até 10h).

## Alocação (30 dias, 11/09–10/10)
| Célula | Diário | 30 dias | Por quê |
|---|---:|---:|---|
| Meta — conjunto FIDELIDADE (3 Reels, COPY01) | R$ 27,50 | R$ 825 | Menor verba que chega a ~20 cadastros em 30 d com CPL 36 (premissa); 50 LPV em ~4 dias |
| Meta — conjunto ROTINA (3 Reels, COPY02) | R$ 27,50 | R$ 825 | Idem; é a 2ª e última célula que cabe |
| Google Pesquisa — SKETCHUP + PLANTAHUM (exata, Max. cliques teto R$ 4) | R$ 10 | R$ 304 | Sonda: termos + CPC real + ativação dos poucos cadastros de intenção pura; sem gestão diária |
| Frente A — reengajamento manual (lotes 1 e 2) | R$ 0 | R$ 0 | Custo real = tempo do dono (+ cupom, se ele decidir) |
| Reserva | — | R$ 46 | Folga entre R$ 1.650 planejados e o limite de gastos da campanha Meta (R$ 1.696) |
| **Total** | **R$ 65** | **R$ 2.000** | Teto duro: limite de campanha Meta R$ 1.696 + término 10/10 em tudo + teto mensal do Google 30,4× |

Travas: Meta pode gastar acima do diário em dias isolados (P1 diz 25%, P3 diz 75% — nenhum cita fonte; **premissa**, conferir no Gerenciador); o limite de gastos da campanha é a trava real. Google gasta até 2× o diário num dia, limitado a 30,4× no mês. Soma máxima possível: 1.696 + 304 = R$ 2.000.

Se o Gerenciador exigir mínimo em BRL acima de R$ 27,50 para LPV: trocar a meta de desempenho para "cliques no link" antes de subir o diário; se ainda assim exigir R$ 30, conjuntos a R$ 30 e Google a R$ 6/dia (R$ 182) — soma R$ 1.982.

## Tese (o que setembro compra)
- **Meta:** "clique pré-qualificado pelo criativo (print do SketchUp + preço + Cadastre-se) ativa ≥ 45%, contra 24% do Google genérico de julho" e "qual mensagem (fidelidade × rotina) traz usuário que ativa" — só se as duas células passarem de 20 cadastros (base chega no limite, dia 26–30; **sensibilidade: CPM R$ 22 em vez de 18 derruba cada célula para ~19 e as duas ficam inconclusivas** — risco aceito e declarado).
- **Google:** "quais termos de SketchUp/planta trazem gente com projeto" — relatório de termos + CPC real + ativação dos 3–18 cadastros; não decide CPL.
- **Frente A:** "quem já gastou os 80 nodes assina com um empurrão pessoal" — custo zero, amostra de 27 + 22.
- **Comparação entre células:** por custo por usuário ativado e por usuário "10+", nunca por CPL (P2).

## KPIs e metas de 30 dias (leitura qui 08/10; fechamento 13/10; assinaturas 26/10)
| Métrica | Mínimo aceitável | Alvo | Fonte |
|---|---|---|---|
| Investimento | ≤ R$ 2.000 | R$ 1.954 | CSV |
| Cadastros pagos | ≥ 45 (Meta ≥ 40, Google ≥ 5) | 55+ | painel (`acquisition_events` por `utm_content`) |
| CPL global | ≤ R$ 45 | ≤ R$ 35 | painel |
| Célula com ≥ 20 cadastros | ≥ 1 célula Meta | as 2 | painel |
| Ativação (≥ 1 geração em 7 d) da fonte paga | ≥ 45% | ≥ 50% | painel (computeActivatedUsers por campanha) + SQL por célula |
| Usuários pagos com 5+ / 10+ gerações na 1ª semana | ≥ 15% / ≥ 4 pessoas | ≥ 20% / ≥ 6 | SQL |
| Assinaturas atribuídas à mídia (30 d / 45 d) | ≥ 1 / ≥ 2 | ≥ 3 / ≥ 4 | Stripe + SQL manual |
| CAC de mídia (45 d) | ≤ R$ 1.000 **ou** ≥ 5 usuários 10+ | ≤ R$ 667 ("aprender ≤ 600" só fecha com ≥ 4 assinaturas — alvo) | cálculo |
| Frente A (fora do CAC de mídia) | ≥ 10 respostas, ≥ 1 assinatura | ≥ 2 assinaturas | planilha + Stripe |
| Google | termos de 4 semanas → lista v2 de exatas/negativas; CPC médio real por grupo | ≥ 3 cadastros com ativação ≥ 50% | Google Ads |

KPIs semanais de saúde (segunda): Meta CPM R$ 14–22 (alarme > 30 por 3 dias), CTR de link ≥ 1,0% (alarme < 0,5% após 3.000 impr.), CPC ≤ R$ 2 (alarme > 3,50), frequência 7 d ≤ 2 (rodada 2 se > 3), taxa de gancho ≥ 20% (premissa, diagnóstico), gasto Meta ≤ R$ 385/semana (alarme > R$ 480, premissa); Google CPC ≤ R$ 4 (impressões caindo = teto batendo), CTR ≥ 3%, ≥ 3 termos novos → exata/semana; LP conversão ≥ 2% com 200 views (regra do painel; ≥ 4% sobre LPV inflado). **LPV, cliques, gancho e ThruPlay nunca decidem — só diagnosticam** (LPV sem Pixel é estimada, 200–3.000% acima do real em outras contas).

Go/no-go de outubro (08/10, confirmado 13/10): (a) ativação ≥ 45% **e** (CAC 45 d ≤ R$ 667 **ou** ≥ 5 usuários 10+) → outubro R$ 2.000 concentrado na célula vencedora + rodada 2; Leads/CAPI só com cláusula 7 aprovada e orçamento ≥ R$ 150/dia (premissa); (b) ativação < 35% → pausar mídia e corrigir ativação (PR #140, projeto de exemplo, CTA de saldo) — o problema não é mídia; (c) < 20 cadastros no total → CPM/CTR/LP: trocar criativos e LP antes de repor verba; (d) Google só continua se ≥ 5 cadastros com ativação ≥ 50% ou termos claramente melhores que o Reels; (e) Frente A: se ≥ 2 assinaturas, repetir em outubro com o pool novo (cadastros pagos de setembro que bateram na parede).

## Regras de corte (automáticas; quem executa é o ritual de segunda ou o cron)
**Anúncio (Meta)** — edição só às segundas (adicionar/remover anúncio reinicia o aprendizado do conjunto):
1. CTR de link < 0,5% após 3.000 impressões → pausar; entra o próximo da reserva na mesma célula.
2. ≥ 120 cliques e 0 cadastros → substituir (P3).
3. Reprovado na revisão → contestar uma vez; se mantiver, reserva.
4. Frequência > 3,0 em 7 d no conjunto → rodada 2: trocar os 2 de pior CTR pelos 2 melhores da reserva.

**Célula (conjunto Meta / grupo Google)**
5. R$ 250 gastos e 0 cadastros → pausar a célula (Meta: mover os R$ 27,50 para a outra — edição significativa, aceitar o reinício).
6. CPL > R$ 80 depois de R$ 400 → pausar e trocar criativos/LP antes de religar.
7. CPM > R$ 30 por 3 dias → desmarcar Feed IG e conferir faixa etária; se persistir 3 dias, pausar.
8. **30 cadastros e 0 usuários com 10+ gerações → pausar mesmo com CPL bom** (trouxe curioso barato — foi julho).
9. Google: grupo com R$ 150 e 0 cadastros → pausar o grupo; os 2 grupos caindo → pausar a campanha e passar os R$ 10 para o Meta (R$ 32,50/conjunto) numa segunda.
10. Google: termo com ≥ 10 cliques e 0 cadastros → negativa exata na hora; termo com cadastro → exata; CPC médio > R$ 5 por 7 d → teto para R$ 3. **Não** adotar "R$ 60 e 0 cadastros → pausar keyword" (pausa keyword boa em ~1 de 4 vezes a CPL 40).
11. Google: AI Max / correspondência ampla / recomendação auto-aplicada religados → desligar no mesmo dia; conferir Histórico de alterações toda segunda.

**Fonte / qualidade**
12. Ativação < 35% após 30 cadastros de uma fonte → parar de comprar dessa fonte até trocar mensagem/LP.
13. **R$ 1.000 acumulados com 0 usuários pagos com 5+ gerações → pausar TODA a mídia** até corrigir ativação; Frente A continua; o resto do mês vai para PR #140/projeto de exemplo/CTA de saldo (P3). Esperança no base: 4–5 usuários 5+ — dispara só com funil quebrado.
14. LP com ≥ 200 views e conversão < 2% → destino para a home com as mesmas UTMs (só na segunda) e abrir chamado na LP.
15. Alerta "R$ 100 sem conversão" em 2 segundas seguidas na mesma célula → regra 5 ou 6 obrigatória.

**Orçamento**
16. Acumulado ≥ R$ 1.954 antes de 10/10 → pausar tudo (limite de campanha R$ 1.696 e término 10/10 já travam).
17. Nunca subir o diário de uma célula > 20% de uma vez (premissa de mercado) nem antes de 7 dias sem edição; **escala zero em setembro** (P2).

**O que nunca decide**
18. < 20 cadastros na célula = inconclusivo: não escolher mensagem vencedora; com menos de 20 só as regras 1–15 cortam.
19. 1–5 assinaturas são ruído: decidem o total do mês, nunca a alocação entre células.

## Calendário
**Ter 08/09 (hoje)** — Dono aprova alocação (55 + 10, 2 células, Tráfego/LPV, Google só exata, Frente A opcional). Dono, Google Ads (40 min): abrir a campanha de 24–31/07 (Campanhas → filtro Status Removida/todas → 24–31/07/2026 → coluna Tipo de campanha; Insights e relatórios → Termos de pesquisa; Histórico de alterações). Anotar tipo, gasto, cliques, CPC, CTR, termos; **gasto ÷ 62 = CPL real de julho** (substitui a premissa de CPC). Conferir codificação automática ON; desligar aplicação automática de recomendações. Dono, Meta (15 min): busca de segmentação (Arquitetura, Design de interiores, SketchUp, Autodesk Revit, Autodesk 3ds Max — existência é premissa), criar públicos de engajamento (IG 365 d; vídeo 50% 365 d) e anotar tamanho; conferir método de pagamento, limite da conta e o aviso de mínimo em BRL. Time: rascunhar LPs e cadastrar conjuntos/anúncios `SN_*` no painel.

**Qua 09/09** — Publicar `/lp/print-do-sketchup` e `/lp/planta-humanizada` pelo painel (published, noindex). Teste de atribuição: URL completa com `?gclid=teste123&fbclid=teste456` + UTMs → CTA → cadastro com e-mail em `INTERNAL_STAFF_EMAILS` → conferir linha em `marketing.acquisition_events` com `utm_content` = id do anúncio em minúsculas. Conferir corte no celular e as imagens de `casa` (arquivos trocados). Escolher a faixa da Sound Collection (ambiente/cinematográfica, calma, sem vocal, ≥ 10 s) e anotar o nome. Google: montar `SN_NEG_CAPTACAO_v1` na Biblioteca compartilhada já com os termos ruins de julho. Meta: criar campanha PAUSADA completa (§ estrutura) e enviar para revisão (até 24 h).

**Qui 10/09** — Google: criar campanha PAUSADA (§ estrutura), conferir AI Max OFF duas vezes, nenhuma meta herdada, parceiros/Display off, Presença. Painel: publicar tudo pausado; conferir que identificadores batem com as URLs; registrar no experimento a nota "guardrail CAC R$ 200 e alerta R$ 100 vão disparar em aprendizado (teto R$ 600)". Dono: decidir tag AW (remover via PR mínima ou registrar risco) e cupom VOLTA20 (sim/não).

**Sex 11/09** — 9h checklist: anúncios aprovados? LPs 200 OK com UTMs? negativas aplicadas? auto-tagging ON? limite de gastos R$ 1.696? término 10/10 nos 2 conjuntos e na campanha Google? Até 10h **dono ativa** Meta e Google. 17h: impressões > 0 nos 2 conjuntos e 2 grupos; nenhum reprovado; `fbclid`/`gclid` chegando em `acquisition_events`. Nenhuma outra edição. Dono: e-mail manual para cada cadastro pago do dia ("manda um print, qualquer print") enquanto PR #140 não sai.

**Sáb 12 / dom 13/09** — só olhar entrega, reprovação e gasto anormal (> R$ 70/dia no Meta, > R$ 20 no Google). Não editar.

**Seg 14/09 — ritual 1 (3 dias de dado)** — CSV → painel; CPM/CTR/CPC/gancho por anúncio; cadastros por célula; termos do Google → negativas. Nenhum corte por CPL; só regras 1, 3, 10, 11. Registrar no experimento. **Frente A, lote 1: 27 "na parede"** (se o dono topou).

**Semanas seguintes (ritual segunda 9h–9h30; quinta 10 min só termos → negativas nas semanas 1–2)**
| Quando | Leitura | Decisões permitidas |
|---|---|---|
| Qui 17/09 | 10 min: termos; CPC médio × premissa; frequência | Regras 10–11; Frente A lote 2 (22 ativados com saldo) |
| Seg 21/09 (10 d, ~R$ 650) | 1ª leitura de ativação (coorte 11–14/09); CPL por célula; termos | Regras 1–11; célula com R$ 250 e 0 → pausar e mover; Google com R$ 100 e 0 → pré-aviso |
| Seg 28/09 (17 d, ~R$ 1.100) | Frequência; conversão de LP (≥ 200 views); ativação com ~30 cadastros; 5+/10+ por célula; regra 13 | **Rodada 2 de criativos** se frequência > 3 ou regra 1 (piscina e zoom-cozinha primeiro); regras 8, 12, 13 já podem disparar; 2º e-mail curto da Frente A (se cupom, "vence 02/10") |
| Seg 05/10 (24 d, ~R$ 1.550) | 1ª célula pode cruzar 20; assinaturas até aqui; CPL projetado | Nada novo (congelar 05–10/10 para leitura limpa); preparar consulta final |
| **Qui 08/10 — leitura de decisão** | Cadastros, CPL, ativação, 5+/10+, assinaturas, CAC por célula; termos consolidados; status da cláusula 7 | Go/no-go de outubro conforme KPIs; orçamento de outubro |
| Sáb 10/10 | Fim: Google termina sozinho; Meta pausar se o limite não travou | — |
| Ter 13/10 (12/10 feriado) | Fechamento de gasto e números finais; exportar termos e os `gclid` de setembro (válidos 90 d) | Confirmar a decisão de 08/10; se cláusula 7 aprovada, criar ação "Cadastro" e subir os gclid |
| Seg 26/10 | Releitura de assinaturas (45 d); CAC definitivo | Ajustar outubro se o CAC mudar de faixa |

## Cenários (30 dias; tudo premissa exceto orçamento; não existe benchmark BR para "arquitetura"; único dado real do nicho = campanha de julho, gasto ainda não lido)
Cadeia por célula Meta (R$ 825): impressões = 825 ÷ CPM × 1.000 → cliques = × CTR → LPV = × 70% → cadastros = × conversão da LP. Google: cliques = 304 ÷ CPC → cadastros = × conversão.

| | Pessimista | Base | Alvo |
|---|---|---|---|
| CPM Reels/Stories (Superads mediana ≈ R$ 18,7; Trafius 10–22; MasterPlan 15,7–26,1) | R$ 26 | R$ 18 | R$ 14 |
| CTR de link (MasterPlan Reels 0,8–2,4%) | 0,8% | 1,2% | 1,8% |
| CPC Meta (derivado) | R$ 3,25 | R$ 1,50 | R$ 0,78 |
| LPV (2 células, 70% dos cliques) | 355 | 770 | 1.485 |
| Conversão LP → cadastro | 4% | 6% | 6% (CPL travado em R$ 20) |
| **Cadastros Meta** | **14** (7/célula) | **46** (23/célula) | **82** |
| Google CPC / conversão | R$ 4 / 4% | R$ 3 / 8% | R$ 2 / 10% |
| **Cadastros Google** | **3** | **8** | **15** |
| **Total / CPL** | **17 / R$ 115** | **54 / R$ 36** | **97 / R$ 20** |
| Ativação (julho pago 24%, orgânico 60%) | 30% → 5 | 50% → 27 | 55% → 53 |
| 5+ gerações 1ª semana (orgânico 21%, pago jul 0%) | 5% → 1 | 15% → 8 | 20% → 19 |
| 10+ gerações 1ª semana | 0 | 8% → 4 | 12% → 12 |
| Assinaturas de mídia 30 d / 45 d (orgânico 7%; pago jul 0%) | 0 / 0–1 | 2 / 3 | 6 / 8 |
| CAC de mídia 45 d | — | R$ 651 | R$ 244 |
| Frente A — assinaturas (27 na parede a 3/7/12%; 22 ativados a 0/3/5%; população pré-filtrada — já viram e não pagaram) | 1 | 1–2 | 3–4 |
| **Assinaturas novas no mês (30 d)** | **1** | **3–4** | **9–10** |
| MRR ao fim (R$ 267 + 89 × novas) | R$ 356 | R$ 534–623 | R$ 1.068–1.157 |
| Célula com ≥ 20 cadastros? | nenhuma | as duas, no limite (dia 26–30) | as duas |
| Decisão em 08/10 | pausar mídia; regras 5/6/13 já cortaram ~dia 18; corrigir criativo/LP/ativação | seguir em outubro na célula de melhor ativação; não escalar; cláusula 7 para gclid/CAPI | outubro R$ 2.000 na vencedora + rodada 2; pedir R$ 3–4 mil para novembro só se CAC 45 d ≤ R$ 400 |

Sensibilidade que importa: CPM 22 → ~19 cadastros/célula (inconclusivo). Leitura honesta: com LTV ~R$ 400 (ARPU 89, ~R$ 67/mês, 6 meses — premissa), o base **não** paga a mídia em 30 dias (CAC ~R$ 650–1.000); o que muda base → alvo não é CPM, é cadastro → assinatura (4% → 6%), que depende de ativação — as correções de ativação (PR #140, projeto de exemplo, CTA de saldo) valem mais que qualquer lance.

## Riscos (com mitigação)
1. **Tráfego/LPV compra clicador, não arquiteto** (otimiza página vista, LPV inflada). Mitigação: criativo abre no print, preço na legenda, Cadastre-se, LP na mesma linguagem; regras 8, 12, 13. Sinal: CTR alto + conversão de LP baixa em 21/09.
2. **Interesses de software não existem mais** (consolidação 15/01/2026; não verificável). Mitigação: Advantage+ com o que existir + públicos de engajamento como sugestão; o criativo segmenta. Não travar o lançamento.
3. **Criativos mudos** (Meta: −4,8% CPA com som). Mitigação: mesma faixa da Sound Collection nos 6; fallback: aprimoramento "adicionar música" com 5 faixas fixas.
4. **Revisão / conta com pouco histórico.** Mitigação: publicar pausado quarta; contestar uma vez; reserva de 4 Reels.
5. **LP não publicada até 11/09** (hoje 404). Mitigação: home com UTMs (foi assim em julho); LP entra na semana 2 numa segunda (troca de URL = edição).
6. **Amostra no limite** (20/célula só no fim do mês; CPM 22 derruba). Mitigação: regra 18; leitura de mensagem pode precisar de 45 dias.
7. **Google R$ 10/dia não decide nada**; "planta humanizada" pode ter CPC acima do teto. Mitigação: objetivo declarado = termos + CPC real; regra 9 devolve a verba.
8. **LGPD**: nada de Pixel/CAPI/upload em setembro; a tag AW já contradiz a cláusula 7 (cookie `_gcl_au`, ping ao DoubleClick) e a ANPD colocou publicidade direcionada como eixo 2026–27. Mitigação: remover a tag (PR mínima). Concorrentes só como negativas (STJ REsp 2.032.932 e 2.096.417 condenam anunciante e Google); "SketchUp" só em uso descritivo.
9. **Julho se repete** (cadastro em 3 min que não volta; sem e-mail de boas-vindas). Mitigação: e-mail manual do dono D0; regras 8, 12, 13; go/no-go (b).
10. **Gasto acima do plano** (Meta estoura o diário; Google 2×). Mitigação: limite de campanha R$ 1.696, término 10/10 em tudo, regra 16.
11. **Defaults das plataformas reabrem a torneira** (AI Max, parceiros, "presença ou interesse", metas herdadas, recomendações auto-aplicadas; Advantage+ e aprimoramentos no Meta). Mitigação: checklist item a item + regra 11 toda segunda.
12. **Frente A depende do dono** (e-mails da caixa pessoal, sem provedor; BCC de 10 é premissa de entregabilidade). Mitigação: fora do critério de sucesso da mídia; lotes 1 e 2 apenas; opt-out "responda SAIR" registrado em planilha.
13. **Operação**: sem o ritual de segunda o painel fica cego. Mitigação: 30 min fixos; cron `ads-alerts` já roda.
14. **Sem Pix** (invite-only): parte dos autônomos não paga com cartão (premissa). Anotar quem pede boleto/Pix nos 1:1.

Condições de derrota (reconhecer cedo): ativação paga < 35% com ≥ 30 cadastros (21–28/09) → parar de comprar; conversão de LP < 2% com 200 views → trocar LP; CPM sustentado > R$ 30 → amostra cai pela metade; 0 assinaturas com ≥ 45 cadastros em 45 d → o problema é produto/ativação/preço, o próximo real vai para ativação; contar LPV/cliques como resultado; editar fora das segundas.

---

## Meta Ads — conta act 10202044711098425 (Gerenciador de Anúncios)

## Campanha (já existe como draft no painel — usar o mesmo identificador)
| Campo | Valor |
|---|---|
| Nome | `SN_META_PROSPECCAO_ARQUITETO` |
| Objetivo | **Tráfego** (Leads/Vendas exigem evento no dataset — não há Pixel/CAPI; o fluxo unificado Advantage+ de Leads exigiria orçamento de campanha e todos os posicionamentos). Se o Gerenciador empurrar "Advantage+", escolher configuração manual |
| Tipo de compra | Leilão |
| Orçamento de campanha Advantage+ (CBO) | **DESLIGADO** — ABO, para forçar 50/50 entre as células |
| Limite de gastos da campanha | **R$ 1.696** (trava real; 2.000 − 304 do Google) |
| Categorias especiais | Nenhuma |
| Teste A/B nativo | Não (o teste é o desenho ABO; A/B nativo divide ainda mais a amostra) |
| Status ao publicar | **PAUSADA** (regra da casa; ativação do dono sex 11/09) |

## Conjuntos (2, idênticos exceto criativo/copy)
| Campo | Conjunto 1 | Conjunto 2 |
|---|---|---|
| Nome | `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE` | `SN_META_PROSPECCAO_ARQUITETO_ROTINA` |
| Local de conversão | Site | Site |
| Meta de desempenho | **Maximizar o número de visualizações da página de destino** (não exige Pixel desde jul/2025; se o Gerenciador exigir, cair para "Maximizar o número de cliques no link") | idem |
| Estratégia de lance | Maior volume, sem teto de custo | idem |
| Orçamento | Diário **R$ 27,50** (conferir aviso de mínimo em BRL — premissa; fallback no plano) | R$ 27,50 |
| Programação | Início 11/09/2026 09:00 · **Término 10/10/2026 23:59** | idem |
| Localização | Brasil — "Pessoas que moram neste local" | idem |
| Idade | Mínima 24 (controle rígido); sugestão 24–55 | idem |
| Idioma | Português (Brasil) | idem |
| Público | **Público Advantage+ LIGADO** com sugestões: interesses "Arquitetura", "Design de interiores", "SketchUp", "Autodesk Revit", "Autodesk 3ds Max" — **só os que existirem na busca** (existência é premissa; consolidação de 15/01/2026) + públicos personalizados de engajamento criados antes em Públicos: "Instagram — todas as pessoas que interagiram com esta conta profissional, 365 dias" e "Vídeo — assistiram ≥ 50% de qualquer vídeo, 365 dias" (dado 1P da Meta, sem nada no site). **Sem** lookalike (< 100 pagantes; subir e-mails = PII sem consentimento). Exclusões: nenhuma | idem |
| Posicionamentos | **Manuais**: Instagram Reels, Instagram Stories, Instagram Feed, Facebook Reels, Facebook Stories. **Desmarcar**: Facebook Feed, Audience Network, Messenger, Marketplace, in-stream, resultados de pesquisa, coluna direita, Threads, Explorar. Conferir na prévia do Feed IG se o corte 4:5 esconde o card final; se esconder, desmarcar Feed IG. (Isso tira o rótulo Advantage+ — aceito) | idem |
| Dispositivos / SO | Todos | Todos |
| Cobrança | Impressão | Impressão |

## Anúncios (6 = 3 por conjunto; vídeo único 9:16; arquivo `marketing/output/2026-09-04-reel-<slug>-ad/2026-09-04-reel-<slug>-ad.mp4`, 1080×1920, 30 fps, H.264 — dentro da spec)
Identificador = o que o painel gera (`campanha + PROMESSA_CRIATIVO_COPY`, 7 segmentos); `utm_content` = identificador em minúsculas.

| Conjunto | Nome do anúncio | Reel (slug) | Copy | Ordem de teste |
|---|---|---|---|---|
| FIDELIDADE | `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_DRONE_COPY01` | drone-nada-sai-do-lugar (6,0 s) | COPY01 | 1 |
| FIDELIDADE | `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_PISCAFACHADA_COPY01` | pisca-fachada-geminada (6,0 s) | COPY01 | 1 |
| FIDELIDADE | `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_BANHEIRO_COPY01` | banheiro-conte-o-que-saiu (8,5 s) | COPY01 | 1 |
| ROTINA | `SN_META_PROSPECCAO_ARQUITETO_ROTINA_DUASREUNIOES_COPY02` | entre-duas-reunioes (8,5 s) | COPY02 | 1 |
| ROTINA | `SN_META_PROSPECCAO_ARQUITETO_ROTINA_TRESANTES14_COPY02` | tres-antes-das-14h-ep01 (9,5 s) | COPY02 | 1 |
| ROTINA | `SN_META_PROSPECCAO_ARQUITETO_ROTINA_CINCOCLIMAS_COPY02` | um-print-cinco-climas (8,5 s) | COPY02 | 1 |

A mensagem é lida **por célula** (copy + tema), nunca por anúncio; o 3º criativo de cada célula existe para diversidade (Andromeda), não para leitura própria.

**Rodada 2 (seg 28/09, se frequência > 3 ou regra 1):** entram, nesta ordem, `print-render-video-piscina` (ROTINA, `…_ROTINA_PISCINA_COPY02`), `zoom-cozinha-cada-peca` (FIDELIDADE, `…_FIDELIDADE_ZOOMCOZINHA_COPY01`), depois `editar-so-o-piso` e `video-vertical-fachada`. Os 9 Reels orgânicos de 05/09 só se promovidos a versão -ad; os 6 do plugin **não** entram (`.rbz` não assinado).

### COPY01 (FIDELIDADE) — texto principal (linha 1 ≤ 125; os 44 primeiros visíveis no Reels: "Nada sai do lugar: o print do SketchUp vira")
```
Nada sai do lugar: o print do SketchUp vira render fotorrealista, fiel ao seu modelo. Feito por arquiteto, em português.
Planos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão.
```
Título (27/40): `Render fiel ao seu SketchUp` · Descrição (28/30): `80 nodes grátis · sem cartão` · Botão: **Cadastre-se** (SIGN_UP)

### COPY02 (ROTINA) — linha 1 (113)
```
Reunião de manhã com o print, reunião da tarde com a imagem. Render em minutos, no navegador, feito por arquiteto.
Planos a partir de R$ 89/mês. Comece com 80 nodes grátis, sem cartão.
```
Título (29/40): `Do print à imagem, em minutos` · Descrição (28/30): `80 nodes grátis · sem cartão` · Botão: **Cadastre-se**

Conferido contra `docs/marketing/prohibited-content.md`: sem léxico proibido, sem emoji, "em minutos" é claim aprovado, R$ 89 e 80 nodes conferidos, "feito por arquiteto" é fato, IA não é o assunto, plugin não citado, oferta de 50% não citada, sem cupom.

### Áudio (os 10 criativos são MUDOS — aceito, mas a Meta reporta −4,8% CPA e +5,1% CTR com som)
Em cada anúncio: Criativo → **Editar vídeo → Música → Sound Collection** (grátis; licença só para superfícies Meta) → gênero Ambiente/Cinematográfico, humor Calmo, **sem vocal**, ≥ 10 s → **a mesma faixa nos 6 anúncios** (isola a variável mensagem) → volume 100% (não há áudio original), fade out no card final. Fallback se a edição não existir na conta: deixar ligado só o aprimoramento "Adicionar música" com as mesmas 5 faixas escolhidas manualmente nos 6 anúncios. Nunca música comercial.

### Aprimoramentos Advantage+ creative
**Desligar todos** (expansão de vídeo, sobreposição de texto, legendas automáticas — não há fala —, aprimoramentos visuais, comentários relevantes, informações do site); manter só música conforme acima. Conferir o guardrail de zona segura (14% topo / 35% base / 6% laterais) na prévia de Reels: se o card final cair na faixa inferior, avisar o time de criativo antes de ativar (premissa: as versões -ad respeitam).

### Identidade e destino
Página do Facebook + Instagram da SpaceNode (as mesmas do anúncio de julho). Link de exibição: `spacenode.app`. Sem formulário instantâneo (o cadastro precisa ser no site para dar os 80 nodes).

**URL do site, literal por anúncio** (não usar `{{ad.name}}`; o painel espera minúsculas; a Meta anexa `fbclid` sozinha e o cookie `sn_attribution` já lê `fbclid` + UTMs):
```
https://spacenode.app/lp/print-do-sketchup?utm_source=meta&utm_medium=paid_social&utm_campaign=sn_meta_prospeccao_arquiteto&utm_content=<identificador do anúncio em minúsculas>&utm_term=arquiteto
```
Exemplo: `…&utm_content=sn_meta_prospeccao_arquiteto_fidelidade_drone_copy01&utm_term=arquiteto`.
Fallback se a LP não estiver publicada em 11/09: `https://spacenode.app/?` + mesmos parâmetros (foi a landing de julho). Nunca `utm_medium=paid` (erro de julho).

## Landing page `/lp/print-do-sketchup` (publicar pelo painel — é dado em `marketing.landing_pages`, não código)
- eyebrow fixo "Visualização arquitetônica" · h1: **"O print do SketchUp vira a imagem da reunião. Nada sai do lugar."** · sub: "Suba o print do seu modelo e receba o render fotorrealista em minutos, com a geometria do projeto intacta. Feito por arquiteto brasileiro, tudo no navegador." · CTA (lista aprovada): **"Teste com um projeto real"** → `/login?mode=signup` com UTMs preservadas · linha fixa "80 nodes grátis · sem cartão".
- Seções, nesta ordem: `before_after` (pares living, banheiro, coworking; se usar `casa`: `before` = `gallery-casa-after.jpg` e `after` = `gallery-casa-before.jpg` — arquivos trocados no disco; não usar comercial) → `value_props` (Geometry Lock — "o render respeita o seu modelo, não inventa outro"; Em minutos — "sem fila, sem madrugada"; No navegador — "sem placa de vídeo, sem instalação"; Em português — "feito por arquiteto brasileiro, suporte em português") → `how_it_works` (1 "Tire o print do SketchUp (ou de qualquer modelo)" · 2 "Suba no Renderizar e escolha o motor" · 3 "Receba a imagem em minutos e apresente") → `modules` [renderizar, spaces, planta_humanizada, animar] → `quote` ("apresento na própria reunião, o cliente fecha mais rápido" — cliente SpaceNode; depoimento real) → `faq` ("Preciso de plugin?" → "Não. Qualquer print funciona. Também dá para renderizar de dentro do SketchUp com o plugin." — detalhe secundário; nunca "importa o .skp" · "Quanto custa?" → "Cadastro grátis com 80 nodes, sem cartão. Planos a partir de R$ 89/mês (750 nodes)." · "O que faço com 80 nodes?" → "Até 8 renders HD no Pulsar (10 nodes cada) ou 4 em 2K no Vega (20 cada)." · "A IA muda meu projeto?" → "O Geometry Lock trava a geometria." · "Funciona com Revit/Archicad?" → "Sim, com qualquer print ou imagem do modelo.")
- Template dark, noindex, CTA final fixo. Teste obrigatório antes de ativar (ver medição).

## Cadastro no painel `/admin/marketing/ads`
Campanha `SN_META_PROSPECCAO_ARQUITETO` (draft existente) → 2 conjuntos → 6 anúncios com os nomes acima, tudo "publicado pausado". O experimento já semeado ("fidelidade converte melhor que velocidade") passa a comparar FIDELIDADE × ROTINA; anotar no experimento: "CAC alvo R$ 200 e alerta R$ 100 sem conversão vão disparar em fase de aprendizado (teto R$ 600)".

---

## Google Ads — conta "SPACENODE" 842-846-3209 (sonda de intenção, R$ 10/dia)

## Por que entra, e pequeno
Julho é o único dado real da conta e diz que Google genérico traz volume sem ativação (62 → 24% → 0 assinaturas). Setembro compra três coisas que R$ 10/dia pagam: **relatório de termos** de "renderizar sketchup"/"planta humanizada", **CPC real** desses termos (não há dado público do Planejador; premissa R$ 2–6) e ativação dos poucos cadastros de intenção pura (3–18, premissa) — não uma célula conclusiva. Maximizar cliques com teto = zero gestão diária de lance (CPC manual com 24 keywords do Plano 2 exige olhar todo dia). O que dispararia mais verba em outubro: ≥ 5 cadastros com ativação ≥ 50% **ou** termos claramente melhores que o Reels na leitura de 08/10 — e, para Smart Bidding, cláusula 7 aprovada + ≥ 15–30 conversões importadas por gclid em 30 d.

## Antes de criar (conta)
1. Configurações da conta → **Codificação automática: ATIVADA** (já era em julho — o gclid chegou; conferir).
2. Recomendações → "Aplicar automaticamente" → **desligar tudo** (senão a conta adiciona palavras-chave amplas e tCPA sozinha).
3. Metas → Conversões: **não criar nada em setembro** (o upload por gclid só depois da cláusula 7; criar a ação agora é peça a mais sem uso). Ao criar a campanha, **remover as metas de conversão herdadas**.
4. Abrir a campanha de 24–31/07 (Campanhas → filtro → Atributos → Status → Removida/todas; intervalo 24–31/07/2026; coluna "Tipo de campanha"; Insights e relatórios → Termos de pesquisa; Histórico de alterações). Anotar tipo, gasto, cliques, CPC médio, termos, dispositivos/horários. Gasto ÷ 62 = CPL real de julho. Termos que trouxeram os 15 que ativaram → exatas; termos dos 47 que não → negativas. Esperar relatório parcial (limiar de privacidade).

## Campanha
| Campo | Valor |
|---|---|
| Criação | "Criar uma campanha sem a orientação de uma meta" (engrenagem) → tipo **Pesquisa** |
| Nome | `SN_GOOGLE_CAPTACAO_ARQUITETO` |
| Metas de conversão | Nenhuma (remover as pré-preenchidas) |
| Redes | **Desmarcar** "Incluir parceiros de pesquisa do Google" e "Incluir a Rede de Display" (Display costuma vir desmarcada desde jun/2025 — conferir) |
| Locais | Brasil — opção **"Presença"** (não "Presença ou interesse") |
| Idiomas | Português (a configuração some no fim de set/2026; anúncios e LP em PT-BR já filtram) |
| AI Max | **Desligar tudo** (correspondência de termos, personalização de texto, expansão de URL final) — Campanhas → Configurações → AI Max; conferir de novo após salvar (campanha nova nasce ligada) |
| Correspondência ampla de campanha | Não existe mais para campanhas novas; se aparecer o dropdown, "Desativada: usar tipos de correspondência" |
| Lances | **Maximizar cliques** com **limite de lance de CPC máximo R$ 4,00** (sem conversão rastreável, Maximizar conversões/tCPA nem é elegível) |
| Orçamento | **R$ 10/dia** (teto mensal 30,4× = R$ 304) |
| Datas | Início 11/09/2026 · **Término 10/10/2026** (trava de gasto) |
| Rotação de anúncios | Otimizar |
| Programação | 24/7 (sem dado para cortar horário) |
| Dispositivos | Todos, sem ajuste |
| Opções de URL | Sem modelo de rastreamento; UTMs na URL final de cada RSA; o auto-tagging adiciona o gclid |
| Frases de destaque | Cadastro sem cartão · 80 nodes grátis · Geometry Lock · Tudo no navegador · Suporte em português · Feito por arquiteto |
| Snippet estruturado "Serviços" | Render fotorrealista · Planta humanizada · Edição de imagem · Ampliação de imagem · Vídeo do projeto (nunca Isométricas/Prancha/Moodboard) |
| Sitelinks | Só com LPs publicadas: "Do print ao render" → /lp/print-do-sketchup · "Planta humanizada" → /lp/planta-humanizada · "Planos a partir de R$ 89" → https://spacenode.app/ . **Sem** sitelink de plugin (`.rbz` não assinado) |
| Extensão de promoção | **Não** (oferta de 50% acabou em 31/08); sem extensão de preço na v1 |
| Status | **PAUSADA** |

## Grupo 1 — `SN_GOOGLE_CAPTACAO_ARQUITETO_SKETCHUP`
Palavras-chave (só exata; variantes próximas já cobrem plural, acento, reordenação e "como renderizar no sketchup" — por isso as negativas de tutorial são obrigatórias):
```
[renderizar sketchup]  [render sketchup]  [render sketchup online]  [renderizar sketchup online]
[renderizar modelo do sketchup]  [render rápido sketchup]  [sketchup com ia]  [ia para sketchup]
"renderizar sketchup"   ← única frase; pausar se > 50% dos cliques vierem de termos de tutorial
```
RSA `SN_GOOGLE_CAPTACAO_ARQUITETO_FIDELIDADE_RSA01_COPY01` (títulos ≤ 30, descrições ≤ 90):
- Títulos: **Renderize Prints do SketchUp** (fixar posição 1) · Do SketchUp ao Render com IA · Do Print ao Fotorrealista · Geometry Lock: Projeto Fiel · Fotorrealismo em Minutos · Sem Render de Madrugada · Cadastro Grátis, Sem Cartão · A partir de R$ 89/mês · Seu Cliente Entende o Render · Funciona com Qualquer Print · Upload da Imagem e Pronto · Render Fiel ao Seu Modelo
- Descrições: "Faça upload do print do SketchUp e receba o render fotorrealista em minutos, no navegador." · "Geometry Lock trava a geometria: o render respeita o seu projeto, não inventa outro." · "Sem render de madrugada: o modelo que você já tem vira apresentação, direto no navegador." · "Feito por um arquiteto brasileiro. Cadastro grátis com 80 nodes para testar de verdade."
- Caminho de exibição: `spacenode.app/sketchup/render`
- "SketchUp" só em uso descritivo (Trimble não é concorrente; não sugerir endosso). **Fallback se o Google reprovar por marca:** título 1 → "Renderize o Print do Modelo" (27).
- URL final: `https://spacenode.app/lp/print-do-sketchup?utm_source=google&utm_medium=cpc&utm_campaign=sn_google_captacao_arquiteto&utm_content=sn_google_captacao_arquiteto_fidelidade_rsa01_copy01&utm_term=arquiteto`

## Grupo 2 — `SN_GOOGLE_CAPTACAO_ARQUITETO_PLANTAHUM`
```
[planta humanizada]  [planta humanizada online]  [planta humanizada com ia]  [planta humanizada ia]
[fazer planta humanizada]  [programa para planta humanizada]  [planta humanizada automática]
```
Sem frase na v1 ("planta humanizada" em frase engole R$ 10/dia com tutorial/curso/TCC).
RSA `SN_GOOGLE_CAPTACAO_ARQUITETO_APRESENTACAO_RSA01_COPY01` (= G3 do plano de agosto, sem alteração):
- Títulos: **Planta Humanizada com IA** (fixar posição 1) · Da Planta Técnica à Humanizada · Humanize Plantas em Minutos · Planta Humanizada Online · Cores, Pisos e Mobiliário · Apresente a Planta ao Cliente · Cadastro Grátis, Sem Cartão · A partir de R$ 89/mês · Sem Photoshop, Sem Demora · Feito para Arquitetura · Envie a Planta e Pronto · Qualidade de Apresentação
- Descrições: "Envie a planta técnica e receba a versão humanizada em minutos, pronta para apresentar." · "Pisos, cores e mobiliário aplicados com IA, respeitando o desenho da sua planta." · "Sem horas de Photoshop: a planta humanizada sai no navegador, sem hardware caro." · "Cadastro grátis com 80 nodes para testar. Planos a partir de R$ 89 por mês."
- URL final: `https://spacenode.app/lp/planta-humanizada?utm_source=google&utm_medium=cpc&utm_campaign=sn_google_captacao_arquiteto&utm_content=sn_google_captacao_arquiteto_apresentacao_rsa01_copy01&utm_term=arquiteto` (fallback: home com os mesmos parâmetros)

Grupos RENDERIA e IAARQ do plano de agosto **ficam fora** (intenção genérica = julho; sem verba para 4 grupos). Grupo reserva "render com IA + modificador profissional" (frases do plano de agosto) só entra se em 28/09 o gasto acumulado do Google < R$ 120 (busca sem volume em exata) — nunca empurrar lance para gastar.

## Lista de negativas — Biblioteca compartilhada → `SN_NEG_CAPTACAO_v1`, aplicada à campanha
Negativas **não** cobrem variantes próximas: singular e plural, com e sem acento (o Google só garante caixa e erro de grafia).
```
Aprender: curso, cursos, aula, aulas, tutorial, tutoriais, apostila, faculdade, tcc, "passo a passo", aprender, youtube
Emprego: emprego, vaga, vagas, salário, salario, estágio, estagio, currículo, curriculo
Anti-persona: download, baixar, apk, crack, crackeado, torrent, pirata, free, "sem pagar", ilimitado, estudante, estudantes
Outras IAs: midjourney, dall-e, dalle, "stable diffusion", "leonardo ai", chatgpt, gemini, copilot, canva
Plugin (.rbz não assinado): plugin, plugins, extensão, extensao
Concorrentes (STJ REsp 2.032.932/SP e 2.096.417/SP — frase E ampla; nunca nos RSAs): lumion, vray, "v-ray", "v ray", enscape, twinmotion, d5, "d5 render", corona, "corona render", chaos
Irrelevância: "o que é", significado, conceito, exemplo, exemplos, pinterest, wallpaper, png, jpg, pdf, dwg, pronta, prontas, "modelo pronto", logo, logotipo, tattoo, tatuagem, anime, jogo, jogos, bloco, blocos, warehouse, textura, texturas, vetor
```
Não negativar: grátis/gratis (o cadastro é grátis), revit, archicad, autocad, photoshop, sketchup (no grupo Planta), preço, "quanto custa", "como" (vigiar no relatório de termos).

## Landing page `/lp/planta-humanizada` (grupo PLANTAHUM; publicar pelo painel)
h1 **"Da planta técnica à humanizada, em minutos."** · sub "Envie a planta e receba a versão humanizada com pisos, cores e mobiliário, respeitando o desenho. Feito por arquiteto brasileiro." · CTA "Teste com um projeto real" · `value_props` (Respeita o desenho · Em minutos · Sem Photoshop · Em português) · `how_it_works` (Envie a planta técnica → Escolha o estilo → Receba e apresente) · `modules` [planta_humanizada, renderizar] · `quote` ("apresento na própria reunião, o cliente fecha mais rápido" — cliente SpaceNode) · `faq` (cartão, 80 nodes, formatos aceitos, preço). **Sem** `before_after` (não há imagem pública de planta com `permission_status=granted`; nunca inventar).

## Cadastro no painel
Campanha `SN_GOOGLE_CAPTACAO_ARQUITETO` (canal google, objetivo captação, persona arquiteto) → 2 grupos → 2 RSAs com os ids acima; publicado pausado. Ritual: toda segunda (e quinta, 10 min, nas semanas 1–2) relatório de termos → exatas/negativas; conferir Histórico de alterações (AI Max/ampla/recomendações religados → desligar no dia).

---

## Medição — o que existe, o que entra até 11/09, o que fica para depois

## Até sex 11/09, sem depender de PR aberta
| Item | Estado hoje | Ação |
|---|---|---|
| Atribuição de **cadastro** por `utm_*` / `gclid` / `fbclid` (cookie `sn_attribution` → `marketing.acquisition_events`) | Funciona em prod (foi assim que os 62 de julho e o 1 da Meta foram lidos) | Só o teste de ponta a ponta em 09/09 (abaixo) |
| Leitura de cadastros por anúncio no painel | Funciona por `utm_content` = identificador do anúncio em minúsculas (7 segmentos, como o painel gera) | Cadastrar os identificadores exatamente como nas URLs; nunca `utm_medium=paid` |
| **Ativação por campanha** | **Já está no painel** (computeActivatedUsers por campanha) — o Plano 1 errou ao dizer que não | Nada; por célula (conjunto) usar SQL |
| Gasto / impressões / cliques | CSV manual `data,identificador,impressoes,cliques,investimento,leads` | Toda segunda: Meta (Gerenciador → Relatórios → detalhamento por dia × anúncio: impressões, cliques no link, valor gasto) e Google (Anúncios → por dia). `identificador` = nome do anúncio/RSA em minúsculas; **`leads` vazio ou 0** (coluna `platform_leads` é opcional; LPV e cliques não são lead; cadastro vem do funil próprio — não poluir com dado first-party) |
| 5+ / 10+ gerações na 1ª semana por célula; assinatura atribuída | Dado existe no banco; não está no painel; evento de assinatura sem UTM (PR #142 corrige) | SQL semanal (abaixo) + leitura manual do Stripe (0–5 assinaturas/mês torna trivial) |
| Alertas e relatório | Crons `ads-alerts` (diário 9h) e `ads-report` (segunda 9h) rodam; guardrails CAC R$ 200, R$ 100 sem conversão, LP 200 views ≥ 2% | Registrar no experimento que CAC 200 e R$ 100 vão disparar em aprendizado (teto R$ 600) — para o relatório não induzir pausa |
| Google: codificação automática | Estava ligada em julho (gclid chegou) | Conferir; ligar se desligada |
| Meta: `fbclid` | Cookie já lê | Nada |
| Higiene de amostra | — | Contas de teste com e-mail em `INTERNAL_STAFF_EMAILS`; nunca contar cadastros do time |

**Teste de atribuição (qua 09/09, obrigatório antes de ativar):** abrir em janela anônima `https://spacenode.app/lp/print-do-sketchup?gclid=teste123&fbclid=teste456&utm_source=google&utm_medium=cpc&utm_campaign=sn_google_captacao_arquiteto&utm_content=sn_google_captacao_arquiteto_fidelidade_rsa01_copy01&utm_term=arquiteto` → CTA → cadastrar com e-mail interno → conferir a linha em `marketing.acquisition_events` com `utm_content`, `gclid` e `fbclid` gravados → repetir na LP de planta. Se `/lp/*` der 404, o fallback é a home com os mesmos parâmetros.

## Leitura semanal (ritual de segunda, 9h–9h30, após o cron)
1. Subir os 2 CSVs (Meta e Google, semana anterior, por dia × anúncio).
2. Painel → campanha → por anúncio: investimento, cadastros, CPL; agrupar por célula (FIDELIDADE = 3 anúncios; ROTINA = 3; SKETCHUP; PLANTAHUM); ativação por campanha.
3. Gerenciador Meta: CPM, CTR de link, CPC, frequência, taxa de gancho (reproduções de 3 s ÷ impressões), ThruPlay por anúncio — só diagnóstico. "Resultados" (LPV) é estimado e inflado sem Pixel: **nunca vira KPI**.
4. Google: Termos de pesquisa (Campanhas → Insights e relatórios) → termo com cadastro → exata; ≥ 10 cliques e 0 cadastros → negativa; CPC médio × teto R$ 4; Histórico de alterações (AI Max/ampla/recomendações).
5. SQL (Supabase de prod, editor): por `campaign_identifier`/`ad_identifier`, cadastros com ≥ 7 dias de idade → % com ≥ 1 geração, ≥ 5, ≥ 10 nos 7 dias após o cadastro (consulta testada em prod em 08/09):
```sql
-- Ativação por célula (testada em prod em 08/09; colunas reais: campaign_identifier / ad_identifier)
with c as (
  select a.user_id, a.campaign_identifier, a.ad_identifier, a.created_at as signup_at
  from marketing.acquisition_events a
  where a.event_type = 'signup'
    and a.campaign_identifier in ('sn_meta_prospeccao_arquiteto', 'sn_google_captacao_arquiteto')
    and a.created_at >= '2026-09-11'
),
gen as (
  select user_id, created_at from public.renders where status = 'completed'
  union all select user_id, created_at from public.vistas where status = 'completed'
  union all select user_id, created_at from public.edits
  union all select user_id, created_at from public.edit_v3_jobs
),
g as (
  select c.user_id, count(*) as gens_7d
  from c join gen r on r.user_id = c.user_id
   and r.created_at between c.signup_at and c.signup_at + interval '7 days'
  group by c.user_id
)
select c.campaign_identifier as campanha,
       split_part(c.ad_identifier, '_', 5) as celula,      -- FIDELIDADE / ROTINA / (Google: promessa do RSA)
       count(*) as cadastros,
       count(*) filter (where coalesce(g.gens_7d, 0) >= 1) as ativados,
       count(*) filter (where coalesce(g.gens_7d, 0) >= 5) as cinco_mais,
       count(*) filter (where coalesce(g.gens_7d, 0) >= 10) as dez_mais
from c left join g using (user_id)
where c.signup_at <= now() - interval '7 days'
group by 1, 2 order by 1, 2;
```
6. Stripe: assinaturas novas da semana → e-mail → `users.id` → evento de cadastro em `acquisition_events` → célula. Anotar na planilha do experimento.
7. Frente A: planilha `frente-a-set26` (e-mail, lote, enviado em, entregue?, respondeu, assinou, cupom usado, opt-out) + relatório de resgates do código no Stripe (se houver cupom).
8. Registrar no experimento do painel: manter / cortar / trocar criativo, com o motivo.

## O que fica para depois (e o gatilho)
| Item | Por que não agora | Gatilho |
|---|---|---|
| **Remover a tag gtag AW-18345260541** do site | Não mede nada (sem label) e grava `_gcl_au` (finalidade "Advertising") + ping ao DoubleClick — já contradiz a cláusula 7 hoje; a importação por gclid não precisa dela | Decisão do dono; PR de 1 arquivo. Não bloqueia o plano. Não configurar `NEXT_PUBLIC_GADS_SIGNUP_LABEL` |
| **Importação de conversões off-line no Google por `gclid`** | Não exige tag no site, mas é compartilhamento do identificador do clique com o Google para finalidade não informada → cláusula 7 reescrita + teste de balanceamento de LI documentado antes (Guia de Cookies ANPD p. 14–15; Guia de LI 2024). Os `gclid` ficam em `acquisition_events` e podem ser subidos retroativamente em até 90 dias | Cláusula 7 aprovada por advogado + toggle de oposição em Configurações. Então: Metas → + Criar ação → Conversões off-line → "Importar de cliques" → nome `Cadastro`, categoria Inscrição, contagem Uma, janela 90 d, **Principal** (Metas → Conversões → Resumo → Editar meta → Conversion action optimization); esperar 4–6 h; planilha `Google Click ID / Conversion Name / Conversion Time / Conversion Value / Conversion Currency` com 1ª linha `Parameters:TimeZone=America/Sao_Paulo`, hora `yyyy-MM-dd HH:mm:ss`, BRL; não subir conversões com < 1 dia do clique (repetir 1 dia extra a cada upload); upload em Metas → Conversões → Uploads (legado) ou Ferramentas → Data Manager → Google Sheets (agendável; importa 90 d a cada execução; API do Google Ads bloqueia OCI desde 15/06/2026 — automação só via Data Manager API). Com ≥ 15–30 conversões/30 d → migrar para Maximizar conversões/tCPA (out/nov). ECL (e-mail hasheado) **não**: exige tag lendo o e-mail + "Customer data terms" — colide com a cláusula 7 |
| Meta Conversions API | Mesmo motivo (cláusula 7) + token do Events Manager; e com R$ 27,50/dia um conjunto otimizado por cadastro nunca sai do aprendizado. Se um dia entrar: só `fbc` (derivado do `fbclid`: `fb.1.<ms da 1ª observação>.<fbclid>`) + evento + hora + `event_source_url` + `action_source=website`; **sem** e-mail, IP ou user-agent enquanto a base for LI | Cláusula 7 aprovada + PR #142 mergeada; campanha Leads só com orçamento ≥ R$ 150/dia (premissa) ou aceitando aprendizado limitado |
| PR #142 (funil first-party: `first_generation`, checkout com UTM, adapters desligados) + migration | Precisa de merge + migration autorizados pelo dono | Quando mergear, a leitura manual de assinatura some; não bloqueia setembro |
| PR #140 (e-mail de boas-vindas) | Fora do orçamento de mídia; é a correção de ativação mais barata | Se ativação < 35% em 21/09, vira prioridade acima de qualquer ajuste de campanha; até lá, e-mail manual do dono D0 |
| Banner de consentimento | Não obrigatório por lei como tal; obrigatório só se a base for consentimento (cookie de publicidade); o cookie `sn_attribution` é primário/analítico com compartilhamento → LI defensável com aviso + opt-out (premissa jurídica) | Parecer do advogado sobre a cláusula 7 |

---

## Só o dono pode fazer (prazo · o que trava se não fizer)

1. **Aprovar este plano** (alocação R$ 55 + R$ 10, 2 células Tráfego/LPV, Google só exata, Frente A opcional) — **ter 08/09**. Sem isso, nada é montado e sexta não ativa.
2. **Abrir a campanha de 24–31/07 no Google Ads** (Status Removida/todas → 24–31/07 → tipo, gasto, cliques, CPC, termos, histórico) e informar gasto ÷ 62 — **ter 08/09**. Não trava a ativação, mas sem isso a premissa de CPC (R$ 2–6) e a lista de negativas v1 ficam cegas ao único dado brasileiro do nicho.
3. **Conta Google: codificação automática ON e "aplicar recomendações automaticamente" OFF** — **qui 10/09**. Sem auto-tagging não há gclid (medição cega); com auto-apply, a conta liga ampla/tCPA sozinha.
4. **Meta: conferir interesses na busca de segmentação, criar os 2 públicos de engajamento (IG 365 d; vídeo 50% 365 d), conferir método de pagamento, limite da conta e o mínimo em BRL para LPV** — **qua 09/09**. Sem os públicos, o Advantage+ parte sem sugestão 1P; sem o mínimo confirmado, o diário de R$ 27,50 pode ser recusado na hora de ativar.
5. **Ativar Meta (2 conjuntos) e Google (campanha) e aprovar no painel** — **sex 11/09 até 10h**. Regra da casa; ativar de manhã dá o dia útil para pegar reprovação/erro de URL. Cada dia de atraso reduz a amostra de 30 dias.
6. **Tag AW-18345260541: remover (PR mínima) ou registrar o risco** — decisão **qui 10/09**. Não trava a mídia; deixa a contradição com a cláusula 7 aberta com a ANPD priorizando publicidade direcionada em 2026–27.
7. **Frente A — lotes 1 (27 "na parede") e 2 (22 ativados com saldo) da caixa pessoal**, com opt-out "responda SAIR" e planilha — **seg 14/09 e qui 17/09**; respostas 1:1 na semana. Opcional e fora do critério de sucesso da mídia; se não mandar, o mês perde a única fonte com CAC < R$ 50 (1–2 assinaturas esperadas, premissa).
8. **Cupom VOLTA20 no Stripe (20% no 1º mês, once, máx. 30 resgates, expira 02/10, só clientes novos) e testar se o checkout do Starter mostra "código promocional"** — decisão **qui 10/09**. Opcional; sem cupom o lote 1 vai sem desconto (menos conversão, premissa); se o checkout não aceitar código, o fallback é reembolso parcial de R$ 17,80 por assinatura da lista (2 cliques cada). Nunca vazar o cupom em mídia.
9. **E-mail manual para cada cadastro pago em até 24 h ("manda um print, qualquer print")** — **diário de 11/09 até PR #140 sair**; 1–3/dia. Sem isso, o cadastro que não gera na hora não volta (julho: 47 de 62 nunca renderizaram).
10. **Ritual de segunda, 30 min fixos (9h–9h30)**: CSV, painel, termos, SQL, Stripe, registro no experimento — **toda segunda de 14/09 a 26/10** (+ 10 min na quinta nas semanas 1–2). Sem ele, as regras de corte não existem e o painel fica cego.
11. **Cláusula 7 da Política com advogado** (texto pronto na pesquisa LGPD com marcações [ADV]: LI × consentimento; e-mail hasheado ou não na CAPI; retenção 90 d; transferência internacional) + toggle de oposição em Configurações + teste de balanceamento documentado — **até qui 08/10**. Trava em outubro: upload de gclid (Smart Bidding no Google), CAPI (otimização por cadastro no Meta). Os gclid de setembro valem 90 dias.
12. **Autorizar merge da PR #140 (e-mail de boas-vindas; exige provedor)** — **até seg 21/09**. Trava a ativação da fonte paga; é a correção mais barata do CAC.
13. **Autorizar merge da PR #142 + migration** — **até qui 08/10**. Trava a atribuição automática de assinatura e os adapters (desligados) para outubro; não bloqueia setembro.
14. **Publicar as 2 LPs pelo painel (ou autorizar o time a publicar)** — **qua 09/09**. Fallback: home com UTMs (ativação de julho foi 24% na home — aceitar só como último caso).
15. **Montar as campanhas no Gerenciador (Meta, ~2 h) e no Google Ads (~1,5 h) pelas planilhas deste plano, ou
    repetir a sessão com a janela da extensão do Chrome aberta e intocada** — **qua 09/09 e qui 10/09**. Sem isso não há o
    que ativar na sexta.
16. **Teste de atribuição com cadastro real (qua 09/09) e limpeza depois**: cadastrar com e-mail interno pela URL de teste
    e, em seguida, apagar as linhas do usuário de teste em `marketing.acquisition_events` (signup, lp_view, lp_cta_click) e o
    próprio usuário — o painel não filtra contas internas e contaria o teste como cadastro pago.
17. **Remetente e planilha da Frente A** — **qui 10/09**: decidir a caixa (pessoal, ou contato@spacenode.app só se tiver
    SPF/DKIM do domínio) e criar a planilha `frente-a-set26`; anotar o nome da faixa da Sound Collection escolhida (a
    mesma nos 6 anúncios).
18. **Decidir em 08/10 (confirmar 13/10) o orçamento de outubro** pelo go/no-go do plano; **26/10** ajustar pela releitura de assinaturas (45 d). Sem decisão, outubro começa sem verba ou repete setembro sem aprender.

---

## Acréscimos da rodada de copy e da revisão adversarial (08/09)

### Meta — o que mudou em relação à estrutura acima
- **Texto principal fica com 2 linhas** (as da estrutura acima). A versão de 4 linhas proposta na copy trazia um claim
  absoluto ("a geometria que você modelou é a que aparece: esquadria, pé-direito, proporção") que o produto não garante
  item a item — reprovada pela revisão. O que está registrado no painel é o texto de 2 linhas.
- **Identificadores descritivos** (DRONE, PISCAFACHADA, BANHEIRO, DUASREUNIOES, TRESANTES14, CINCOCLIMAS; reserva:
  PISCINA, ZOOMCOZINHA, EDITARPISO, VIDEOFACHADA). O nome do anúncio no Gerenciador tem de ser exatamente esse; o
  `utm_content` é ele em minúsculas. Só os 6 titulares estão registrados no painel; a reserva entra no painel no dia
  em que entrar no Gerenciador (sempre numa segunda).
- **Zona segura (achado da revisão, conferido na spec dos Reels):** a faixa inferior de 35% da Meta começa em
  y = 1.248 px. O card final (botão em ≈ 965–1.065 px) está limpo, mas o **CTA sobreposto ao vídeo** em
  `tres-antes-das-14h-ep01` (≈ 1.470–1.590 px) e o "Comece grátis" do `drone-nada-sai-do-lugar` (≈ 1.440 px) caem
  dentro da faixa que a UI do Reels cobre. Decisão do dono na prévia de quarta: (a) aceitar — o CTA principal está no
  card final, que fica fora da faixa; ou (b) regenerar as versões `-ad` com o overlay em y ≤ 1.200
  (`marketing/scripts/reel-spec.mjs`, ~10 s por peça, exige o acervo em `SPACENODE_ACERVO`). Recomendação: (a) em
  setembro, (b) na rodada 2.
- O texto do card final varia por criativo ("Comece grátis" no drone, "Comece agora" nos demais) — os dois são CTAs da
  lista aprovada; não é problema.
- **Fallback de orçamento mínimo:** se o Gerenciador exigir R$ 30/dia por conjunto, subir os dois para R$ 30, baixar o
  Google para R$ 6/dia (R$ 182) **e subir o limite de gastos da campanha Meta para R$ 1.800** — senão a campanha para
  ~3 dias antes de 10/10.
- `editar-so-o-piso` e `video-vertical-fachada` mostram Editar e Animar; a copy da célula fala de render. Ficam como
  3º e 4º da reserva; se entrarem, anotar no experimento que a copy não descreve o criativo.
- Fallback se a Meta reprovar "SketchUp" na headline: `Render fiel ao seu modelo` (25) e 1ª linha
  "Nada sai do lugar: o print do seu modelo vira render fotorrealista, fiel ao projeto. Feito por arquiteto, em
  português." (117). Contestar uma vez antes de trocar.

### Google — acréscimos ao que está acima
- **Nível da conta, antes de criar:** Recursos → ⋮ → "Configurações de recursos no nível da conta" → desativar
  sitelinks, frases de destaque, snippets e imagens **dinâmicos** e "recursos criados automaticamente" (um clique em
  sitelink dinâmico chega ao site sem `utm_content` e o painel fica cego). Conversões avançadas: OFF. Sem DSA, sem
  inserção de palavra-chave (DKI). Se o Google pedir **verificação do anunciante**, é ação do dono e pode segurar a
  exibição.
- **Exatas extras** (só exata; risco é volume, não gasto): grupo SKETCHUP `[render com ia sketchup]`,
  `[renderizador sketchup]`; grupo PLANTAHUM `[planta baixa humanizada]`, `[humanizar planta baixa]`,
  `[humanizar planta]`.
- **Títulos fixados na posição 1, dois por grupo (o Google alterna):** SKETCHUP → "Renderize Prints do SketchUp" (28)
  e "Do SketchUp ao Render com IA" (28); PLANTAHUM → "Planta Humanizada com IA" (24) e "Planta Humanizada Online" (24).
  Títulos extras (todos ≤ 30): "Renderize o Print do Modelo" (27), "Feito por Arquiteto, no Brasil" (30),
  "Tudo no Navegador" (17), "Respeita o Desenho da Planta" (28). Caminhos de exibição: `spacenode.app/sketchup/render`
  e `spacenode.app/planta/humanizada`.
- **Fallbacks de marca:** SketchUp reprovado → fixar "Renderize o Print do Modelo" (27) e "Render Fiel ao Seu Modelo"
  (25), descrição 1 → "Suba o print do seu modelo e receba o render fotorrealista em minutos, no navegador." (84).
  Photoshop reprovado → "Sem Retoque Manual, Sem Demora" (30) e "Sem horas de retoque manual: a planta humanizada sai no
  navegador, sem hardware caro." (85). Contestar uma vez antes.
- **Lista de negativas `SN_NEG_CAPTACAO_v1` (98 termos; palavra solta = ampla, entre aspas = frase):**
  curso, cursos, aula, aulas, tutorial, tutoriais, apostila, faculdade, tcc, "passo a passo", aprender, youtube, udemy,
  hotmart, videoaula, "vídeo aula", emprego, vaga, vagas, salário, salario, estágio, estagio, currículo, curriculo,
  download, baixar, apk, crack, crackeado, torrent, pirata, "free download", "for free", "sem pagar", ilimitado,
  estudante, estudantes, midjourney, dall-e, dalle, "stable diffusion", "leonardo ai", chatgpt, gemini, copilot, canva,
  firefly, krea, sora, plugin, plugins, extensão, extensao, lumion, vray, "v-ray", "v ray", enscape, twinmotion, d5,
  "d5 render", corona, "corona render", chaos, podium, kerkythea, artlantis, keyshot, blender, "unreal engine",
  "o que é", significado, conceito, exemplo, exemplos, pinterest, wallpaper, png, jpg, pdf, dwg, pronta, prontas,
  "modelo pronto", logo, logotipo, tattoo, tatuagem, anime, jogo, jogos, bloco, blocos, warehouse, textura, texturas,
  vetor. `free` solto saiu da lista (bloquearia "renderizar sketchup free", e quem usa SketchUp Free é público);
  "free download"/"for free" cobrem o anti-persona. **Não negativar:** grátis/gratis, revit, archicad, autocad,
  photoshop, sketchup (no grupo Planta), preço, "quanto custa", como, app, celular, freelancer, contratar.
- **Sitelinks no nível do GRUPO** (não da campanha), cada um com o `utm_content` do RSA do grupo, e nunca para a
  mesma página da URL final do grupo. Pool: "Do print ao render" → /lp/print-do-sketchup · "Planta humanizada" →
  /lp/planta-humanizada · "Planos a partir de R$ 89" → https://spacenode.app/ · "Comece grátis" →
  /login?mode=signup (premissa: o cookie grava UTMs quando a 1ª página é o login — testar na quarta; se não gravar,
  ficar com 2 sitelinks por grupo). Grupo SKETCHUP recebe Planta humanizada + Planos + Comece grátis; grupo PLANTAHUM
  recebe Do print ao render + Planos + Comece grátis.
- **Teto real do período:** o limite de 30,4× é por mês civil — setembro (11–30/09) fica em R$ 304, mas outubro
  (01–10/10) permite até R$ 200 a mais. Trava: na segunda 05/10, se o acumulado do Google ≥ R$ 280, baixar o diário
  para (304 − acumulado) ÷ 6 (mudar orçamento em Maximizar cliques não reinicia aprendizado). A regra 16 continua.
- Grupo reserva v2 (`…_RENDERIA`, RSA `…_PRAZO_RSA01_COPY01`, textos prontos no plano de agosto) só se em 28/09 o
  acumulado do Google < R$ 120: `[render com ia para arquitetura]`, `[renderizar projeto com ia]`,
  `[render com ia sketchup]`, só exata — nunca empurrar lance para gastar.

### Notas da revisão adversarial que valem para a operação
- **Identificador da campanha Google:** `SN_GOOGLE_CAPTACAO_ARQUITETO` foi criado por SQL; o formulário do painel só
  gera objetivos do enum (PROSPECCAO, DEMONSTRACAO, CONVERSAO…). Nada quebra (o CSV e a atribuição casam por texto),
  mas não recriar a campanha pelo formulário — usar a que já existe.
- **Teto por mês civil, não por período:** os 30 dias (11/09–10/10) atravessam dois meses. Setembro (20 dias): Meta
  R$ 1.100 + Google ≤ R$ 304 = ≤ R$ 1.404; outubro (10 dias): Meta R$ 550 + Google ≤ R$ 200, dentro do orçamento de
  outubro. O planejado no período é R$ 1.954; o teórico máximo (R$ 2.200) só ocorre se Meta e Google estourarem juntos.
- **"estudante/estudantes" negativados** por decisão de setembro (julho trouxe curioso barato sem ativação), embora o
  BRIEF de conteúdo inclua estudantes de arquitetura no público orgânico. Reavaliar em outubro pelo relatório de termos.
- **Photoshop nos títulos do grupo PLANTAHUM:** marca da Adobe em texto de anúncio pode ser reprovada. Para não perder
  a sexta, subir já com "Sem Retoque Manual, Sem Demora" (30) e "Sem horas de retoque manual: a planta humanizada sai no
  navegador, sem hardware caro." (85); a LP de planta já usa "retoque manual". A versão com Photoshop fica como teste
  de outubro, se quiser.
- **Título "com IA" fixado na posição 1 metade do tempo** (grupos SKETCHUP e PLANTAHUM) é uso como atributo — permitido;
  se quiser folga em relação à regra "IA nunca é o assunto", fixar só "Renderize Prints do SketchUp" / "Planta
  Humanizada Online" e deixar as variantes "com IA" livres.
- **Cadastros antigos receberam 40 nodes, não 80** (o grant de 80 vale para cadastros a partir de 28/07): por isso os
  e-mails da Frente A não citam número para quem já tem conta; o D0 (cadastro de hoje) pode citar 80.
- **Links de e-mail para quem está deslogado:** `/app/...` redireciona para o login sem voltar à página; por isso os
  e-mails usam `https://spacenode.app/login?next=/app/billing` e `...?next=/app/generate`.

---

## Frente A — reengajamento manual (custo de mídia zero)

Pool real em 08/09 (contas free, sem as internas, saldo = plano + nodes extras):

| Lote | Quem | Pessoas | Ativos nos últimos 30 d | Incentivo | Quando |
|---|---|---:|---:|---|---|
| 1 | "Na parede": já gerou e tem ≤ 15 nodes | 21 | 4 | 500 nodes extras se assinar até sex 18/09 | seg 14/09, 10h30 (lembrete qui 17/09 de manhã) |
| 2 | Ativado com saldo (> 15 nodes) | 23 | 8 | 500 nodes extras se assinar até qua 23/09 | qui 17/09, à tarde |
| 3 | Nunca gerou | 70 | 0 | Nenhum; só "manda um print" e a pergunta do porquê | opcional, qui 24/09 |
| D0 | Cada cadastro vindo da mídia paga | 1–3/dia (premissa) | — | Nenhum; oferta de rodar o 1º render | diário, até a PR #140 sair |

**Incentivo: 500 nodes extras creditados pelo dono depois da assinatura** — mecanismo que já existe (os grants de
18/08 foram assim). Não vaza em mídia, não precisa de cupom no Stripe nem de reembolso; só paga quando a pessoa
assina. Custo máximo por resgate ≈ R$ 36 de IA (500 × R$ 0,073) se a pessoa usar tudo, contra R$ 89 de receita no 1º
mês. Prazo curto e explícito — sem prazo não há motivo para agir agora.

Envio: da caixa pessoal do dono (não existe provedor de e-mail no produto; PR #140 aberta), texto puro, sem imagem,
BCC ≤ 10 por envio com "Para" = o próprio remetente (ou 1 a 1), "responda SAIR" como opt-out registrado numa planilha
`frente-a-set26` (e-mail · lote · enviado em · respondeu · assinou · nodes creditados · opt-out). Base legal:
relacionamento com cliente cadastrado (execução de contrato / legítimo interesse, com oposição fácil). Antes de cada
lote, tirar quem já assinou, quem pediu SAIR e quem gerou algo nas últimas 48 h.

### Lista (SQL Editor do Supabase de produção — devolve e-mail, não colar em documento)

```sql
with gens as (
  select user_id, count(*) as n, max(created_at) as last_gen from (
    select user_id, created_at from public.renders where status = 'completed'
    union all select user_id, created_at from public.vistas where status = 'completed'
    union all select user_id, created_at from public.edits
    union all select user_id, created_at from public.edit_v3_jobs
  ) g group by user_id
),
extras as (
  select user_id, coalesce(sum(nodes_remaining), 0) as extras
  from public.lumen_packs where status = 'active' group by user_id
)
select
  case when g.n is null then 3 when p.credits + coalesce(e.extras, 0) <= 15 then 1 else 2 end as lote,
  p.email, p.created_at::date as cadastro, coalesce(g.n, 0) as geracoes, g.last_gen::date as ultima_geracao,
  p.credits + coalesce(e.extras, 0) as saldo
from public.profiles p
left join gens g on g.user_id = p.id
left join extras e on e.user_id = p.id
where p.plan = 'free'
  and p.email not ilike '%spacenode%' and p.email not ilike '%pisoni%'
order by 1, g.last_gen desc nulls last;
```

Cadastros pagos do dia (para o D0): `select p.email, a.ad_identifier, a.created_at from marketing.acquisition_events a
join public.profiles p on p.id = a.user_id where a.event_type = 'signup' and a.campaign_identifier in
('sn_meta_prospeccao_arquiteto','sn_google_captacao_arquiteto') and a.created_at >= current_date order by 3;`

### Crédito dos 500 nodes extras (depois de confirmar a assinatura no Stripe; 1 por pessoa)

```sql
insert into public.lumen_packs (user_id, pack_size, nodes_initial, nodes_remaining, status, stripe_session_id, expires_at)
select id, 500, 500, 500, 'active', 'admin_grant_20260915_frente_a_' || split_part(email, '@', 1), 'infinity'
from public.profiles
where email = 'EMAIL_DA_PESSOA'
  and plan in ('starter', 'pro', 'studio');
```

`pack_size` só aceita 500/1500/4000 (CHECK da tabela); `stripe_session_id` é único — manter o prefixo com data e nome.
O saldo aparece na hora em /app/billing.

### E-mails (revisados contra o léxico proibido; sem emoji; 1 link; assinatura do fundador)

**Lote 1 — seg 14/09** · Assunto: `Você usou seus nodes. E o próximo projeto?`

```
Oi,

Vi que você gastou a maior parte dos nodes do cadastro. Ou seja: testou de verdade, com projeto real. Obrigado.

Se o teste valeu, o próximo passo é o Starter: R$ 89 por mês, 750 nodes, o que dá até 75 renders HD no Pulsar.
Para quem já testou, um empurrão: assinando até sexta, 18 de setembro, eu credito 500 nodes extras na sua conta,
que não vencem. Depois do checkout, me responda "assinei" que eu credito no mesmo dia.

Assine em https://spacenode.app/login?next=/app/billing

Se alguma coisa travou no teste, me responda com o print e a imagem que saiu: eu olho o que ajustar e te devolvo.
Para não receber mais e-mails meus, responda SAIR.

Vinícius
arquiteto, fundador da SpaceNode
```

**Lembrete do lote 1 — qui 17/09, de manhã** (só quem não respondeu, não assinou, não pediu SAIR) · Assunto:
`500 nodes extras: vence amanhã`

```
Oi,

Passando só para lembrar: quem assinar o Starter até amanhã, sexta 18/09, ganha 500 nodes extras (que não vencem).
Depois disso, o crédito não vale mais.

Assine em https://spacenode.app/login?next=/app/billing e me responda "assinei".

Se a dúvida for outra, como qual motor usar ou se encaixa no seu fluxo, me responda aqui que eu explico.
Para não receber mais e-mails meus, responda SAIR.

Vinícius
arquiteto, fundador da SpaceNode
```

**Lote 2 — qui 17/09, à tarde** · Assunto: `Sobrou saldo na sua conta: três usos rápidos`

```
Oi,

Você já gerou suas primeiras imagens e ainda tem nodes na conta. Três jeitos de usar o que sobrou esta semana, com
projeto real:

1. Spaces: a partir de um render, outras vistas do mesmo ambiente, com a mesma linguagem.
2. Editar: troca só o piso, a parede ou o móvel, sem refazer a imagem.
3. Planta humanizada: a planta técnica sai com pisos, cores e mobiliário.

Tudo em https://spacenode.app/login?next=/app

E se decidir assinar até quarta, 23/09, eu credito 500 nodes extras na sua conta (não vencem). Me responda "assinei".

Se algum render não ficou como você queria, me responda com o print e a imagem que saiu que eu vejo o que ajustar.
Para não receber mais e-mails meus, responda SAIR.

Vinícius
arquiteto, fundador da SpaceNode
```

**D0 — cada cadastro pago, no dia** (1 a 1; nunca para e-mails internos) · Assunto: `Manda um print. Qualquer print.`

```
Oi,

Sou o Vinícius, arquiteto, e fiz a SpaceNode. Vi que você se cadastrou hoje.

Sua conta já tem 80 nodes, sem cartão: dá para até 8 renders HD. O jeito mais rápido de saber se serve para você é
com um projeto seu: tira um print do SketchUp (ou de qualquer modelo), sobe em https://spacenode.app/login?next=/app/generate,
escolhe o motor e a imagem sai em minutos.

Se preferir, me responda com o print e eu rodo o primeiro render para você, e te devolvo a imagem com as configurações
que usei.

Qualquer dúvida, responde aqui mesmo. Para não receber e-mails meus, responda SAIR.

Vinícius
arquiteto, fundador da SpaceNode
```

**Lote 3 — opcional, qui 24/09** (3 envios de ≤ 30 em BCC, 30 min entre eles; fora do critério de sucesso) · Assunto:
`Seus nodes do cadastro continuam lá. Manda um print.`

```
Oi,

Você criou sua conta na SpaceNode há algumas semanas e os nodes do cadastro continuam lá, intactos, sem cartão.

Não precisa de projeto pronto nem de arquivo especial: um print do SketchUp, do Revit ou qualquer imagem do modelo já
serve. Sobe em https://spacenode.app/login?next=/app/generate, escolhe o motor e a imagem sai em minutos.

Se o que travou foi outra coisa, como não ter entendido para que serve, achar caro ou não ter projeto agora, me
responde em uma linha. Leio tudo, e é isso que me ajuda a acertar o produto.

Para não receber mais e-mails meus, responda SAIR.

Vinícius
arquiteto, fundador da SpaceNode
```

### Meta — o que já está montado no Gerenciador (rascunho, 08/09 ~12h)

Montado por esta sessão direto na conta (ids: campanha 52601952235675 · conjunto 52601952236075 · anúncio 52601952235875):

| Nível | Estado |
|---|---|
| Campanha `SN_META_PROSPECCAO_ARQUITETO` | Tráfego · leilão · orçamento por conjunto (ABO) · **desligada** (nasce pausada ao publicar) · limite de gastos R$ 1.696 · sem A/B · sem categoria especial |
| Conjunto `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE` | **desligado** · Site · maximizar visualizações da página de destino · R$ 27,50/dia · início 08/09 08:00 PDT (12:00 BRT) · término 10/10 19:59 PDT (23:59 BRT) · Brasil · 24+ · Português (Brasil) · público Advantage+ com sugestões Architecture, Interior design, 3ds Max, Arquitetura & Construção, Desenho assistido por computador, Estilo arquitetónico · posicionamentos manuais: Feeds + Stories/Reels no Facebook e Instagram (sem in-stream, sem resultados de pesquisa, sem Audience Network, sem Messenger, WhatsApp e Threads) |
| Anúncio `SN_META_PROSPECCAO_ARQUITETO_FIDELIDADE_DRONE_COPY01` | **desligado** · identidade SpaceNode + @spacenode.app · destino Site com a URL completa (UTM do anúncio) · link de exibição spacenode.app · **sem mídia e sem texto** |

Achados na conta: fuso da conta de anúncios é **PDT** (relatórios por dia em horário do Pacífico); a campanha de julho
("Campanha de tráfego para anunciantes do Instagram") gastou R$ 386,50, 44.479 impressões, 1.929 cliques (CPM R$ 8,69,
CPC R$ 0,20) e hoje aparece com **"Erro no pagamento"** — regularizar em Cobrança e pagamentos antes de ativar.
Interesses que não existem mais na segmentação: SketchUp, Revit, Lumion, Enscape, V-Ray, Twinmotion, D5.

**O que falta, e é manual (o botão "Configurar criativo" não respondeu à automação; ~40 min):**
1. Abrir o rascunho (Campanhas → filtro "Rascunhos" ou a campanha `SN_META_PROSPECCAO_ARQUITETO`).
2. No anúncio DRONE: Configurar criativo → Carregar → `marketing/output/2026-09-04-reel-drone-nada-sai-do-lugar-ad/…-ad.mp4`
   → texto principal COPY01, título "Render fiel ao seu SketchUp", descrição "80 nodes grátis · sem cartão", botão
   Cadastre-se → música da Sound Collection (mesma faixa nos 6) → desligar os aprimoramentos Advantage+ creative.
3. Duplicar o anúncio 2× dentro do conjunto (PISCAFACHADA, BANHEIRO): trocar nome, vídeo e o `utm_content` da URL.
4. Duplicar o conjunto FIDELIDADE → renomear `SN_META_PROSPECCAO_ARQUITETO_ROTINA` (mesmas configurações) → 3 anúncios
   DUASREUNIOES, TRESANTES14, CINCOCLIMAS com COPY02, título "Do print à imagem, em minutos", vídeos correspondentes.
5. Conferir prévia de Reels (zona segura) e clicar **Publicar**: como campanha, conjuntos e anúncios estão desligados,
   tudo nasce pausado e vai para revisão; ativar depois de aprovado e com o pagamento regularizado.

---

## Feito nesta sessão (08/09) e como conferir

| Item | Estado | Onde |
|---|---|---|
| LP `/lp/print-do-sketchup` | **publicada** (noindex), respondendo 200; texto sobre Geometry Lock corrigido para "fidelidade sempre máxima" | https://spacenode.app/lp/print-do-sketchup |
| LP `/lp/planta-humanizada` | **publicada** (noindex), 200 | https://spacenode.app/lp/planta-humanizada |
| Atribuição da LP | testada com `?gclid=teste123` e `?fbclid=teste456`: `lp_view` gravou `ad_identifier` e `campaign_identifier`; as linhas de teste foram apagadas | `marketing.acquisition_events` |
| Painel | campanha Meta atualizada (R$ 55/dia, limite R$ 1.696, 11/09–10/10); campanha Google criada (draft); 4 conjuntos/grupos; 8 anúncios (6 Meta + 2 RSAs) com URL e UTMs; experimento FIDELIDADE × ROTINA ligado aos 6 anúncios; canal Google habilitado | /admin/marketing/ads |
| Exportação de conversões por gclid | script pronto e testado em prod (62 Cadastros de julho, todos dentro dos 90 dias); **não subir** antes da cláusula 7 | `marketing/scripts/ads/export-google-conversions.mjs` · `marketing/output/ads/google-conversions-julho-2026.csv` |
| Conversor de export para o painel | pronto e testado (Meta e Google; soma posicionamentos; ignora linhas sem `SN_`) | `marketing/scripts/ads/gerenciador-csv-para-painel.mjs` |
| Meta | **rascunho montado** (campanha + conjunto FIDELIDADE completos, anúncio 1 sem mídia) — ver seção acima | Gerenciador de Anúncios, conta 10202044711098425 |
| Google | **não montado** (mesma limitação de automação; ~1,5 h manual pela seção "cole no Google Ads") | conta SPACENODE 842-846-3209 |

Ritual de segunda com os scripts:

```bash
node marketing/scripts/ads/gerenciador-csv-para-painel.mjs ~/Downloads/meta-export.csv --nivel anuncio
```

```bash
node marketing/scripts/ads/gerenciador-csv-para-painel.mjs ~/Downloads/google-export.csv --nivel conjunto
```

```bash
node marketing/scripts/ads/export-google-conversions.mjs --since 2026-09-11 --dry
```
