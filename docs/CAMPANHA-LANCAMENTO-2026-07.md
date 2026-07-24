# Campanha de lançamento — 50% na primeira mensalidade

**Período:** da publicação até **31 de agosto de 2026**, 23h59 (BRT)
**Canais:** mídia própria — landing (`/`) e área de assinatura (`/app/billing`)
**Status:** implementado, aguardando criação do cupom no Stripe (ver [Ativação](#ativação))

---

## 1. A oferta

**50% de desconto na primeira mensalidade de quem nunca assinou.**

Sem código promocional. O desconto entra sozinho no checkout — o cliente clica
em "assinar", chega no Stripe e o valor já está pela metade. Não existe campo de
cupom para ele errar, esquecer ou não achar.

| Plano   | Normal    | 1º mês       | Nodes/mês |
| ------- | --------- | ------------ | --------- |
| Starter | R$ 89     | **R$ 44,50** | 750       |
| Pro     | R$ 199    | **R$ 99,50** | 1.800     |
| Studio  | R$ 349    | **R$ 174,50**| 3.500     |
| Office  | R$ 699    | **R$ 349,50**| 8.000     |

Do segundo mês em diante, preço cheio. Os nodes **não** são reduzidos: quem paga
metade no primeiro mês recebe a cota integral do plano.

### Por que desconto e não trial gratuito

O produto já tem 40 nodes grátis no cadastro — a porta de entrada sem risco
existe. O gargalo não é experimentar, é experimentar **com volume suficiente para
confiar**: 40 nodes dão ~4 renders HD, o que prova que a ferramenta funciona mas
não prova que ela aguenta um projeto. A primeira mensalidade com metade do preço
compra exatamente isso — um mês de uso real, com cartão cadastrado, o que também
elimina o degrau psicológico da primeira cobrança.

---

## 2. Sanidade econômica

Vale a pena checar antes de anunciar, porque o desconto incide sobre a receita
mas não sobre a cota de nodes.

Pior caso possível de custo: o cliente queima **100% dos nodes em vídeo**, que é
o produto mais caro por node. Pela política de preço registrada em
`lib/video/models.ts:61-67`, a margem no piso de receita (R$ 0,0729/node) é de
~56-58% — ou seja, custo de insumo ≈ **R$ 0,031/node**. Imagem custa menos.

| Plano   | Receita 1º mês | Custo se consumir tudo em vídeo | Margem bruta |
| ------- | -------------- | ------------------------------- | ------------ |
| Starter | R$ 44,50       | R$ 23,25                        | ~48%         |
| Pro     | R$ 99,50       | R$ 55,80                        | ~44%         |
| Studio  | R$ 174,50      | R$ 108,50                       | ~38%         |
| Office  | R$ 349,50      | R$ 248,00                       | ~29%         |

**Conclusão: o primeiro mês continua positivo em todos os planos**, mesmo no
cenário mais pessimista de consumo. Não há necessidade de restringir a oferta aos
planos menores. A margem aperta no Office, mas Office com consumo total de vídeo
no primeiro mês é um perfil raro — e é justamente o cliente que se quer reter.

---

## 3. Onde a oferta aparece

| Superfície | O que mostra | Arquivo |
| ---------- | ------------ | ------- |
| Faixa no topo da landing | "Oferta de lançamento · 50% de desconto na primeira mensalidade · até 31 de agosto → Ver planos". Rola junto com a página e leva para `#planos`. | `components/launch/LaunchOfferBanner.tsx` |
| Cards de preço da landing | Valor com desconto em destaque, preço normal riscado ao lado, e "no 1º mês · depois R$ X/mês" embaixo. | `components/landing/PricingToggle.tsx` |
| Letra miúda dos planos | Condição completa + data de validade. | `components/landing/PricingToggle.tsx` |
| Callout em `/app/billing` | Faixa verde com a oferta e o prazo, **só para quem nunca assinou**. | `app/app/billing/BillingClient.tsx` |
| Cards de plano em `/app/billing` | Mesmo tratamento de preço da landing. | `app/app/billing/BillingClient.tsx` |

Toda a cópia sai de `lib/launch-offer.ts` — mudar a mensagem em um lugar muda em
todos.

### Quem vê o callout no app

Só usuário no plano gratuito, que não é membro de workspace, e que nunca teve
assinatura. A checagem usa `stripe_customer_id` nulo: num usuário free, ter
customer no Stripe significa que já assinou e cancelou (Lumens, a outra via de
compra, exigem Pro ou superior). Quem já assinou antes não vê a promessa que não
vai receber.

---

## 4. Mensagem

**Ideia central:** *"Assine, use de verdade, decida depois."*

O desconto é o meio, não o argumento. A campanha não vende "metade do preço" —
vende **um mês inteiro de uso real com risco reduzido pela metade**. Isso mantém
o posicionamento do produto (ferramenta séria para arquiteto, não promoção de
software genérico) e evita atrair quem só caça desconto.

Hierarquia da cópia, em ordem:

1. `Oferta de lançamento` — enquadra como marco, não como liquidação
2. `50% de desconto na primeira mensalidade` — o fato
3. `assine, use de verdade e decida depois` — a razão
4. `até 31 de agosto` — o prazo

**O que não dizer:** "promoção imperdível", "últimas vagas", "por tempo
limitadíssimo", qualquer contagem regressiva agressiva, e qualquer número de
clientes/renders que não exista de fato (a landing já tem regra contra claims
não verificáveis).

---

## 5. Calendário

| Quando | O quê |
| ------ | ----- |
| D-1 | Criar o cupom no Stripe live, setar `STRIPE_LAUNCH_COUPON_ID` na Vercel, redeploy |
| D-1 | Compra real de validação (ver [Ativação](#ativação), passo 5) |
| D0 | Deploy com a campanha no ar |
| D0 | Avisar a base já cadastrada — fora do escopo desta entrega, mas é o público mais barato de converter |
| D+7 | Primeira leitura de números: sessões → checkout → assinatura |
| D+30 | **Leitura que importa:** taxa de renovação do 2º mês da coorte com desconto |
| 31/08 | Fim da janela — **exige deploy**, ver [Encerramento](#encerramento) |

---

## 6. O que medir

Todo checkout e toda assinatura já gravam evento no funil first-party
(`recordAcquisitionEvent`), agora com a marca `launch_offer`:

- `checkout_started` → `metadata.launch_offer` (bool) e `plan_id`
- `subscription_started` → `metadata.launch_offer` (bool), `value_cents` com o
  valor realmente cobrado
- `subscription_renewed` → é aqui que a campanha é julgada

**Métrica primária: renovação do 2º mês da coorte com desconto.**
Assinatura barata que cancela antes da segunda cobrança não é conversão, é custo.
O número a comparar é a taxa de renovação de quem entrou com desconto contra quem
entrou a preço cheio.

Métricas secundárias: visitantes da landing → checkout iniciado; checkout iniciado
→ assinatura concluída; distribuição por plano (se o desconto empurrar todo mundo
para o Starter, o ticket médio cai sem ganho de retenção).

---

## 7. Riscos e o que já está protegido

| Risco | Proteção |
| ----- | -------- |
| Assinar com desconto, cancelar, reassinar com desconto para sempre | O checkout consulta o Stripe (`subscriptions.list` com `status: 'all'`, inclui canceladas). Qualquer histórico de assinatura tira a elegibilidade. |
| Anunciar 50% e cobrar cheio | Se a oferta está aberta mas `STRIPE_LAUNCH_COUPON_ID` não existe, o log grita com `console.error`. A venda não é bloqueada porque o cliente ainda vê o valor real na tela do Stripe antes de pagar. |
| Desconto vazar para o plano anual | O desconto só se aplica no ciclo mensal — "primeiro mês" não significa nada num plano anual. (O anual está pausado de qualquer forma.) |
| Desconto reduzir os nodes entregues | Os nodes vêm de `metadata.nodes_to_add`, que é a cota do plano, independente do valor pago. Não passa perto do desconto. |
| Campanha vencer e continuar anunciada | **Não está protegido** — ver Encerramento. |
| Cliente alegar que o desconto era permanente | Letra miúda com a condição completa aparece na seção de planos da landing. |

---

## Ativação

Passo a passo. O cupom precisa ser criado por quem tem acesso ao dashboard —
não faz parte do deploy.

**Modo teste: já feito.** O cupom `launch50-first-month` existe em teste e foi
validado — os quatro planos batem exatamente a metade na primeira fatura
(89 → 44,50 · 199 → 99,50 · 349 → 174,50 · 699 → 349,50). O `.env.local` já
aponta para ele, então o ambiente de desenvolvimento funciona sem mais nada.

**Modo live: falta fazer.** Cupom é por modo — o de teste não existe em produção.

1. Stripe → alternar para **modo live** → **Product catalog → Coupons → New**
2. Configurar **exatamente** assim:
   - **ID: `launch50-first-month`** ← use este mesmo ID (o campo aparece ao
     expandir as opções avançadas). Assim a env vale igual em teste e produção.
   - Discount type: **Percentage**, valor **50**
   - Duration: **Once** ← é isto que faz valer só na primeira fatura
   - Name: `Lancamento 50% primeiro mes`
   - **Redeem by: 31/08/2026** — trava a janela no próprio Stripe, além da trava
     que já existe no código
3. Vercel → Environment Variables → adicionar em **Production**:
   ```
   STRIPE_LAUNCH_COUPON_ID=launch50-first-month
   ```
   Depois **redeploy** — env nova só entra em build novo.
4. Validar com uma compra real de R$ 44,50 (Starter) numa conta que nunca
   assinou. Conferir: valor cobrado pela metade, plano ativado, 750 nodes
   creditados, evento no funil com `launch_offer: true`. Reembolsar depois.

---

## Encerramento

**Encerrar a campanha exige deploy — não basta a data passar.**

A rota de checkout é dinâmica e para de aplicar o desconto no instante exato da
virada. Mas a landing é prerenderizada estática no build: a faixa e os preços
riscados continuam no HTML publicado até o próximo deploy. Deixar a data vencer
sem deploy significa anunciar 50% e cobrar cheio.

Para encerrar:

1. Em `lib/launch-offer.ts`, colocar `LAUNCH_OFFER_ENABLED = false`
   (ou antecipar `LAUNCH_OFFER_ENDS_AT`)
2. Deploy
3. No Stripe, desativar o cupom para nenhuma sessão antiga conseguir reaproveitá-lo

Para prorrogar: mudar só a data em `LAUNCH_OFFER_ENDS_AT` e fazer deploy. Se o
cupom tiver `redeem_by`, estender lá também.
