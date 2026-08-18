// Envio do email de boas-vindas via Resend (HTTP direto, sem SDK) — mesmo
// padrão de lib/email/send-invite-email.ts.
//
// Degrada com elegância: se RESEND_API_KEY não estiver setada, retorna
// { sent:false } sem lançar — o cadastro do usuário nunca falha por causa
// deste email.
//
// Env vars (reaproveitadas do convite):
//   RESEND_API_KEY     — chave da conta Resend (obrigatória pra enviar de verdade)
//   RESEND_FROM        — remetente verificado, ex: "Spacenode <equipe@seudominio.com>"
//   NEXT_PUBLIC_APP_URL — origem usada no botão de CTA (ex: https://spacenode.app)

interface SendWelcomeArgs {
  to:   string
  name: string | null
}

export async function sendWelcomeEmail(args: SendWelcomeArgs): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'no_api_key' }

  const from      = process.env.RESEND_FROM || 'Spacenode <onboarding@resend.dev>'
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'https://spacenode.app'
  const loginUrl  = `${appUrl}/login`
  const firstName = escapeHtml((args.name ?? '').trim().split(' ')[0] || '')
  const greeting  = firstName ? `Bem-vindo(a), ${firstName}!` : 'Bem-vindo(a) ao Spacenode!'

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e7e7ea;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#0a0a0a;padding:22px 28px;">
              <span style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.02em;">spacenode</span><span style="display:inline-block;width:5px;height:5px;border-radius:1px;background:#30b46c;margin-left:3px;vertical-align:baseline;"></span>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 28px 28px;">
              <h1 style="margin:0 0 12px;font-size:21px;font-weight:600;color:#111111;letter-spacing:-0.02em;">${greeting}</h1>
              <p style="margin:0 0 26px;font-size:14px;line-height:1.65;color:#52525b;">
                Sua conta no Spacenode está pronta, com <b style="color:#111111;">80 nodes grátis</b> para você gerar seus primeiros renders. É só entrar e subir uma imagem do seu projeto.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:9px;background:#30b46c;">
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#06140d;text-decoration:none;border-radius:9px;">Acessar a plataforma</a>
                  </td>
                </tr>
              </table>
              <p style="margin:26px 0 0;font-size:12px;line-height:1.65;color:#a1a1aa;">
                Problemas com o botão? Copie e cole:<br>
                <span style="color:#71717a;word-break:break-all;">${loginUrl}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #e7e7ea;background:#fafafa;">
              <span style="font-size:11px;color:#a1a1aa;">Spacenode · O hub criativo para arquitetos e designers de interiores</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from,
        to:      [args.to],
        subject: 'Bem-vindo(a) ao Spacenode — sua conta está pronta',
        html,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[sendWelcomeEmail] Resend', res.status, text)
      return { sent: false, reason: `resend_${res.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error('[sendWelcomeEmail]', e)
    return { sent: false, reason: 'exception' }
  }
}

// Escapa o nome do usuário (controlado pelo usuário) antes de injetar no HTML.
function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return s.replace(/[&<>"']/g, (c) => map[c])
}
