// Envio do email de convite via Resend (HTTP direto, sem SDK).
//
// Degrada com elegância: se RESEND_API_KEY não estiver setada, retorna
// { sent:false } e o fluxo segue no modo "link" (o convite continua válido e o
// link é mostrado pra envio manual). Por isso é seguro fazer deploy disto mesmo
// ANTES de configurar o provedor.
//
// Env vars:
//   RESEND_API_KEY  — chave da conta Resend (obrigatória pra enviar de verdade)
//   RESEND_FROM     — remetente verificado, ex: "SpaceNode <equipe@seudominio.com>"
//                     Sem domínio verificado, o padrão "onboarding@resend.dev" só
//                     entrega para o email DONO da conta Resend (modo de teste).

interface SendInviteArgs {
  to:            string
  inviteUrl:     string
  workspaceName: string
  role:          'admin' | 'member'
}

export async function sendInviteEmail(args: SendInviteArgs): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, reason: 'no_api_key' }

  const from = process.env.RESEND_FROM || 'SpaceNode <onboarding@resend.dev>'
  const roleLabel = args.role === 'admin' ? 'administrador' : 'membro'
  const ws = escapeHtml(args.workspaceName)
  const url = escapeHtml(args.inviteUrl)

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f7f7f5;">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e8e9e7;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#151618;padding:22px 28px;">
              <img src="https://spacenode.app/brand/spacenode-logo-horizontal.png" width="176" height="32" alt="SpaceNode" style="display:block;border:0;max-width:100%;height:auto;">
            </td>
          </tr>
          <tr>
            <td style="padding:34px 28px 28px;">
              <h1 style="margin:0 0 12px;font-size:21px;font-weight:500;color:#151618;letter-spacing:-0.02em;">Convite para ${ws}</h1>
              <p style="margin:0 0 26px;font-size:14px;line-height:1.65;color:#60646b;">
                Você foi convidado para participar do espaço <b style="color:#151618;">${ws}</b> na SpaceNode como <b style="color:#151618;">${roleLabel}</b>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:9px;background:#151618;">
                    <a href="${url}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:9px;">Aceitar convite</a>
                  </td>
                </tr>
              </table>
              <p style="margin:26px 0 0;font-size:12px;line-height:1.65;color:#a1a1aa;">
                Só o email convidado consegue aceitar. Problemas com o botão? Copie e cole:<br>
                <span style="color:#71717a;word-break:break-all;">${url}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #e8e9e7;background:#f7f7f5;">
              <span style="font-size:11px;color:#60646b;">SpaceNode · Visualize seus projetos.</span>
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
        subject: `Convite para ${args.workspaceName} na SpaceNode`,
        html,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[sendInviteEmail] Resend', res.status, text)
      return { sent: false, reason: `resend_${res.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error('[sendInviteEmail]', e)
    return { sent: false, reason: 'exception' }
  }
}

// Escapa o nome do workspace (controlado pelo usuário) antes de injetar no HTML.
function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return s.replace(/[&<>"']/g, (c) => map[c])
}
