// ── Orion · autorização ──────────────────────────────────────────────────────
//
// Motor público desde 2026-09-11 (preço em nodes, ver lib/orion/config).
// Único gate: ORION_ENABLED — flag PRIVADA de servidor, desligada por padrão.
// Sem ela, Orion não existe pra ninguém, nem logado. Com ela ligada, qualquer
// usuário autenticado pode usar (saldo é checado depois, no débito — igual
// aos outros motores).
//
// Este gate roda na página E em toda entrada de API capaz de executar Orion —
// sempre ANTES de upload intermediário, débito ou qualquer chamada paga.

/** Flag privada do motor. Server-only: em client component isso é undefined,
 *  que é exatamente o comportamento desejado (Orion invisível). O nome da
 *  env manteve o histórico (ORION_INTERNAL_ENABLED) pra não exigir troca de
 *  variável nos ambientes já configurados — o que mudou foi que ela agora
 *  libera qualquer usuário, não só a equipe interna. */
export function orionInternalEnabled(): boolean {
  return process.env.ORION_INTERNAL_ENABLED === '1'
}

export async function canUseOrion(
  user: { id: string; email?: string | null } | null | undefined,
): Promise<boolean> {
  return orionInternalEnabled() && !!user?.id
}
