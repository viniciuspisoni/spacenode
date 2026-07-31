// Código de indicação — forma e normalização.
//
// Isomorfo (servidor e cliente): a rota /convite/[code], a captura no browser
// e a rota de vínculo usam a MESMA normalização, senão um código digitado em
// minúsculas vira "código não encontrado" só em um dos caminhos.

/** Sem 0/O/1/I: o código precisa sobreviver a ser ditado por telefone. */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const REFERRAL_CODE_LENGTH = 8

const CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/

/**
 * Aceita o que o usuário colar (minúsculas, espaços, hífens de formatação) e
 * devolve o código canônico — ou null se não for um código plausível.
 * Não consulta o banco: é validação de forma, não de existência.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, '')
  return CODE_RE.test(cleaned) ? cleaned : null
}

export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_RE.test(value)
}

/** Link individual de convite. Base sem barra final. */
export function referralLink(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/convite/${code}`
}

/** Texto pronto para compartilhar — sobrio, sem linguagem de promoção. */
export function referralShareMessage(link: string): string {
  return (
    'Uso o SpaceNode para render e apresentação de projeto. ' +
    `Pelo meu convite você começa com 10% de desconto na primeira mensalidade: ${link}`
  )
}
