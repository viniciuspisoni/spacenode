import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isInternalStaff } from '@/lib/auth/privileged'
import { engineDisplayLabel } from '@/lib/history/generation-detail'
import { videoEngineLabel, upscaleProviderLabel } from '@/lib/renderLabels'
import { signRow } from '@/lib/storage/signed'

// Todas as colunas de URL de imagem possíveis nas 3 tabelas (render/edit/vista).
// signRow ignora as ausentes/null, então a mesma lista serve pros 3 kinds.
const URL_FIELDS = [
  'output_url', 'input_url', 'source_image_url', 'result_image_url',
  'mask_url', 'image_url', 'source_sketch_url', 'edit_mask_url',
] as const

// ── Detalhes da geração (Histórico) ────────────────────────────────────────────
//
// Retorna a linha da geração + autoria + contexto (workspace, pasta, space)
// para o painel "Detalhes da geração". Usa o admin client porque, em equipes,
// um membro pode abrir gerações de outro membro do MESMO workspace — situação
// que a RLS por user_id bloquearia. A autorização é feita aqui, explicitamente:
// dono da linha OU membro ativo do workspace da linha.
//
// Exposição em dois níveis (decisão de produto):
//   - usuário comum   → linha REDIGIDA no servidor: sem log bruto, sem
//     fal_request_id, sem endpoint de provider, sem prompt final proprietário,
//     sem uuids internos (user_id/workspace_id). O que sobra alimenta as labels
//     amigáveis do painel.
//   - admin/suporte   → linha completa (bloco "Diagnóstico técnico" na UI).
//     Ver lib/auth/privileged.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TABLE: Record<string, string> = {
  render: 'renders',
  edit:   'edits',
  vista:  'vistas',
}

// Remove da linha tudo que é interno da plataforma. Mantém o suficiente para o
// painel montar labels de produto (config_snapshot, upscale_meta sem steps,
// engine/quality/axis etc.).
function redactRowForUser(kind: string, row: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...row }

  delete r.generation_log
  delete r.fal_request_id
  delete r.user_id
  delete r.workspace_id
  // Mensagem crua de erro pode carregar endpoint/SDK/fragmentos internos; o
  // painel usa só o status. Admin vê no Diagnóstico técnico (linha completa).
  delete r.error_message

  if (kind === 'render') {
    // prompt = prompt final proprietário (buildFidelityPrompt); user_prompt é
    // o texto do usuário e permanece.
    delete r.prompt
    const um = r.upscale_meta as Record<string, unknown> | null | undefined
    if (um && typeof um === 'object') {
      // steps[] carrega requestId/provider por etapa — diagnóstico interno.
      const rest = { ...um }
      delete rest.steps
      r.upscale_meta = rest
    }
    // style de vídeo e de upscale legado carregam endpoint do provider; model
    // legado carrega o modelo. Traduz para label de produto — os helpers de
    // exibição aceitam a label no lugar do valor cru.
    const style = typeof r.style === 'string' ? r.style : null
    if (r.ambient === 'video' && style) {
      r.style = videoEngineLabel(style) ?? 'Vídeo'
    } else if (r.ambient === 'upscale' && style && !style.startsWith('upscale:')) {
      r.style = upscaleProviderLabel(style) ?? 'Alta definição'
    }
    if (typeof r.model === 'string') r.model = engineDisplayLabel(r.model)
  }

  if (kind === 'vista') {
    delete r.prompt                    // prompt final proprietário
    delete r.model                     // endpoint do provider
    delete r.provider
    delete r.preservation_check        // JSON interno do quality gate
    delete r.dna_verification_details  // JSON interno do verifyDna
    delete r.source_hash               // hash interno de provenance
  }

  if (kind === 'edit') {
    // edits.prompt é a instrução escrita pelo USUÁRIO — permanece.
    // engine guarda o endpoint do provider: entrega só a label de produto.
    r.engine = engineDisplayLabel(typeof r.engine === 'string' ? r.engine : null)
    // Campos de diagnóstico interno presentes nas linhas vindas de
    // edit_v3_jobs — no-ops para as `edits` legadas, que não têm essas chaves.
    delete r.provider
    delete r.model
    delete r.request_id
    delete r.out_of_mask_delta
    delete r.in_mask_delta
    delete r.action_type
    delete r.quality_mode
    delete r.preservation_mode
    delete r.intensity_mode
    delete r.instruction
    delete r.charged
  }

  return r
}

