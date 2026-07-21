// ── Redação de dados sensíveis ────────────────────────────────────────────────
//
// Tudo que o Nodi grava (chamado, transcrição) ou devolve pro painel passa por
// aqui. A regra é a mesma do /api/history/detail: a redação acontece no
// SERVIDOR, nunca só na UI. Nunca deixamos passar: chaves de API, tokens/JWT,
// segredos em pares chave=valor, query strings de URL assinada e stack traces.
//
// Funções puras — cobertas por tests/nodi/redact.test.ts.

const SECRET_PATTERNS: RegExp[] = [
  // pares explícitos: api_key=…, token: …, authorization: bearer …
  /\b(api[_-]?key|apikey|secret|token|password|senha|authorization|bearer)\b\s*[=:]\s*[^\s,;"']+/gi,
  // formatos conhecidos de chave/token
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,          // estilo OpenAI/Stripe secret
  /\bAIza[0-9A-Za-z_-]{10,}\b/g,        // Google API key
  /\bkey-[A-Za-z0-9]{16,}\b/g,          // FAL key id
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, // JWT
]

const ENV_VAR_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g // FAL_KEY, SUPABASE_SERVICE_ROLE_KEY…
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Remove segredos/tokens de um texto, preservando o resto. */
export function stripSecrets(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[removido]')
  }
  return out
}

/** Corta a query string de URLs (onde vivem assinaturas X-Amz/token) e reduz ao host+path. */
export function stripUrlQueries(text: string): string {
  return text.replace(/https?:\/\/[^\s"')]+/gi, (url) => url.split(/[?#]/)[0])
}

/**
 * Sanitiza um texto de origem técnica (mensagem de erro, log) pra exibição ou
 * gravação: remove segredos, nomes de env vars, URLs assinadas e stack trace
 * (fica só a primeira linha), e limita o tamanho.
 */
export function sanitizeTechnicalText(text: string, maxLen = 240): string {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) ?? ''
  let out = stripUrlQueries(stripSecrets(firstLine))
  out = out.replace(ENV_VAR_PATTERN, '[env]')
  out = out.replace(/\s+/g, ' ').trim()
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…'
  return out
}

/**
 * Sanitiza texto digitado pelo usuário (descrição, passos tentados): mantém o
 * conteúdo, mas remove segredos colados por engano, caracteres de controle e
 * limita o tamanho. Não mexe em URLs comuns — podem ser parte do relato.
 */
export function sanitizeUserText(text: string, maxLen = 2000): string {
  let out = stripSecrets(text)
  out = out.replace(CONTROL_CHARS, '')
  out = out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…'
  return out
}

/** Clamp simples de string com reticências. */
export function clampText(text: string, maxLen: number): string {
  const t = text.trim()
  return t.length > maxLen ? t.slice(0, maxLen - 1).trimEnd() + '…' : t
}
