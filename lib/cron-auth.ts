// lib/cron-auth.ts
//
// Autenticação das rotas de cron (Vercel Cron Jobs). Não há sessão de usuário
// nesse contexto — a Vercel envia automaticamente o header
// `Authorization: Bearer $CRON_SECRET` quando a env var CRON_SECRET está
// configurada no projeto (https://vercel.com/docs/cron-jobs/manage-cron-jobs).
// Fail-closed: sem CRON_SECRET configurado, nenhuma chamada é autorizada —
// nunca roda com um segredo vazio/adivinhável. Comparação em tempo constante
// (mesmo padrão das rotas /api/internal/*).

import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const supplied = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
