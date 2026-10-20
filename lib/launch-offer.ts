// Oferta de lançamento: 50% de desconto na PRIMEIRA mensalidade.
//
// Por que as constantes moram no código e não em env vars:
// a janela precisa ser lida pelo servidor (rota de checkout) E pelo cliente
// (landing, /app/billing). Uma env `NEXT_PUBLIC_` é inlinada no build, então
// mudá-la exigiria rebuild e abriria espaço pra divergência entre o que a UI
// promete e o que o Stripe cobra. Data fixa no código = uma fonte só.
//
// O único valor que fica em env é o ID do cupom do Stripe
// (`STRIPE_LAUNCH_COUPON_ID`), porque o objeto vive na conta Stripe e o ID
// difere entre modo teste e live.

export const LAUNCH_OFFER_PERCENT_OFF = 50

/**
 * Fim da campanha. Horário de Brasília (UTC-3).
 *
 * ATENÇÃO — encerrar a campanha exige DEPLOY, não só esperar a data passar.
 * A rota de checkout é dinâmica e para de aplicar o desconto no instante
 * exato; mas a landing (`/`) é prerenderizada estática no build, então a
 * faixa e os preços riscados continuam no HTML publicado até o próximo
 * deploy. Deixar a data vencer sem deploy = anunciar 50% e cobrar cheio.
 * Agende o deploy de encerramento junto com a data abaixo.
 */
export const LAUNCH_OFFER_ENDS_AT = new Date('2026-08-31T23:59:59-03:00')

/**
 * Desliga a oferta inteira sem mexer na data (kill switch de deploy).
 * Campanha ENCERRADA em 2026-09-01 — a data acima venceu e este switch
 * garante que nenhuma UI volte a anunciar o desconto (o gate do
 * /app/billing roda no relógio do browser do cliente).
 */
export const LAUNCH_OFFER_ENABLED = false

/** A campanha está no ar agora? */
export function isLaunchOfferOpen(now: Date = new Date()): boolean {
  return LAUNCH_OFFER_ENABLED && now.getTime() <= LAUNCH_OFFER_ENDS_AT.getTime()
}

/** Preço da primeira mensalidade com o desconto aplicado. */
export function launchOfferPrice(monthlyPrice: number): number {
  return monthlyPrice * (1 - LAUNCH_OFFER_PERCENT_OFF / 100)
}

/** `199` → `"199"`, `99.5` → `"99,50"` — evita "R$ 99,5" e "R$ 199,00". */
export function formatBRL(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('pt-BR')
    : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "31 de agosto" — usado nas chamadas de urgência da UI. */
export function launchOfferDeadlineLabel(): string {
  return LAUNCH_OFFER_ENDS_AT.toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo',
  })
}

// ── Copy central ────────────────────────────────────────────────────────────
// Mensagem única em todos os pontos de contato: mudar aqui muda a landing e o
// /app/billing juntos.

export const LAUNCH_OFFER_HEADLINE = 'Oferta de lançamento'
export const LAUNCH_OFFER_PITCH =
  '50% de desconto na primeira mensalidade — assine, use de verdade e decida depois.'
export const LAUNCH_OFFER_BADGE = '50% no 1º mês'
export const LAUNCH_OFFER_FINE_PRINT =
  'Desconto aplicado automaticamente na primeira cobrança de novos assinantes, ' +
  'no plano mensal. A partir do segundo mês vale o preço normal. Cancele quando quiser.'
