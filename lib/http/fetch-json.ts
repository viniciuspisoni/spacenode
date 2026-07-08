// lib/http/fetch-json.ts
//
// Parse defensivo de respostas fetch no cliente. Respostas de infraestrutura
// (413/502/504 da Vercel etc.) vêm em texto puro — um res.json() cru vaza
// "Unexpected token…" pro usuário como mensagem de erro.

export async function jsonOrNull(res: Response): Promise<Record<string, unknown> | null> {
  try { return await res.json() } catch { return null }
}

/** Mensagem de erro do payload da API, com fallback amigável. */
export function errMsg(data: Record<string, unknown> | null, fallback: string): string {
  return typeof data?.error === 'string' ? data.error : fallback
}
