// /api/estudar/[id]
//
// GET   — estudo + alternativas do dono, com redação de produto: prompt
//         estruturado, provider, modelo e request_id NUNCA saem pro client
//         comum (mesma disciplina de lib/history/redact.ts). URLs assinadas na
//         emissão (inerte enquanto STORAGE_PRIVATE≠1).
// PATCH — { escolhida?, folderId?, saveToHistory? }:
//         escolhida     seleciona a proposta (essencial/equilibrada/completa);
//         folderId      vincula/desvincula o estudo a um projeto (pasta do
//                       Histórico, render_folders) — null desvincula;
//         saveToHistory grava/atualiza a proposta escolhida em `renders`
//                       (ambient 'estudo') — é o que faz o estudo aparecer no
//                       Histórico e nas pastas do projeto.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signRow, signRows } from '@/lib/storage/signed'
import { fetchStorageBuffer } from '@/lib/storage/fetch'
import { createDisplayPreview } from '@/lib/storage/preview'
import { ESTUDO_TIPO_LABELS, ESTUDO_VARIANTE_LABELS, isEstudoTipo, isEstudoVariante } from '@/lib/estudar/types'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface EstudoRow {
  id: string
  user_id: string
  source_type: string
  status: string
  source_image_url: string
  source_width: number | null
  source_height: number | null
  preserve_mask_url: string | null
  medida: Record<string, unknown> | null
  briefing: Record<string, unknown> | null
  escolhida: string | null
  folder_id: string | null
  saved_render_id: string | null
  nodes_cost: number
  refunded_nodes: number
  created_at: string
  completed_at: string | null
}

const ESTUDO_COLUMNS =
  'id, user_id, source_type, status, source_image_url, source_width, source_height, ' +
  'preserve_mask_url, medida, briefing, escolhida, folder_id, saved_render_id, ' +
  'nodes_cost, refunded_nodes, created_at, completed_at'

interface AltRow {
  id: string
  variante: string
  kind: string
  parent_id: string | null
  status: string
  refine_instruction: string | null
  refine_mask_url: string | null
  image_url: string | null
  image_width: number | null
  image_height: number | null
  error_message: string | null
  created_at: string
  [key: string]: unknown
}

// Projeção explícita — NUNCA select('*'): prompt/provider/model/request_id
// ficam fora do fio pro usuário comum (disciplina de lib/history/redact.ts).
const ALT_COLUMNS =
  'id, variante, kind, parent_id, status, refine_instruction, refine_mask_url, ' +
  'image_url, image_width, image_height, error_message, created_at'

