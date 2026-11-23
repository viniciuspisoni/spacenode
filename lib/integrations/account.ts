// Sessão e reconciliação de render dos plugins — o mesmo para SketchUp,
// Archicad e Revit (o Bearer é a sessão Supabase do próprio usuário; nada aqui
// depende da plataforma). Usado por /api/sketchup/* e /api/integrations/*.

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayerBalance } from '@/lib/workspaces/balance'
import { signRow } from '@/lib/storage/signed'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── GET /session ─────────────────────────────────────────────────────────────
export async function handleSession(req: NextRequest) {
  const { user, source } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [balance, theme] = await Promise.all([
    getPayerBalance(admin, user.id),
    readThemePreference(admin, user.id),
  ])

  return NextResponse.json({
    ok: true,
    auth: source,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    balance,
    // Preferência de tema da conta (a mesma do app web). O plugin usa como
    // segundo degrau do "Automático": escolha local → conta → SO → escuro.
    theme,
  })
}

type ThemePreference = 'system' | 'light' | 'dark'

async function readThemePreference(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<ThemePreference | null> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('theme_preference')
      .eq('id', userId)
      .maybeSingle()
    const v = data?.theme_preference
    return v === 'light' || v === 'dark' || v === 'system' ? v : null
  } catch {
    // Coluna ausente ou perfil sem linha: o plugin cai pro SO — nunca falha
    // a sessão por causa de tema.
    return null
  }
}

// ── GET /render?id={renderId} ────────────────────────────────────────────────
//
// Reconciliação: o /api/generate debita Nodes ANTES do provider e um
// timeout/queda de rede do cliente não desfaz o trabalho — o servidor
// termina, cobra e grava o render, mas o plugin perde a resposta. Esta rota
// deixa o plugin recuperar o resultado pago pelo renderId que ele guardou (ou
// reconferir o último render ao reabrir o painel).
//
// Mesma redação do histórico: projeção explícita (o generation_log é lido só
// pra derivar seed, score e avisos — provider/prompt nunca saem), sem
// fal_request_id; URLs assinadas.
export async function handleRender(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('renders')
    .select('id, user_id, status, input_url, output_url, preview_url, nodes_charged, engine, resolution, created_at, generation_log')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[plugin/render] erro ao buscar render:', error)
    return NextResponse.json({ error: 'Erro ao carregar render' }, { status: 500 })
  }
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: 'Render não encontrado' }, { status: 404 })
  }

  const signed = await signRow(admin, row as Record<string, unknown>, ['input_url', 'output_url', 'preview_url'])

  // 1.9.0: um lote cuja 1ª cena caiu em timeout perdia a semente compartilhada
  // e o aviso de fidelidade; o plugin agora recupera os dois daqui.
  const log = (row.generation_log && typeof row.generation_log === 'object' ? row.generation_log : null) as Record<string, unknown> | null
  const fid = log && log.fidelity && typeof log.fidelity === 'object' ? (log.fidelity as Record<string, unknown>) : null
  const finalScore = typeof fid?.final_score === 'number' ? fid.final_score : null
  const minScore = typeof fid?.min_score === 'number' ? fid.min_score : null
  const audit = fid && fid.semantic_audit && typeof fid.semantic_audit === 'object' ? (fid.semantic_audit as Record<string, unknown>) : null

  return NextResponse.json({
    id: row.id,
    status: row.status,
    inputUrl: signed.input_url ?? null,
    outputUrl: signed.output_url ?? null,
    previewUrl: signed.preview_url ?? null,
    nodesCharged: row.nodes_charged ?? null,
    createdAt: row.created_at,
    engine: row.engine ?? null,
    resolution: row.resolution ?? null,
    seed: typeof log?.seed === 'number' ? log.seed : null,
    fidelityScore: finalScore,
    fidelityWarning: finalScore !== null && minScore !== null && finalScore < minScore,
    semanticWarning: audit?.warning === true,
  })
}
