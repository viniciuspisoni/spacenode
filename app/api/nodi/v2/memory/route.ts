// /api/nodi/v2/memory — memória de projeto (flag NODI_PROJECT_MEMORY_ENABLED)
//
// GET  ?spaceId= → memória do próprio usuário naquele projeto.
// POST { spaceId, patch } → grava APÓS a confirmação do usuário no painel
//   (a proposta nasce da tool propor_memoria; nada é salvo automaticamente).
// Escrita com o client do usuário — RLS da nodi_project_memory fecha o
// isolamento. Migration ausente → 503 honesto (pendência documentada).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { isNodiEnabled } from '@/lib/nodi/flags'
import { isNodiV2EnabledFor, isNodiProjectMemoryEnabled } from '@/lib/nodi/v2/flags'
import { readProjectMemory, saveProjectMemory, sanitizeMemoryPatch, memoryPatchIsEmpty } from '@/lib/nodi/v2/memory'
import { logNodiEvent } from '@/lib/nodi/telemetry'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function guard() {
  if (!isNodiEnabled() || !isNodiProjectMemoryEnabled()) {
    return { error: NextResponse.json({ error: 'Não disponível' }, { status: 404 }) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  const admin = createAdminClient()
  if (!(await isNodiV2EnabledFor(admin, user))) {
    return { error: NextResponse.json({ error: 'Não disponível' }, { status: 404 }) }
  }
  return { supabase, admin, user }
}

export async function GET(req: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const spaceId = new URL(req.url).searchParams.get('spaceId') ?? ''
  if (!UUID_RE.test(spaceId)) return NextResponse.json({ error: 'spaceId inválido' }, { status: 400 })
  const memory = await readProjectMemory(g.supabase, g.user.id, spaceId)
  return NextResponse.json({ memory })
}

export async function POST(req: Request) {
  const g = await guard()
  if ('error' in g) return g.error

  const rl = await rateLimit(g.admin, `nodi-v2-memory:${g.user.id}`, 10, 60)
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas gravações em sequência. Aguarde um instante.' }, { status: 429 })

  const body = await req.json().catch(() => null) as { spaceId?: unknown; patch?: unknown } | null
  const spaceId = typeof body?.spaceId === 'string' ? body.spaceId : ''
  if (!UUID_RE.test(spaceId)) return NextResponse.json({ error: 'spaceId inválido' }, { status: 400 })

  const patch = sanitizeMemoryPatch(body?.patch)
  if (memoryPatchIsEmpty(patch)) return NextResponse.json({ error: 'Nada para salvar' }, { status: 400 })

  try {
    const memory = await saveProjectMemory(g.supabase, g.user.id, spaceId, patch)
    void logNodiEvent(g.admin, { userId: g.user.id, event: 'v2_memory_saved', module: null })
    return NextResponse.json({ memory })
  } catch (err) {
    if ((err as Error)?.message === 'MEMORY_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'A memória de projeto ainda não está disponível neste ambiente.' },
        { status: 503 },
      )
    }
    console.error('[nodi-v2] falha ao salvar memória:', (err as Error)?.message)
    return NextResponse.json({ error: 'Não consegui salvar agora. Tente de novo em instantes.' }, { status: 500 })
  }
}
