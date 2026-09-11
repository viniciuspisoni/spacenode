// Carrega o .env.local nos testes que falam com fornecedor de verdade.
//
// O vitest não lê .env sozinho, e a alternativa — passar a chave inline no
// comando (`OPENAI_API_KEY=sk-... npx vitest`) — deixa o segredo no histórico
// do shell e em qualquer log de sessão. Convenção do repo: chave fica no
// .env.local e não passa por linha de comando (mesma regra do
// scripts/stripe-live-setup.mjs).
//
// Não é um .test.ts, então o vitest não o coleta como suíte.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Preenche process.env a partir do .env.local SEM sobrescrever o que já veio
 *  do ambiente — quem passa a env no comando continua mandando. */
export function loadEnvLocal(cwd: string = process.cwd()): void {
  const path = join(cwd, '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
