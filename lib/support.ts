// ── Canais oficiais de contato/suporte do SPACENODE ───────────────────────────
//
// Fonte única de verdade para telefone/WhatsApp e e-mail de suporte.
// Toda superfície (landing, app, e-mails, docs) importa daqui — nunca
// hardcodar número ou e-mail em outro lugar.

export const SUPPORT_EMAIL = 'contato@spacenode.app'

// Identificação legal da empresa (Decreto 7.962/2013 exige nome empresarial e
// CNPJ visíveis em site de comércio eletrônico — exibidos nos rodapés).
export const LEGAL_NAME = 'SPACENODE TECNOLOGIA LTDA'
export const LEGAL_CNPJ = '68.031.117/0001-76'

// Número oficial de contato/suporte (atende por WhatsApp).
export const SUPPORT_PHONE_DISPLAY = '+55 51 98212-7288'
// A conta de WhatsApp é registrada no formato antigo, SEM o 9º dígito —
// o wa.me resolve os dois formatos, mas mantemos o ID exato da conta.
// Não "corrigir" acrescentando o 9 aqui sem testar o link no celular.
export const SUPPORT_PHONE_DIGITS  = '555182127288' // wa.me exige só dígitos, com DDI

export function supportWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${SUPPORT_PHONE_DIGITS}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export const SUPPORT_WHATSAPP_URL = supportWhatsAppUrl()
