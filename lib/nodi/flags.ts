// ── Feature flag do Nodi ──────────────────────────────────────────────────────
//
// Lida no SERVIDOR (app/app/layout.tsx decide se monta o assistente) — sem
// NEXT_PUBLIC de propósito: NEXT_PUBLIC_* inlina no bundle em build (o mesmo
// gotcha do SPACES_PRESERVE_V2, que exigiu commit vazio pra rebuild); env de
// servidor liga/desliga por ambiente com um redeploy simples, sem tocar bundle.
//
// Ativação gradual: começa desligado. Ligar = NODI_ENABLED=1 no ambiente
// (.env.local em dev; Vercel em prod — lembrar da paridade de env + redeploy).

export function isNodiEnabled(): boolean {
  return process.env.NODI_ENABLED === '1'
}
