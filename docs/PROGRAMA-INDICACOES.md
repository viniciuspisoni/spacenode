# Programa de Indicações

**Entrada em vigor:** 1º de setembro de 2026 (automática, por data no código)
**Superfícies:** `/app/indicacoes`, `/convite/CODIGO`, `/login`, checkout do Stripe
**Status:** implementado; depende da migration e da configuração do webhook (ver [Ativação](#7-ativação))

---

## 1. As regras

| Quem | Benefício | Quando |
| ---- | --------- | ------ |
| Indicado | **10%** na primeira mensalidade | Aplicado no checkout, por link ou código |
| Indicador | **20%** na próxima mensalidade, por indicação confirmada | Liberado após o pagamento do indicado **e** o fim do prazo de reembolso |

- Os descontos do indicador **somam até 100%** de uma mensalidade — cinco
  indicações confirmadas equivalem a uma mensalidade inteira.
- O que passar de 100% **não se perde**: entra nas mensalidades seguintes.
- **Cada nova conta usa uma indicação só.**
- **Nada acumula com a promoção de lançamento.** As duas janelas são
  contíguas por desenho (lançamento até 31/08 23h59, indicações a partir de
  01/09 00h00), e o não-acúmulo ainda é imposto por código.

Tudo isso mora em `lib/referral/config.ts`. Mudar um percentual, a data ou o
prazo de reembolso ali muda o servidor, o painel e a cópia de uma vez.

---

## 2. Por que "20% na próxima mensalidade" e não crédito em reais

O benefício é **percentual e aplicado na fatura**, não um valor fixo creditado
no saldo do cliente. Três consequências que valem a escolha:

1. **Upgrade e downgrade ficam certos sozinhos.** 20% de Studio é mais que 20%
   de Starter, e é assim que deve ser — o desconto acompanha o que a pessoa
   está pagando de fato, sem nenhuma conta nossa.
2. **A assinatura não é tocada.** O cupom entra na *fatura em rascunho*, não na
   Subscription. Nenhum cupom existente é alterado, nenhum histórico de
   assinatura muda.
3. **Cancelar não queima o benefício já conquistado.** Sem fatura, nada é
   consumido; as recompensas do *indicador* ficam `available` e entram na
   primeira mensalidade depois da reativação. (Cancelamento do *indicado*
   dentro da janela de reembolso é outra história — ver §6.)

---

## 3. Arquitetura

```
  Convite                     Cadastro                    Cobrança
  ───────                     ────────                    ────────
  /convite/CODIGO ─┐
                   ├─→ cookie sn_ref (90d) ─→ POST /api/referrals/bind
  ?ref=CODIGO ─────┘         (ReferralBinder, /app)   │
                                                       ↓
                                          referrals (status: signed_up)
                                                       │
                          checkout do indicado ────────┤ 10% (cupom `once`)
                                                       ↓
                    invoice.paid (subscription_create) │
                                                       ↓
                                          referrals → confirmed
                                          referral_rewards → pending
                                          (available_at = pago + 7 dias)
                                                       │
                    cron/referral-rewards ─────────────┤ pending → available
                                                       ↓
                    invoice.created (subscription_cycle) da mensalidade
                    do INDICADOR → reserva até 100% → cupom na fatura
                                                       ↓
                    invoice.paid → consumed  |  falhou/void → volta à fila
```

### Camadas

| Arquivo | Papel |
| ------- | ----- |
| `lib/referral/config.ts` | Janela, percentuais, prazos, cópia e a decisão de **qual** desconto entra no checkout (`resolveCheckoutDiscount`) |
| `lib/referral/codes.ts` | Forma do código (8 caracteres, alfabeto sem `0/O/1/I`), link e mensagem de compartilhamento |
| `lib/referral/rewards.ts` | Agregações puras do painel (disponível, progresso, mensalidades garantidas) |
| `lib/referral/service.ts` | Acesso ao banco via service role — toda transição é uma RPC atômica |
| `lib/referral/stripe.ts` | Cupons por percentual, aplicação na fatura, resolução de payment intent e fingerprint |
| `lib/referral/webhook.ts` | Os efeitos de cada evento do Stripe |
| `supabase/migrations/20260731000000_referral_program.sql` | Tabelas, funções e RLS |

### Tabelas

| Tabela | Para quê |
| ------ | -------- |
| `referral_codes` | Um código por conta, criado sob demanda |
| `referral_invites` | Cada compartilhamento — alimenta "convites enviados" |
| `referrals` | O vínculo indicador → indicado e seu estado |
| `referral_rewards` | Uma recompensa de 20% por indicação confirmada |
| `referral_reward_applications` | Uma reserva por fatura (chave de idempotência) |
| `referral_events` | Trilha de auditoria append-only |
| `referral_payment_fingerprints` | Um meio de pagamento, uma conta |
| `stripe_webhook_events` | Ids de evento já processados |

RLS ligada em todas, **sem nenhuma policy**: o acesso é só por servidor com
service role, mesmo modelo de `workspace_invites`.

### Máquinas de estado

```
referrals          signed_up ──→ confirmed ──→ (permanece)
                       │             │
                       │             └──→ revoked   (reembolso / contestação)
                       └──→ rejected              (antiabuso)

referral_rewards   pending ──→ available ──→ applied ──→ consumed
                      │            │            │
                      └── revoked ─┘            └──→ available  (fatura não paga)
```

---

## 4. Não-acúmulo, na prática

`resolveCheckoutDiscount` devolve **um** desconto, nunca dois:

1. Promoção de lançamento elegível → `launch` (50%).
2. Campanha de lançamento no ar, mas o cliente não é elegível → **nenhum**
   desconto. Um desconto de indicação não entra "por baixo" da campanha.
3. Campanha encerrada + programa em vigor + indicação vinculada + primeira
   assinatura + ciclo mensal → `referral` (10%).

Na fatura do indicador vale a mesma disciplina: se a fatura **já tem qualquer
desconto**, o programa não entra — sobrescrever `discounts` apagaria um cupom
que não é nosso.

---

## 5. Antiabuso

| Vetor | Barreira |
| ----- | -------- |
| Autoindicação | `bind_referral` recusa quando o dono do código é o próprio usuário; a tabela ainda tem `check (referrer <> referred)` |
| Duas indicações na mesma conta | `referred_user_id` é `unique` |
| Conta duplicada por email | `normalize_email` (remove `+tag`; ignora pontos no Gmail) — email normalizado igual ao do indicador vira `rejected` com flag |
| Conta antiga usando link de amigo | Só vincula conta com menos de 30 dias e que nunca teve `stripe_customer_id` |
| Mesmo cartão em várias contas | `claim_payment_fingerprint`: o fingerprint do Stripe fica preso à primeira conta; repetido em outra, a indicação é `rejected` |
| Pagar, ganhar e pedir reembolso | Recompensa nasce `pending` e só fica disponível 7 dias após o pagamento; `charge.refunded` e `charge.dispute.created` revogam |
| Assinar só para gerar recompensa e cancelar em seguida | Cancelamento **dentro** da janela de 7 dias revoga a recompensa (ver §6) |
| Reentrega de webhook | `stripe_webhook_events` + funções idempotentes por natureza |

---

## 6. Ciclo de vida do plano

| Situação | Comportamento |
| -------- | ------------- |
| **Upgrade / downgrade** | O desconto é percentual e entra na fatura do ciclo: acompanha o novo valor automaticamente. Faturas de proração (`subscription_update`) ficam de fora — não são mensalidade |
| **Cancelamento do indicador** | Nada é consumido; as recompensas seguem `available` |
| **Cancelamento do indicado, dentro dos 7 dias** | A indicação é revogada e a recompensa do indicador cai. Vale para o cancelamento imediato (`customer.subscription.deleted`) **e** para o agendado no portal (`cancel_at_period_end`) — é este o caminho comum, e ouvir só o `deleted` deixaria o caso comum de fora, porque ele só chega no fim do período |
| **Cancelamento do indicado, depois dos 7 dias** | Não desfaz nada: o indicado usou o mês que pagou e o indicador cumpriu o que o programa pede |
| **Indicado desfaz o cancelamento na mesma janela** | A recompensa volta para `pending` e segue o curso normal. Só revogação por *cancelamento* é reversível — reembolso e contestação são definitivos |
| **Indicador ainda no plano gratuito** | Acumula normalmente, mas o benefício entra a partir da **segunda** mensalidade — a primeira fatura nasce e é paga dentro do checkout, e lá só cabe um desconto (ver §6.1) |
| **Reativação do indicador** | A primeira mensalidade nova recebe o acumulado, até 100% |
| **Ciclo anual** | Fora do programa: o benefício é de *mensalidade* (`findPlanByStripePriceId(...).billing === 'monthly'`) |
| **Pagamento falhou / fatura anulada** | A reserva é devolvida à fila e entra na mensalidade seguinte |
| **Pix** | Funciona igual: a confirmação vem por `invoice.paid`, que é o mesmo sinal do cartão. Sem cartão não há fingerprint, e a checagem simplesmente não bloqueia |

### 6.1 A recompensa entra a partir da segunda mensalidade

**Decidido em 31/07/2026. Está assim de propósito.**

A recompensa do indicador é aplicada em `invoice.created` com
`billing_reason = subscription_cycle` — ou seja, só em **renovação**. A
primeira fatura de uma assinatura (`subscription_create`) é criada e finalizada
dentro do próprio checkout: o desconto dela teria de sair da Checkout Session,
onde cabe **um** cupom só, e esse lugar já é do indicado (10%) ou da campanha
de lançamento.

Quem indica estando no plano gratuito, portanto, paga o primeiro mês cheio e
começa a usar o acumulado no segundo. Com a base atual (poucos assinantes,
maioria das contas no gratuito) esse é o caso comum, e foi aceito
conscientemente — não é regressão nem bug.

Reverter não é trocar a linha do guard em `lib/referral/webhook.ts`: exige
levar o desconto acumulado para o checkout e definir a precedência entre "sou
indicado" e "sou indicador" quando os dois caem na mesma primeira fatura.

---

## 7. Ativação

1. ~~**Aplicar a migration**~~ ✅ **FEITO** — aplicada em produção
   (`nucyyqmurhnakhldshwr`) em 31/07/2026 como `20260731173901_referral_program`.
   Verificado: 8 tabelas com RLS ligada e 0 policies, 14 funções com `md5(prosrc)`
   idêntico ao arquivo do repo, `EXECUTE` apenas para `postgres` e `service_role`
   (o linter de segurança do Supabase não lista nenhuma delas como executável por
   `authenticated`).
2. **Adicionar os eventos no webhook do Stripe** ⬅ **PENDENTE** (Dashboard →
   Webhooks → endpoint `https://spacenode.app/api/stripe/webhook`, hoje com
   apenas 3 eventos). A API `POST /v1/webhook_endpoints/{id}` **substitui** a
   lista, então a alteração pelo Dashboard (que só acrescenta) é o caminho
   seguro:
   - `invoice.created` ← **indispensável**, é a única janela para aplicar o desconto
   - `invoice.payment_failed`
   - `invoice.voided`
   - `invoice.marked_uncollectible`
   - `charge.refunded`
   - `charge.dispute.created`
   - `customer.subscription.updated` ← pega o cancelamento **agendado** no portal

   `customer.subscription.deleted` já está no endpoint (é o downgrade para o
   plano gratuito) e passa a servir também ao cancelamento imediato.

   Aproveite a mesma passada para três eventos que a rota **já trata** e o
   endpoint nunca assinou — lacuna anterior a este programa:

   - `checkout.session.async_payment_succeeded` ← sem ele, **pack Lumen pago
     via Pix nunca é creditado**: a session completa `unpaid`, a guarda do
     webhook retorna cedo e a confirmação não chega. Hoje é latente (as
     assinaturas em live estão como `payment_method_types: ["card"]`, ou seja,
     o Pix está desligado), mas vira perda de dinheiro no dia em que ligar.
   - `checkout.session.async_payment_failed` ← registra o Pix que expirou.
   - `mandate.updated` ← avisa quando o cliente revoga a autorização do Pix
     Automático, que é o motivo de renovações passarem a falhar.

   **Estado final esperado do endpoint (13 eventos):**

   ```
   checkout.session.completed              invoice.created
   checkout.session.async_payment_succeeded invoice.paid
   checkout.session.async_payment_failed   invoice.payment_failed
   customer.subscription.updated           invoice.voided
   customer.subscription.deleted           invoice.marked_uncollectible
   mandate.updated                         charge.refunded
                                           charge.dispute.created
   ```
3. **Conferir `CRON_SECRET`** na Vercel — o cron diário
   `/api/cron/referral-rewards` (06:00 UTC) já está em `vercel.json`.
4. **Nada de cupom manual.** Os cupons (`spn-referral-10`, `spn-referral-20`,
   …, `spn-referral-100`) são criados sozinhos no primeiro uso, em qualquer
   modo do Stripe.
5. **Redeploy em 01/09** — não pelo programa (todas as rotas dele são
   dinâmicas e viram sozinhas na data), mas pela campanha de lançamento: a
   landing é estática e continua anunciando 50% até o próximo build.

Nenhum passo mexe em assinatura, cupom ou histórico existente.

### Ordem não importa

Os passos 1 e 2 são independentes e seguros em qualquer ordem, inclusive
semanas antes da data:

- **Eventos habilitados antes do deploy do código?** A rota cai no
  `{ received: true }` para tipo desconhecido.
- **Código no ar sem a migration?** Programa inerte — o serviço engole
  `42883`/`42P01` (função/tabela inexistente) de propósito.
- **Migration aplicada sem o código?** Ninguém lê as tabelas.
- **Eventos chegando com o programa fechado?** Cada handler ou sai na guarda
  `isReferralProgramOpen()` ou cai numa RPC que não acha linha e devolve
  `found: false`. Nenhum toca plano, saldo, assinatura ou cupom.

Aplicar cedo é, inclusive, melhor: a recusa por "programa ainda não vigente" é
**não-terminal**, então o cookie do convite (90 dias) sobrevive e o vínculo
acontece sozinho na data. Convite compartilhado em agosto vira indicação
válida em setembro.

---

## 8. Testes

| O quê | Onde | Como rodar |
| ----- | ---- | ---------- |
| Regras, janela e não-acúmulo | `tests/referral/config.test.ts` | `npm test` |
| Forma do código e link | `tests/referral/codes.test.ts` | `npm test` |
| Contas do painel (teto, excedente, progresso) | `tests/referral/rewards.test.ts` | `npm test` |
| Orquestração dos webhooks | `tests/referral/webhook.test.ts` | `npm test` |
| Ciclo de vida no banco, ponta a ponta | `supabase/tests/referral_lifecycle.sql` | `psql -d <db> -f supabase/tests/referral_lifecycle.sql` |

O script SQL sobe atores, vincula, confirma, revoga por reembolso, revoga por
cancelamento dentro da janela, restaura na reativação, acumula até 100%,
empurra o excedente para a mensalidade seguinte e liquida — 56 asserções
contra um Postgres real, aplicadas depois da migration.

---

## 9. Mensagem

**Ideia central:** *"quem chega pelo seu convite começa melhor; você também."*

A área de indicações não parece campanha: sem contagem regressiva, sem
"aproveite", sem faixa colorida. Os números são o argumento — convites,
cadastros, assinaturas confirmadas, desconto disponível, progresso. Verde só
no número que importa (desconto disponível) e na barra de progresso.

**O que não dizer:** "ganhe dinheiro indicando", "programa de afiliados",
"renda extra". O benefício é de uso do produto, não comissão — e a diferença
importa para o posicionamento e para o enquadramento fiscal.
