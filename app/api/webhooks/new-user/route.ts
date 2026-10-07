// POST /api/webhooks/new-user — recebe o Database Webhook do Supabase em
// INSERT em auth.users e dispara o email de boas-vindas.
//
// CONFIGURAÇÃO (Supabase Dashboard, fora deste repo — não há segredo em SQL
// versionado, mesmo padrão do agendamento do expire-lumens):
//   Database → Webhooks → Create a new hook
//     Table:       auth.users
//     Events:      Insert
//     Type:        HTTP Request
//     Method:      POST
//     URL:         https://<domínio-de-produção>/api/webhooks/new-user
//     HTTP Headers: x-webhook-secret: <mesmo valor de NEW_USER_WEBHOOK_SECRET>
//
// Sem o header correto a requisição é rejeitada — sem isso qualquer um
// poderia bater aqui e fazer o Resend mandar email pra endereço arbitrário.
//
// Env vars:
//   NEW_USER_WEBHOOK_SECRET — segredo compartilhado com o webhook do Supabase
//   RESEND_API_KEY / RESEND_FROM / NEXT_PUBLIC_APP_URL — ver send-welcome-email.ts

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email'

export const dynamic = 'force-dynamic'

interface AuthUsersInsertPayload {
  type:   string
  table:  string
  schema: string
  record: {
    email?: string
    raw_user_meta_data?: { full_name?: string } | null
  }
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.NEW_USER_WEBHOOK_SECRET
  if (!expected) return false // sem segredo configurado, o endpoint fica fechado por padrão

  const provided = req.headers.get('x-webhook-secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const payload = await req.json().catch(() => null) as AuthUsersInsertPayload | null
  if (!payload || payload.schema !== 'auth' || payload.table !== 'users' || payload.type !== 'INSERT') {
    // Evento que não interessa a este endpoint — confirma o recebimento sem agir.
    return NextResponse.json({ received: true })
  }

  const email = payload.record.email
  if (!email) {
    return NextResponse.json({ received: true })
  }

  const name = payload.record.raw_user_meta_data?.full_name ?? null
  const result = await sendWelcomeEmail({ to: email, name })
  if (!result.sent) {
    console.warn('[webhooks/new-user] email de boas-vindas não enviado:', result.reason)
  }

  return NextResponse.json({ received: true, emailed: result.sent })
}
