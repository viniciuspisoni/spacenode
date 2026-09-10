// lib/billing/nodes.ts
//
// Política de acúmulo dos Nodes mensais — fonte única (2026-09-10).
//
// A regra antiga era "usou ou perdeu": a renovação sobrescrevia o saldo com
// os nodes do plano. Agora o saldo ACUMULA:
//
//   • Nodes mensais não expiram enquanto a assinatura estiver ativa.
//   • Cada renovação SOMA os nodes do plano ao que sobrou.
//   • Cancelou: o saldo já adquirido continua gastável por mais
//     NODES_GRACE_DAYS dias depois do fim da assinatura, e só então expira.
//
// O consumo por ferramenta é o mesmo de sempre — nada aqui mexe em custo de
// geração. Quem soma é grant_plan_nodes (idempotente pela chave do Stripe);
// quem expira é expire_stale_plan_nodes / a checagem preguiçosa no consumo.
//
// As constantes de texto vivem aqui porque a mesma frase precisa aparecer na
// landing, no billing, no FAQ e nos Termos. Uma frase, um lugar.

/** Dias de cortesia depois do fim da assinatura antes de o saldo expirar. */
export const NODES_GRACE_DAYS = 30

/** A promessa, como o usuário lê. Landing, billing, FAQ, app. */
export const NODES_ROLLOVER_COPY =
  'Nodes não utilizados acumulam enquanto sua assinatura estiver ativa.'

/** A contrapartida, sempre junto da promessa onde houver espaço. */
export const NODES_GRACE_COPY =
  `Se cancelar, o saldo acumulado continua disponível por ${NODES_GRACE_DAYS} dias.`

/**
 * Fim da janela de cortesia: `NODES_GRACE_DAYS` depois do fim da assinatura.
 *
 * O `customer.subscription.deleted` chega no fim do período já pago (o
 * cancelamento no portal é sempre "ao fim do ciclo"), então `endedAt` costuma
 * ser ~agora. Ele é respeitado mesmo assim porque o Stripe também cancela
 * assinaturas por inadimplência, e nesse caso o fim do período é no passado —
 * contar a partir de "agora" daria cortesia maior do que a regra promete.
 */
export function graceDeadline(endedAt: Date | null | undefined, now: Date = new Date()): Date {
  const base = endedAt && Number.isFinite(endedAt.getTime()) ? endedAt : now
  return new Date(base.getTime() + NODES_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

/** Dias inteiros que ainda faltam até `deadline` (0 se já venceu). */
export function graceDaysLeft(deadline: Date | string | null | undefined, now: Date = new Date()): number {
  if (!deadline) return 0
  const end = deadline instanceof Date ? deadline : new Date(deadline)
  if (!Number.isFinite(end.getTime())) return 0
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

/** O saldo mensal está dentro da janela de cortesia pós-cancelamento? */
export function isInGracePeriod(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return false
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  return Number.isFinite(end.getTime()) && end.getTime() > now.getTime()
}

/**
 * Nodes a creditar numa troca de plano no meio do ciclo (upgrade).
 *
 * O Stripe cobra o proporcional na hora e emite uma fatura com
 * `billing_reason = 'subscription_update'`. Sem isto, quem paga o upgrade no
 * dia 10 fica com o saldo do plano antigo até a próxima renovação — pagou e
 * não recebeu.
 *
 * A conta é a mais simples que respeita o dinheiro: creditamos a MESMA fração
 * de um mês do plano novo que a fatura cobrou. Pagou 40% de uma mensalidade
 * do Pro → 40% dos nodes do Pro.
 *
 * Downgrade não credita nada: a fatura proporcional é crédito na conta do
 * Stripe (amount_paid = 0), e o saldo acumulado que o usuário já tem
 * permanece intocado — o rebaixamento vale a partir da próxima renovação.
 *
 * Teto de um mês do plano novo: uma fatura fora do padrão (várias mudanças no
 * mesmo ciclo, quantidade > 1) nunca vira um grant desproporcional.
 */
export function prorationNodes(
  amountPaidCents: number | null | undefined,
  monthlyPriceCents: number,
  planNodes: number
): number {
  if (!amountPaidCents || amountPaidCents <= 0) return 0
  if (!monthlyPriceCents || monthlyPriceCents <= 0) return 0
  const ratio = Math.min(1, amountPaidCents / monthlyPriceCents)
  return Math.min(planNodes, Math.round(planNodes * ratio))
}
