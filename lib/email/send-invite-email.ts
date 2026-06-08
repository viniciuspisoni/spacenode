// Envio do email de convite via Resend (HTTP direto, sem SDK).
//
// Degrada com elegância: se RESEND_API_KEY não estiver setada, retorna
// { sent:false } e o fluxo segue no modo "link" (o convite continua válido e o
// link é mostrado pra envio manual). Por isso é seguro fazer deploy disto mesmo
// ANTES de configurar o provedor.
//
// Env vars:
//   RESEND_API_KEY  — chave da conta Resend (obrigatória pra enviar de verdade)
//   RESEND_FROM     — remetente verificado, ex: "Spacenode <equipe@seudominio.com>"
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

  const from = process.env.RESEND_FROM || 'Spacenode <onboarding@resend.dev>'
  const roleLabel = args.role === 'admin' ? 'administrador' : 'membro'
  const ws = escapeHtml(args.workspaceName)
  const url = escapeHtml(args.inviteUrl)

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:8px;">
    <h2 style="font-size:18px;color:#111;margin:0 0 12px;">Convite para ${ws}</h2>
    <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 20px;">
      Você foi convidado para participar do workspace <b>${ws}</b> no Spacenode como <b>${roleLabel}</b>.
    </p>
    <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">
      Aceitar convite
    </a>
    <p style="font-size:12px;color:#888;line-height:1.6;margin:20px 0 0;">
      Ou copie e cole este link no navegador:<br>
      <span style="color:#555;word-break:break-all;">${url}</span>
    </p>
  </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from,
        to:      [args.to],
        subject: `Convite para ${args.workspaceName} no Spacenode`,
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