async function loadEstudo(id: string, userId: string): Promise<EstudoRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('estudos')
    .select(ESTUDO_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<EstudoRow>()
  return data ?? null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Estudo inválido' }, { status: 400 })

  const estudo = await loadEstudo(id, user.id)
  if (!estudo) return NextResponse.json({ error: 'Estudo não encontrado' }, { status: 404 })

  const admin = createAdminClient()
  const { data: alts } = await admin
    .from('estudo_alternativas')
    .select(ALT_COLUMNS)
    .eq('estudo_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .returns<AltRow[]>()

  const signedEstudo = await signRow(admin, estudo as unknown as Record<string, unknown>, [
    'source_image_url',
    'preserve_mask_url',
  ])
  const signedAlts = await signRows(admin, (alts ?? []) as unknown as Record<string, unknown>[], [
    'image_url',
    'refine_mask_url',
  ])

  return NextResponse.json({ estudo: signedEstudo, alternativas: signedAlts })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Estudo inválido' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const escolhida = body?.escolhida
  const folderIdRaw = body?.folderId
  const saveToHistory = body?.saveToHistory === true

  if (escolhida !== undefined && !isEstudoVariante(escolhida)) {
    return NextResponse.json({ error: 'Proposta inválida' }, { status: 400 })
  }
  const hasFolderPatch = folderIdRaw !== undefined
  if (hasFolderPatch && folderIdRaw !== null && !(typeof folderIdRaw === 'string' && UUID_RE.test(folderIdRaw))) {
    return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
  }
  const folderId = hasFolderPatch ? (folderIdRaw as string | null) : undefined

  const estudo = await loadEstudo(id, user.id)
  if (!estudo) return NextResponse.json({ error: 'Estudo não encontrado' }, { status: 404 })

  const admin = createAdminClient()

  // Posse da pasta (RLS não protege o service-role — filtro explícito).
  if (typeof folderId === 'string') {
    const { data: folder } = await admin
      .from('render_folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string }>()
    if (!folder) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}
  if (escolhida !== undefined) patch.escolhida = escolhida
  if (folderId !== undefined) patch.folder_id = folderId

  let savedRenderId = estudo.saved_render_id

  if (saveToHistory) {
    const variante = (escolhida ?? estudo.escolhida) as string | null
    if (!variante || !isEstudoVariante(variante)) {
      return NextResponse.json({ error: 'Escolha uma proposta antes de salvar' }, { status: 400 })
    }
    // Versão mais recente concluída da proposta escolhida (refino > inicial).
    const { data: latest } = await admin
      .from('estudo_alternativas')
      .select('image_url')
      .eq('estudo_id', id)
      .eq('user_id', user.id)
      .eq('variante', variante)
      .eq('status', 'completed')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ image_url: string }>()
    if (!latest?.image_url) {
      return NextResponse.json({ error: 'A proposta escolhida não tem imagem' }, { status: 409 })
    }

    const tipoRaw = (estudo.briefing?.estudoTipo ?? '') as string
    const tipoLabel = isEstudoTipo(tipoRaw) ? ESTUDO_TIPO_LABELS[tipoRaw] : 'Estudo'
    const targetFolder = folderId !== undefined ? folderId : estudo.folder_id

    if (savedRenderId) {
      await admin
        .from('renders')
        .update({
          output_url: latest.image_url,
          prompt: `estudo ${tipoLabel.toLowerCase()} · ${ESTUDO_VARIANTE_LABELS[variante]}`,
          folder_id: targetFolder,
        } as never)
        .eq('id', savedRenderId)
        .eq('user_id', user.id)
    } else {
      // Preview de exibição pra grid do Histórico — best-effort.
      let previewUrl: string | null = null
      try {
        const buf = await fetchStorageBuffer(latest.image_url)
        previewUrl = await createDisplayPreview(admin, user.id, 'estudar/preview', buf)
      } catch {
        previewUrl = null
      }
      const renderRow = {
        user_id: user.id,
        input_url: estudo.source_image_url,
        output_url: latest.image_url,
        prompt: `estudo ${tipoLabel.toLowerCase()} · ${ESTUDO_VARIANTE_LABELS[variante]}`,
        ambient: 'estudo',
        style: `estudo:${variante}`,
        status: 'completed',
        completed_at: new Date().toISOString(),
        folder_id: targetFolder,
        ...(previewUrl ? { preview_url: previewUrl } : {}),
      }
      const ins = await admin
        .from('renders')
        .insert(renderRow as never)
        .select('id')
        .single<{ id: string }>()
      if (ins.error && (ins.error.code === 'PGRST204' || ins.error.code === '42703')) {
        // Fallback pré-migration de colunas novas (preview_url/folder_id).
        const retry = await admin
          .from('renders')
          .insert({
            user_id: user.id,
            input_url: estudo.source_image_url,
            output_url: latest.image_url,
            prompt: renderRow.prompt,
            ambient: 'estudo',
            style: renderRow.style,
            status: 'completed',
            completed_at: renderRow.completed_at,
          } as never)
          .select('id')
          .single<{ id: string }>()
        savedRenderId = retry.data?.id ?? null
      } else {
        savedRenderId = ins.data?.id ?? null
      }
      if (!savedRenderId) {
        console.error('[estudar] insert em renders falhou:', ins.error)
        return NextResponse.json({ error: 'Falha ao salvar no Histórico' }, { status: 500 })
      }
      patch.saved_render_id = savedRenderId
    }
  } else if (folderId !== undefined && savedRenderId) {
    // Mudança de projeto depois de já salvo: mantém o render em sincronia.
    await admin
      .from('renders')
      .update({ folder_id: folderId } as never)
      .eq('id', savedRenderId)
      .eq('user_id', user.id)
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin
      .from('estudos')
      .update(patch as never)
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) {
      console.error('[estudar] PATCH falhou:', error)
      return NextResponse.json({ error: 'Falha ao salvar' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, savedRenderId })
}
