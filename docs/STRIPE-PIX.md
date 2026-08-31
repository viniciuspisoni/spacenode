# Pix no checkout

Estado: **código pronto, desligado por env — e bloqueado por elegibilidade da
conta.** O que falta não é configuração: é o Stripe liberar Pix pra conta.

## ⚠️ Bloqueio: Pix é convite para conta brasileira

Verificado na conta em 2026-07-28: `capabilities` tem `card_payments` e
`boleto_payments` ativos, e **`pix_payments` não existe** — nem inativo, nem
pendente. Ligar `pix` na payment method configuration (feito, em modo teste)
**não resolve**: a session continua sendo recusada com "payment method type
provided: pix is invalid".

Segundo o suporte do Stripe, Pix para contas brasileiras é *invite-only* e
exige, entre outros critérios:

- conta em situação regular;
- **mínimo de 60 dias processando pagamentos no Stripe**;
- conta brasileira, moeda BRL.

A conta começou a vender em produção em 2026-07-16 — ou seja, o critério dos
60 dias só é atingido por volta de **meados de setembro de 2026**.

**Ação necessária (só o dono da conta faz):** abrir chamado com o suporte do
Stripe pedindo acesso ao Pix. Vale perguntar explicitamente sobre **Pix
Automático** no mesmo chamado: a página de suporte ainda diz que conta
brasileira só faz Pix avulso, enquanto a doc de produto (changelog de
2026-04-22) já descreve assinatura via Pix Automático. Os dois podem ser
liberações separadas — e é o Pix Automático que destrava a venda de planos.

Enquanto isso não acontece, `STRIPE_PIX_ENABLED` fica desligado. Ligar antes
não quebra a venda (a rota detecta a recusa e refaz a session só com cartão),
mas gasta uma chamada à API por checkout sem nenhum ganho.

## O que foi implementado

| Produto | Modo | Meio |
|---|---|---|
| Packs de Nodes extras (avulso; ex-"Lumen") | `payment` | Pix comum (QR, expira em 1h) |
| Planos (assinatura mensal) | `subscription` | Pix Automático (mandato no app do banco) |

Ciclo **anual** fica só no cartão: `payment_schedule` do mandato espelha a
periodicidade da cobrança, e o anual está pausado (`ANNUAL_BILLING_ENABLED`).
Sem uma assinatura anual real para testar, oferecer Pix nela seria chute.
Quando o anual voltar, é trocar `pixAllowedForCycle` e usar
`payment_schedule: 'yearly'` — o Stripe aceita.

## Para ligar (depois que o Stripe liberar)

1. **Dashboard → Payment methods**, no modo certo (teste e live são contas
   separadas — ativar em um NÃO ativa no outro):
   - ativar **Pix**;
   - ativar **Pix Automático** (é o produto de recorrência, separado do Pix
     comum; sem ele a assinatura por Pix não funciona).
2. Setar `STRIPE_PIX_ENABLED=1` — em `.env.local` para testar, e na Vercel
   (+ redeploy) para produção.
3. **Webhook**: adicionar os eventos novos ao endpoint em
   Dashboard → Webhooks. Sem eles o Pix cobra e não credita:
   - `checkout.session.async_payment_succeeded` ← **o que credita o Pix avulso**
   - `checkout.session.async_payment_failed`
   - `invoice.paid` (já usado na renovação; agora também ativa a assinatura)
   - `mandate.updated`

A ordem importa: ligar a env antes de ativar no Dashboard não quebra a venda
(a rota detecta a recusa e refaz a session só com cartão, gritando no log),
mas ninguém vai ver Pix nenhum.

## Por que a env existe

Se `pix` for mandado em `payment_method_types` sem estar ativado na conta, o
Stripe recusa a **session inteira** — inclusive de quem ia pagar no cartão. Um
erro de configuração viraria outage de vendas. Daí a env desligada por padrão
*e* a degradação em cascata na rota, que também cobre o cupom de lançamento.

## O que muda na operação

**Pix não é instantâneo do ponto de vista do sistema.** A Checkout Session
completa ANTES de o dinheiro entrar, com `payment_status: 'unpaid'`. Por isso
o webhook só credita com pagamento confirmado — creditar na session completa
daria nodes de graça, e o cliente ficaria com eles se o QR expirasse.

**Renovação por Pix Automático atrasa alguns dias.** O esquema exige
notificação de pré-débito 3 dias antes de cada cobrança, e há retentativas por
até 7 dias. Consequência prática: um assinante que paga por Pix pode passar
alguns dias de cada mês com o saldo do ciclo anterior antes da recarga entrar
(a recarga acontece em `invoice.paid`). Não há como acelerar isso — é regra do
Pix Automático, não do Stripe nem do SPACENODE.

**Teto do mandato.** O cliente autoriza no app do banco um valor máximo por
ciclo. A rota manda exatamente o preço do plano, lido do Price do Stripe (não
do catálogo em `lib/plans.ts`, porque é o Price que é cobrado de fato). O
default do Stripe é R$ 400 — que o Office (R$ 699) estouraria, então mandar o
valor não é afinação, é obrigatório.

Corolário: **aumento de preço não cabe no mandato antigo.** Assinantes por Pix
precisariam autorizar um mandato novo (Checkout em `setup` mode). É o ponto que
quebra primeiro se os preços subirem.

**Mandato revogado.** O cliente pode revogar no app do banco, fora do
SPACENODE. As faturas seguintes falham até a assinatura ser cancelada, e aí o
`customer.subscription.deleted` faz o downgrade normal. O webhook loga
`mandate.updated` para o suporte conseguir responder "por que parei de receber
nodes" sem adivinhar.

## Testar (modo teste)

O desfecho do Pix é controlado pelo **e-mail** usado no checkout:

| E-mail | Resultado |
|---|---|
| `qualquer@x.com` | paga depois de ~3 min |
| `succeed_immediately@x.com` | paga na hora |
| `expire_immediately@x.com` | expira na hora |
| `fill_never@x.com` | nunca paga, expira no prazo |

CPF/CNPJ de teste: `000.000.000-00`.

O caso que mais importa testar é `expire_immediately`: o saldo **não** pode
subir em momento nenhum.

Atenção: em 2026-07-28 os **dois endpoints de webhook do modo teste estavam
`disabled`** (`we_1TtZUd…` e `we_1TOmpF…`). Sem endpoint ativo nenhum evento é
entregue em teste — nem o `async_payment_succeeded`, que é justamente o que
credita o Pix avulso. Para testar de ponta a ponta, usar `stripe listen`
apontando para o dev local, ou reativar o endpoint de teste.
