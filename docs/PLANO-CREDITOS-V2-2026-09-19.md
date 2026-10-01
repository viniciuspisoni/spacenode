# Plano — Regra de créditos v2 (validade por crédito + congelamento)

Companion da PR #238, que muda os Termos. **A PR dos Termos não pode ser
mergeada antes deste plano estar implementado**: hoje o contrato passaria a
prometer menos do que o produto entrega, o que é seguro, mas não fecha a
brecha que motivou tudo — assinar e cancelar no mesmo dia e usar o saldo por
90 dias.

## A regra decidida (19/09/2026)

Para assinaturas iniciadas **a partir da vigência**:

1. Nodes mensais valem **90 dias corridos a contar de cada crédito** — por
   lote, não por saldo.
2. Continuam **acumulando** entre ciclos, até o fim da validade de cada um.
3. Consumo **FIFO pelo vencimento mais próximo**, depois extras.
4. Encerrada a assinatura, o saldo mensal fica **congelado**: visível, não
   gastável.
5. Reativando em **até 30 dias**, o saldo é liberado — já sem o que venceu,
   porque **o relógio dos 90 dias não para durante o congelamento**.
6. Passados 30 dias sem reativação, o saldo congelado expira.

Fora do escopo, por decisão explícita:

- **Nodes extras seguem sem validade** e **não congelam**. São bem comprado à
  parte; expirar ou bloquear crédito pago é o ponto mais sensível no CDC. Na
  prática: quem cancela continua podendo gastar extras, só não os mensais.
- **Assinaturas iniciadas antes da vigência** mantêm a regra antiga (90 dias
  **usáveis** após o cancelamento).

## O que existe hoje

| Peça | Estado |
|---|---|
| `profiles.credits` | escalar único com todo o saldo mensal |
| `profiles.nodes_expire_at` | **uma** data para o saldo inteiro |
| `lumen_packs` | já é lote: `nodes_remaining`, `expires_at`, `status`, índice FIFO |
| `consume_nodes_v2` | já faz FIFO por `expires_at` — **só para extras** |
| `start_nodes_grace` | cancelamento → `nodes_expire_at = fim + 90d`, saldo **gastável** |
| `expire_plan_nodes_for_user` | zera o saldo quando a data passa |
| `expire_stale_plan_nodes` | varredura do cron |
| "congelado" | **não existe** |

O mecanismo de lote, portanto, **já foi construído e testado** — está
desligado para os extras desde `20260831190000_extra_nodes_no_expiry`
(`expires_at = 'infinity'`). A v2 é reacendê-lo para os mensais.

## Decisões de desenho

### 1. Tabela nova, não reaproveitar `lumen_packs`

`lumen_packs` tem `CHECK (pack_size IN (500, 1500, 4000))` — as franquias de
plano (750, 800, 1800, 4000, 8000) violam. Afrouxar um CHECK numa tabela com
dados de cliente é mais arriscado do que criar `plan_node_lots`, e manteria
mensais e extras misturados justo quando a decisão foi separá-los.

### 2. `profiles.credits` continua sendo a soma, em cache

É lido em muitos pontos do app. Mantê-lo como soma dos lotes ativos,
atualizado pelas mesmas funções que já seguram `FOR UPDATE` na linha,
preserva todos os leitores atuais sem refatoração. Os testes passam a assertar
a invariante `credits == SUM(lotes vivos)`.

### 3. Um caminho de consumo só

Grandfathered recebem lotes com `expires_at = 'infinity'`. Assim `consume`
tem uma única implementação (FIFO por vencimento) e a diferença v1/v2 vive
**só no cancelamento**. Sem `IF regime = ...` espalhado pelo consumo.

### 4. Regime em coluna, não em comparação de data

`profiles.nodes_rule` (`'v1'` | `'v2'`), gravado na criação da assinatura.
Comparar `subscription_started_at` com uma constante espalharia a data por
várias funções e quebraria se a constante mudasse. A coluna também torna o
direito adquirido auditável.

### 5. Congelamento no perfil, não no lote

`profiles.nodes_frozen_until`. O congelamento vale para o saldo mensal
inteiro, então é estado de conta. Lotes mantêm seus próprios `expires_at`,
que continuam correndo — é exatamente o que a decisão 5 da regra pede.

## Migration

`supabase/migrations/<ts>_plan_node_lots_v2.sql`, aditiva:

1. **`plan_node_lots`** — `id`, `user_id`, `nodes_initial`, `nodes_remaining`,
   `status` (`active`/`depleted`/`expired`), `granted_at`, `expires_at`,
   `source_kind`, `source_id`. Índice FIFO `(user_id, expires_at ASC) WHERE
   status = 'active'` e índice parcial para o cron.