// Linha de edit_v3_jobs → shape das `edits` legadas, que é o contrato do
// painel (normalizeEdit em lib/history/generation-detail.ts). Campos crus de
// provider seguem na linha p/ admin (Diagnóstico técnico); a redação acima os
// remove para usuário comum.
function v3JobAsEditRow(j: Record<string, unknown>): Record<string, unknown> {
  return {
    id: j.id,
    user_id: j.user_id,
    status: j.status,
    source_image_url: j.source_image_url,
    result_image_url: j.result_image_url,
    mask_url: j.mask_url,
    prompt: (j.instruction ?? j.prompt) ?? null,
    quality: j.quality_mode ?? null,
    nodes_cost: j.nodes_cost ?? null,
    engine: j.model ?? null,
    source_type: null,
    source_id: null,
    mask_coverage: j.mask_coverage ?? null,
    reference_count: j.reference_count ?? null,
    created_at: j.created_at,
    completed_at: j.completed_at ?? null,
    // Diagnóstico (só sobrevive para admin — ver redactRowForUser):
    provider: j.provider ?? null,
    model: j.model ?? null,
    request_id: j.request_id ?? null,
    action_type: j.action_type ?? null,
    quality_mode: j.quality_mode ?? null,
    preservation_mode: j.preservation_mode ?? null,
    intensity_mode: j.intensity_mode ?? null,
    out_of_mask_delta: j.out_of_mask_delta ?? null,
    in_mask_delta: j.in_mask_delta ?? null,
    charged: j.charged ?? null,
    error_message: j.error_message ?? null,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const kind = req.nextUrl.searchParams.get('kind') ?? ''
  const id   = req.nextUrl.searchParams.get('id') ?? ''

  const table = TABLE[kind]
  if (!table || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  let { data: row, error } = await admin.from(table).select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[history/detail] erro ao buscar geração:', error)
    return NextResponse.json({ error: 'Erro ao carregar detalhes' }, { status: 500 })
  }
  // Fallback: edições do Editar V3 vivem em edit_v3_jobs, não em `edits`.
  // Mesmo id pesquisado nas duas — uuids não colidem entre tabelas.
  if (!row && kind === 'edit') {
    const { data: j } = await admin.from('edit_v3_jobs').select('*').eq('id', id).maybeSingle()
    if (j) row = v3JobAsEditRow(j as Record<string, unknown>) as typeof row
  }
  if (!row) return NextResponse.json({ error: 'Geração não encontrada' }, { status: 404 })

  // ── Autorização: dono OU colega de workspace ─────────────────────────────────
  const isOwner = row.user_id === user.id
  if (!isOwner) {
    const workspaceId = (row as { workspace_id?: string | null }).workspace_id
    if (!workspaceId) {
      return NextResponse.json({ error: 'Geração não encontrada' }, { status: 404 })
    }
    const { data: membership } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Geração não encontrada' }, { status: 404 })
    }
  }

  // ── Contexto: autoria, workspace, pasta (renders) e space (vistas) ───────────
  const workspaceId = (row as { workspace_id?: string | null }).workspace_id ?? null
  const folderId    = kind === 'render' ? ((row as { folder_id?: string | null }).folder_id ?? null) : null
  const spaceId     = kind === 'vista'  ? ((row as { space_id?: string | null }).space_id ?? null)  : null

  const [privileged, authorRes, workspaceRes, folderRes, spaceRes] = await Promise.all([
    isInternalStaff(admin, user),
    row.user_id
      ? admin.from('profiles').select('id, full_name, email').eq('id', row.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    workspaceId
      ? admin.from('workspaces').select('id, name, type').eq('id', workspaceId).maybeSingle()
      : Promise.resolve({ data: null }),
    folderId
      ? admin.from('render_folders').select('id, name').eq('id', folderId).maybeSingle()
      : Promise.resolve({ data: null }),
    spaceId
      ? admin.from('spaces').select('id, name, dna').eq('id', spaceId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const authorRow    = authorRes.data as { id: string; full_name: string | null; email: string | null } | null
  const workspaceRow = workspaceRes.data as { id: string; name: string; type: string } | null
  const folderRow    = folderRes.data as { id: string; name: string } | null
  const spaceRow     = spaceRes.data  as { id: string; name: string; dna: unknown } | null

  // Assina as URLs de imagem da linha (após a redação). FAL passa direto;
  // Supabase-hosted vira signed URL. Cobre render/edit/vista com a mesma lista.
  const displayRow = privileged ? row : redactRowForUser(kind, row as Record<string, unknown>)
  const signedRow  = await signRow(admin, displayRow as Record<string, unknown>, URL_FIELDS)

  // Objetos de contexto SEM uuids internos: a UI usa apenas nome/email/labels
  // (author.id reintroduziria o user_id que a redação acabou de remover).
  return NextResponse.json({
    kind,
    viewer: { privileged },
    row: signedRow,
    author: authorRow
      ? { name: authorRow.full_name, email: authorRow.email }
      : null,
    workspace: workspaceRow ? { name: workspaceRow.name, type: workspaceRow.type } : null,
    folder: folderRow ? { name: folderRow.name } : null,
    space: spaceRow ? { name: spaceRow.name, hasDna: spaceRow.dna != null } : null,
  })
}
