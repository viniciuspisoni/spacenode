# Indicações e Nodes de parceria

## Regra

O dono de uma conta compartilha `/r/<user_id>`. O vínculo com uma conta nova é
registrado uma única vez, no cadastro. A pessoa que indicou recebe Nodes extras
quando o indicado paga a primeira fatura da assinatura e a cada renovação paga:

| Plano do indicado na fatura | Nodes para quem indicou |
| --- | ---: |
| Essence | 200 |
| Pro | 400 |
| Studio | 800 |

Starter e Office são planos legados e não geram prêmios. Faturas de troca de
plano, faturas sem valor pago, cadastros gratuitos e pagamentos pendentes não
geram prêmios. Após o encerramento da assinatura, não há prêmio no ciclo
seguinte. O que já entrou fica no saldo extra, sem prazo de validade e sem
conversão em dinheiro.

Indicações anteriores à criação do link podem ser vinculadas manualmente.
Quando houver um acordo de prêmio para um plano legado, o valor fica em
`referrals.reward_override_nodes` apenas naquele vínculo. A mesma rotina do
webhook concede o prêmio uma vez por fatura de assinatura efetivamente paga.
O ID da fatura também serve para creditar retroativamente sem duplicar Nodes.

## Implementação

- `referrals` guarda um único indicador por conta indicada. O trigger captura
  o código no cadastro por e-mail, mesmo quando a confirmação chega em outro
  navegador. Os retornos de login com Google vinculam uma conta recém-criada.
- O webhook concede prêmios apenas em `invoice.paid` para criação e renovação,
  depois de verificar valor efetivamente pago. O ID da fatura é único no saldo
  de prêmios, protegendo contra reentregas do Stripe.
- `lumen_packs` continua sendo a bolsa de Nodes extras que o consumo já usa. A
  coluna `source_type` separa compras de indicações no extrato.
- `/app/parcerias` mostra link, indicados, potencial por ciclo e histórico.

## Publicação

Aplicar a migration no banco de produção antes de publicar o código. A migration
foi aplicada e testada no projeto Supabase de desenvolvimento em 2026-10-02;
o teste de crédito dos três planos e de idempotência foi desfeito por rollback.
O banco de produção ainda não recebeu a migration.
