# Preços aprovados em 15/10/2026

Fonte: decisão de Vinícius neste chat, incluindo a manutenção dos contratos atuais.
Estado: tabela e cobrança anual antecipada aprovadas por Vinícius. A configuração de cada ambiente deve ser conferida pela sequência abaixo.

| Plano | Mensal | Total anual | Equivalente mensal no anual | Nodes/mês |
|---|---:|---:|---:|---:|
| Essence | R$149,00 | R$1.341,00 | R$111,75 | 800 |
| Pro | R$299,00 | R$2.691,00 | R$224,25 | 1.800 |
| Studio | R$499,00 | R$4.491,00 | R$374,25 | 4.000 |

O desconto é de 25% sobre doze mensalidades. Não arredondar o equivalente mensal nem usar a mensagem antiga de dois meses grátis. O total anual é cobrado antecipadamente e renova a cada 12 meses; não se trata de 12 parcelas. O anual inicial usa cartão. Pix Automático continua restrito ao mensal já validado.

## Assinaturas existentes

Manter o Price ID e o valor contratados enquanto a assinatura permanecer ativa. Não executar migração de assinaturas ou atualização em lote de subscription items. Uma nova contratação após encerramento usa a tabela vigente. Starter e Office continuam legados e fora de venda.

Os IDs originais `STRIPE_PRICE_ID_{PLANO}_{CICLO}` continuam configurados e reconhecidos pelo webhook. Os novos checkouts usam exclusivamente `STRIPE_PRICE_ID_{PLANO}_{CICLO}_V202610`. A página de cobrança informa a preservação do contrato, sem mostrar o preço novo como se fosse o valor atual do assinante.

## Configuração e lançamento

1. Criar seis novos Prices em BRL nos produtos correspondentes da Stripe, com `recurring.interval_count=1`. Valores em centavos: Essence mensal 14900/anual 134100; Pro mensal 29900/anual 269100; Studio mensal 49900/anual 449100. Intervalo `month` nos mensais e `year` nos anuais. Reutilizar os produtos; preservar os preços originais nas assinaturas.
2. Configurar os seis IDs nas variáveis com sufixo `_V202610`, conservando as originais. Preparar primeiro em ambiente de teste. O checkout recusa um Price com valor, moeda ou periodicidade diferente da vitrine.
3. Publicar a implementação com `NEXT_PUBLIC_ANNUAL_BILLING_ENABLED=1` somente quando o cron `/api/cron/annual-nodes`, seu `CRON_SECRET` e as permissões da RPC existente estiverem verificados. A flag é avaliada no build; reconstruir ao alterá-la. Sem flag, nenhuma vitrine nem checkout anuncia/vende o anual.
4. Validar o ciclo em modo de teste e manter a cobertura de regressão: compra anual paga → primeira cota pelo webhook → avanço de um mês → nova cota → repetição sem crédito duplicado → renovação anual → cancelamento no fim do período. Conferir um assinante antigo renovando pelo Price original e um usuário novo comprando pelo Price novo.
5. Arquivar os Prices antigos para novas compras e revisar Payment Links, botões externos e opções de troca do portal. Arquivar um Price não altera a cobrança dos contratos que já o usam. Encerrar checkouts antigos ainda abertos ou confirmar sua expiração no corte; não alterar contratos ativos.
6. Trocar textos/peças na Meta e demais canais no mesmo corte da publicação. Os anúncios antigos identificados estavam sob campanhas pausadas na conta consultada. Conferir preço em áudio, legenda e cartela; o texto principal sozinho não valida o vídeo. Não reativar material antigo antes dessa revisão.
7. Enviar o agradecimento somente após aprovação do texto e da lista de assinantes ativos anterior ao corte. O rascunho não foi enviado.

## Entrega de Nodes no anual

A fatura inicial e cada renovação anual entregam uma cota mensal pelo webhook. O cron horário concede as onze cotas restantes nos aniversários mensais em UTC. Dias 29–31 usam o último dia dos meses curtos e recuperam o dia original no mês seguinte. Assinatura paga, ativa, sem pausa de cobrança e perfil já atualizado são condições para recarga. Cancelamento ao fim do ano preserva as cotas até o fim do período pago.

As concessões usam a RPC `grant_plan_nodes` e a chave `annual:{subscription}:{item}:{period_start}:{month}` no ledger existente. Reexecuções não duplicam saldo; meses pendentes são recuperados. Nenhuma tabela nova ou migração foi necessária. O cron não concede prêmios de indicação mensais: esses continuam vinculados a faturas efetivamente pagas, como nos Termos.

## Materiais revisados e limites

Código público, billing, Nodi e prompts de geração de anúncio usam `lib/plans.ts`. Os modelos reutilizáveis de importação Meta/Google foram corrigidos; documentos históricos conservam seus cortes, com a referência atual nos briefings. O verificador editorial sinaliza ofertas mensais antigas, mas não faz OCR nem escuta de vídeo.

Os textos substitutos e o inventário de materiais ficam no diretório privado de entregas do projeto. Não anexar rascunhos de atendimento, listagens de campanhas ou outros dados operacionais ao repositório público. Conferir também os materiais publicados e os arquivos exportados antes do corte; a verificação de código não faz OCR nem escuta de vídeo.

Referências Stripe: [preços e preservação das assinaturas](https://docs.stripe.com/products-prices/manage-prices), [preço anual em equivalente mensal](https://docs.stripe.com/payments/checkout/yearly-price-display), [opções documentadas de parcelamento](https://docs.stripe.com/payments/installments).
