import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { recordInvite } from '@/lib/referral/service'

// POST /api/referrals/invite — registra um compartilhamento do link/código.
//
// É o que alimenta o contador "convites enviados" do painel. Não envia email
// nem mensagem: o disparo é do próprio usuário, no app do celular ou no
// WhatsApp dele. Aqui só fica a intenção registrada, sem destinatário — nenhum
// contato de terceiro entra no banco.

export const dynamic = 'force-dynamic'

const CHANNELS = new Set(['copy_link', 'copy_code', 'share', 'whatsapp', 'email', 'other'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let channel = 'other'
  try {
    const body = (await req.json()) as { channel?: unknown }
    if (typeof body.channel === 'string' && CHANNELS.has(body.channel)) {
      channel = body.channel
    }
  } catch {
    // Corpo ausente/inválido cai no canal genérico — o contador é o que importa.
  }

  const admin = createAdminClient()
  // Teto generoso: copiar o link várias vezes é uso normal; o limite existe
  // só para o contador não virar um campo de digitação livre.
  const rl = await rateLimit(admin, `referral-invite:${user.id}`, 100, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas — aguarde um pouco' }, { status: 429 })
  }

  const ok = await recordInvite(admin, user.id, channel)
  return NextResponse.json({ ok })
}
