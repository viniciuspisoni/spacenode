// CAPTCHA (Cloudflare Turnstile) dos formulários de senha — cadastro, login e
// "esqueci a senha". Achado R1 da auditoria 2026-11-25: cada cadastro ganha
// 80 nodes, e sem CAPTCHA dá para criar contas em série.
//
// Quem valida o token é o Supabase Auth (Settings → Authentication → Bot and
// Abuse Protection, com a Secret Key do widget). Enquanto essa proteção estiver
// desligada, o token enviado é ignorado — por isso o formulário NUNCA bloqueia
// o envio por falta de token: se o Turnstile não carregar (rede, bloqueador),
// o login segue funcionando até a proteção ser ligada. Ligada, o Supabase
// recusa com `captcha_failed` e a tela pede para refazer a verificação.
//
// Fora do escopo do CAPTCHA no Supabase (não precisam de token): login com
// Google (grant id_token / PKCE), links de e-mail (verifyOtp) e o pareamento
// dos plugins (generateLink com service role).
//
// A Site Key é pública (vai no HTML de qualquer jeito). A env permite trocar
// pela chave de teste do Cloudflare em dev — `1x00000000000000000000AA`
// sempre passa — já que o widget de produção só aceita spacenode.app.

export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAGS177XUpoaeFb-v'

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Quanto o envio do formulário espera por um token ainda em andamento. */
export const TURNSTILE_WAIT_MS = 8_000

export const CAPTCHA_FAILED_MESSAGE =
  'Não conseguimos concluir a verificação de segurança. Aguarde alguns segundos e tente de novo — se continuar, recarregue a página.'

/** O erro do Supabase Auth é de CAPTCHA recusado/ausente? */
export function isCaptchaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === 'captcha_failed') return true
  return typeof message === 'string' && /captcha/i.test(message)
}