2. **`profiles.nodes_rule`** TEXT NOT NULL DEFAULT `'v2'`, CHECK em
   (`v1`,`v2`) — e **backfill de todos os perfis existentes para `'v1'`**
   antes de aplicar o default.
3. **`profiles.nodes_frozen_until`** TIMESTAMPTZ NULL.
4. **Backfill dos saldos atuais**: um lote por perfil com `credits > 0`,
   `expires_at = 'infinity'`, `granted_at = NOW()`, `source_kind = 'backfill'`.
   Ninguém perde saldo e ninguém ganha vencimento retroativo.
5. **`grant_plan_nodes`** — insere lote (`expires_at = NOW() + 90d` se
   `nodes_rule = 'v2'`, senão `'infinity'`) e recalcula `credits`. Mantém a
   idempotência atual pelo índice único do `node_ledger` — **a chave do
   Stripe continua sendo a trava; o lote nasce dentro da mesma transação**.
   Em `v2`, um grant de assinatura também limpa `nodes_frozen_until`.
6. **`consume_nodes_v2`** — debita lotes de `plan_node_lots` em FIFO por
   `expires_at`, depois extras. **Recusa lotes de plano quando
   `nodes_frozen_until > NOW()`; extras seguem gastáveis.**
7. **`start_nodes_grace`** — ramifica: `v1` mantém o comportamento atual;
   `v2` grava `nodes_frozen_until = fim + 30d` e **não** mexe em
   `nodes_expire_at`.
8. **`expire_stale_plan_nodes`** — passa a (a) expirar lotes vencidos e
   (b) zerar saldo congelado além de `nodes_frozen_until`.
9. **`user_node_balance`** — soma lotes vivos, expõe `nodes_frozen_until` e um
   booleano `plan_balance_frozen`.

Tudo idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`), no padrão das
migrations de billing já aplicadas.

## Testes SQL

Arquivo novo `supabase/tests/plan_node_lots.test.sql`, mesmo formato do
`cumulative_plan_nodes.test.sql`: uma transação, `pg_temp.assert_eq`,
`ROLLBACK` no fim.

Casos:

1. Grant em `v2` cria lote com `expires_at ≈ now + 90d`.
2. Dois grants = dois lotes; `credits == SUM(nodes_remaining)`.
3. Consumo debita o lote de **vencimento mais próximo** primeiro.
4. Lote além dos 90 dias não conta no saldo e é varrido pelo cron.
5. Consumo atravessa lotes: gasta o primeiro até zerar e segue no seguinte.
6. Cancelamento em `v2` congela: consumo de mensais levanta `P0001`.
7. **Extras seguem gastáveis com o saldo mensal congelado.**
8. Reativar em 30 dias descongela — e lotes vencidos **durante** o
   congelamento não voltam.
9. Passados 30 dias, a varredura zera o congelado.
10. Cancelamento em `v1` continua **gastável** por 90 dias (direito adquirido).
11. Idempotência: mesmo `source_id` do Stripe = **um** lote só.
12. Invariante final: `credits == SUM(lotes vivos)` em todos os cenários.

O `tests/nodes-rollover.test.ts` ganha os equivalentes do lado TypeScript
(prazos e cópia), como já faz para a regra atual.

## Rollout

| Fase | Conteúdo | Seguro sozinho? |
|---|---|---|
| A | Migration + testes SQL | **Sim** — ninguém está em `v2` ainda |
| B | Webhook grava `nodes_rule`, constantes em `lib/billing/nodes.ts`, UI de congelado (`BillingClient`, popover do avatar) | Sim |
| C | PR #238 (Termos) + aviso aos assinantes | Depende de A e B |

`UPDATED_AT` dos Termos **é a data de vigência** e tem de ser o dia do merge
da fase C — a cláusula de transição cita essa data e o backfill de
`nodes_rule = 'v1'` define exatamente o mesmo conjunto de pessoas.

## Pendências fora deste plano

- **`BillingClient.tsx:223`** ainda renderiza `NODES_POLICY_COPY` ("saldo
  permanece disponível por 90 dias"). Entra na fase B.
- **Aviso aos assinantes ativos**, exigido pela própria cláusula 5
  ("alterações não são retroativas: valem a partir do ciclo seguinte e serão
  comunicadas com antecedência razoável"). São 4 hoje, todos `v1`, então o
  aviso é informativo — a regra deles não muda.
