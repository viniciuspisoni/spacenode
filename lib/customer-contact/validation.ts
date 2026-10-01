export const CONTACT_NOTICE_VERSION = '2026-09-30-v1'

export type ContactPreferences = {
  whatsapp_e164: string | null
  support_opt_in: boolean
  marketing_opt_in: boolean
  signup_exempt: boolean
}

export const CONTACT_COPY = {
  support: 'Quero receber ajuda para começar e acompanhamento de uso pelo WhatsApp.',
  marketing: 'Quero receber novidades e ofertas da SpaceNode pelo WhatsApp.',
}

/** Checks syntax only. Ownership and WhatsApp availability need provider verification. */
export function normalizeWhatsApp(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40 || !/^[+\d\s().-]+$/.test(raw)) return null
  const value = raw.trim()
  if ((value.match(/\+/g) ?? []).length > 1 || (value.includes('+') && !value.startsWith('+'))) return null
  const digits = value.replace(/\D/g, '')
  // Brazilian local format, with DDD, or international format with explicit +.
  const phone = value.startsWith('+') ? `+${digits}` :
    digits.length === 11 ? `+55${digits}` : digits.length === 13 && digits.startsWith('55') ? `+${digits}` : null
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return null
  if (phone.startsWith('+55') && !/^\+55[1-9]\d9\d{8}$/.test(phone)) return null
  if (/^(\d)\1+$/.test(digits)) return null
  return phone
}

export function parseContactInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const keys = ['whatsapp', 'support_opt_in', 'marketing_opt_in', 'notice_version']
  if (Object.keys(input).some(key => !keys.includes(key))) return null
  const phone = normalizeWhatsApp(input.whatsapp)
  if (!phone || typeof input.support_opt_in !== 'boolean' || typeof input.marketing_opt_in !== 'boolean' || input.notice_version !== CONTACT_NOTICE_VERSION) return null
  return { whatsapp_e164: phone, support_opt_in: input.support_opt_in,
    marketing_opt_in: input.marketing_opt_in, notice_version: CONTACT_NOTICE_VERSION }
}

export function needsContactCapture(contact: ContactPreferences | null): boolean {
  return !contact?.signup_exempt && !contact?.whatsapp_e164
}
