# Ajuste retroativo de Nodes — 16/09/2026

Registro dos créditos manuais aplicados em produção depois que a regra de Nodes
acumulativos (PR #188, em produção desde 10/09/2026) passou a valer para quem já
era assinante antes dela.

## O que aconteceu

Até 10/09/2026 o webhook do Stripe sobrescrevia o saldo a cada evento:

| evento | código antigo |
|---|---|
| ativação | `credits = plano.nodes` |
| renovação | `credits = plano.nodes` |
| cancelamento | `plan = 'free', credits = 0` |

Quem não gastava tudo perdia a diferença na virada, e quem cancelava perdia o
saldo inteiro. A regra nova soma na renovação e preserva o saldo por 90 dias
após o cancelamento — mas só a partir de 10/09, sem retroatividade automática.

Uma assinante (Paula Miolla) reclamou em 16/09 de "reinício para 750".

## Créditos aplicados

Ambos via `grant_plan_nodes(..., kind='adjustment', source='suporte')`, com chave
de idempotência `adjust:acumulo-retroativo-2026-09-16:<user_id>` no `node_ledger`.

| conta | saldo antes | creditado | saldo depois |
|---|---|---|---|
| `paulamiolla@gmail.com` | 712 | **+1.890** | 2.602 |
| `nataliabmaggi@gmail.com` | 2 | **+1.824** | 1.826 |

## Composição dos valores — CORRIGIDA

Os dois números foram calculados com uma **âncora errada**: usei
`profiles.created_at` (a data de CADASTRO) como início da assinatura, e
reconstruí três ciclos mensais a partir dela. A data real de assinatura está em
`marketing.acquisition_events`, e é outra.

O que os eventos reais mostram:

| conta | assinou | renovou | consumo no ciclo | saldo sobrescrito |
|---|---|---|---|---|
| Paula | 30/07/2026 | 30/08/2026 | 178 | **572** |
| Natália | 28/07/2026 | 28/08/2026 | 386 | **364** |

Cada uma teve **uma** renovação sob a regra antiga — não três.

Composição defensável do que foi creditado:

**Paula — +1.890**
- **572** — perda confirmada na renovação de 30/08/2026.
- **indeterminado** — ela consumiu 674 nodes antes de 24/07/2026, contra um
  grant gratuito de 40 na época. Isso só se explica por uma assinatura anterior,
  com renovações que também sobrescreveram o saldo. Não há registro no banco
  (ver "Limite da auditoria"), então o valor não é calculável aqui.
- **o restante** — cortesia.

**Natália — +1.824**
- **364** — perda confirmada na renovação de 28/08/2026.
- **1.460** — cortesia. No caso dela o registro é completo: consumiu só 40 nodes
  antes da instrumentação, compatível com o grant gratuito, sem assinatura
  anterior.

Decisão do dono em 16/09: **não mexer mais nos saldos**. Os valores ficam como
estão; este documento é o registro da diferença.

## Limite da auditoria

`marketing.acquisition_events` só tem eventos de assinatura a partir de
**24/07/2026** — o dia em que a instrumentação entrou (commit `ea74e507`,
PR #115). Qualquer assinatura, renovação ou cancelamento anterior a essa data
**não deixou rastro no banco**: `stripe_webhook_events` está vazia e
`profiles.last_renewal_at` é NULL para todo mundo.

Fechar essa lacuna exige a chave LIVE do Stripe, que não está disponível no
ambiente local (`.env.local` só tem `sk_test`).

## Auditoria dos demais assinantes

Todos os perfis com `stripe_customer_id`, `stripe_subscription_id` ou plano
diferente de `free`, cruzados com os eventos reais:

| conta | situação | atingido? |
|---|---|---|
| `paulamiolla@gmail.com` | ativa, 1 renovação em 30/08 | **sim** — 572 confirmados + pré-24/07 desconhecido |
| `nataliabmaggi@gmail.com` | ativa, 1 renovação em 28/08 | **sim** — 364 |
| `alicenneitzke07@gmail.com` | assinou 29/07, **cancelou 29/08** | **sim, por outro caminho** — ver abaixo |
| `nathalia.laiser@gmail.com` | ativa desde 31/08 | não — 1ª renovação seria 30/09 |
| `juliaghigonetto@gmail.com` | ativa desde 12/09 | não — já nasceu sob a regra nova |
| `spacenodeads@gmail.com` | interna; assinou e cancelou em 2 min (24/07) | não |
| `viniciuspisonivargas@gmail.com` | plano concedido à mão, sem assinatura Stripe | não |
| `mudecomamuda@gmail.com` | plano concedido à mão, sem assinatura Stripe | não |

### O caso da Alice — confisco no cancelamento

`alicenneitzke07@gmail.com` não foi atingida pela sobrescrita de renovação
(cancelou 29/08, um dia antes da renovação). Foi atingida pela **outra** metade
da regra antiga: o `credits = 0` do cancelamento.

- Assinou 29/07/2026 21:21, cancelou 29/08/2026 21:21 (fim do período pago).
- Consumo **dentro do ciclo pago**: 230 nodes.
- Saldo no cancelamento: 750 − 230 = **520 nodes**, zerados.

**Creditado em 17/09/2026: 440 nodes** (`adjustment` / `suporte`, chave
`adjust:confisco-cancelamento-2026-09-17:b0e78c67-…`), com
`nodes_expire_at = 2026-11-27 21:21:52+00` — exatamente a janela de 90 dias que
a regra atual daria, contada do cancelamento.

**Faltam 80 nodes.** O valor de 440 veio de uma conta que usou o consumo TOTAL
dela (310) em vez do consumo dentro do ciclo pago (230). Os outros 80 ela gastou
do grant gratuito ANTES de assinar, e a ativação sobrescreveu esse saldo de
qualquer jeito — então não entram na conta do confisco. O número certo é 520.
Pendente de decisão.

## Validação de dupla contagem

Depois das duas migrations, o consumo que a view reporta foi reconciliado contra
o movimento real de saldo de cada assinante. Se a view contasse alguma coisa
duas vezes, o saldo previsto não fecharia:

| conta | saldo previsto pela view | saldo real | |
|---|---|---|---|
| Paula (pós-renovação 30/08) | 692 | 692 | ✅ |
| Natália (pós-renovação 28/08) | 2 | 2 | ✅ |
| nathalia.laiser (pós-ativação) | 570 | 570 | ✅ |
| Julia (pós-ativação, regra nova = soma) | 632 + 5 | 637 | ✅ |
| Alice (no cancelamento) | 520 | 520 | ✅ |

Os dois pontos onde a dupla contagem era real e foram fechados:

1. `image_edit_attempts` ficou fora da view — é telemetria, e todo débito que
   ela registra já está em `edits` ou `vistas`.
2. Um Space carregava `dna_nodes_cost` herdado da vista promovida (marca copiada
   por `promote-vista-mestre`, com timestamp idêntico). A mesma extração paga
   aparecia nas duas tabelas. O backfill passou a excluir esse caso.
