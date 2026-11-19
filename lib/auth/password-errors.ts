// Mensagem em português para senha recusada pelo Supabase Auth.
//
// Com a proteção contra senhas vazadas ligada (HaveIBeenPwned, painel do
// Supabase → Auth), cadastro e troca de senha passam a receber
// AuthWeakPasswordError (code `weak_password`) com os motivos em `reasons`.
// Sem este tratamento a tela mostrava "Algo deu errado. Tente novamente." e a
// pessoa repetia a mesma senha. Login não passa por aqui: senha fraca de conta
// existente continua entrando (o Supabase só avisa em data.weakPassword).

import { isAuthWeakPasswordError } from '@supabase/supabase-js'

export const LEAKED_PASSWORD_MESSAGE =
  'Essa senha já apareceu em vazamentos de dados. Escolha outra, de preferência uma que você não use em outros sites.'

function weakPasswordReasons(error: unknown): string[] | null {
  if (isAuthWeakPasswordError(error)) return error.reasons
  if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'weak_password') {
    const reasons = (error as { reasons?: unknown }).reasons
    return Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === 'string') : []
  }
  return null
}

/** Mensagem para o usuário se o erro for de senha fraca/vazada; null caso
 *  contrário (quem chama segue com a própria tradução de erro). */
export function weakPasswordMessage(error: unknown): string | null {
  const reasons = weakPasswordReasons(error)
  if (reasons === null) return null
  if (reasons.includes('pwned'))      return LEAKED_PASSWORD_MESSAGE
  if (reasons.includes('length'))     return 'A senha deve ter pelo menos 6 caracteres.'
  if (reasons.includes('characters')) return 'Use uma senha que misture letras, números e símbolos.'
  return 'Essa senha é fraca. Escolha outra.'
}
