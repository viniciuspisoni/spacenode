import { NextRequest, NextResponse } from 'next/server'
import { staffOr404, errorResponse } from '@/lib/marketing/api'
import { generateBriefContent } from '@/lib/marketing/generation'
import { createVersion, getBrief, updateBrief } from '@/lib/marketing/service'

type Params = { params: Promise<{ id: string }> }

// Geração assistida por IA para um briefing existente. Com { apply: true },
// escreve o resultado no briefing (que precisa estar editável) e cria uma
// versão — SEMPRE como rascunho: a revisão humana continua obrigatória.

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await staffOr404()
  if (!gate.ok) return gate.res
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const brief = await getBrief(gate.ctx.admin, id)

    // Com apply=true o resultado é escrito no briefing, o que só é permitido em
    // rascunho/alterações solicitadas. Checa ANTES de chamar a IA — senão uma
    // geração paga é gasta e um automation_run é registrado para um briefing que
    // não pode receber o resultado (updateBrief lançaria só no fim). Preview
    // (apply != true) continua liberado em qualquer status.
    if (body.apply === true && brief.status !== 'brief_draft' && brief.status !== 'changes_requested') {
      return NextResponse.json(
        { error: `Briefing em "${brief.status}" não é editável — gere apenas como pré-visualização` },
        { status: 409 },
      )
    }

    const outcome = await generateBriefContent(
      gate.ctx.admin,
      {
        theme: String(body.theme ?? brief.title),
        pillar: body.pillar ?? brief.pillar,
        format: body.format ?? brief.format,
        platform: body.platform ?? brief.platform,
        objective: body.objective ?? null,
        targetAudience: body.target_audience ?? brief.target_audience,
        featureDescription: body.feature_description ?? null,
        desiredCta: body.desired_cta ?? brief.call_to_action,
        availableAssets: Array.isArray(body.available_assets) ? body.available_assets : undefined,
        extraContext: body.extra_context ?? null,
      },
      gate.ctx.user.id,
      id,
    )

    let updated = null
    if (body.apply === true) {
      const c = outcome.content
      updated = await updateBrief(gate.ctx.admin, id, {
        title: c.title,
        hook: c.hook,
        central_message: c.central_message,
        format: c.format || brief.format,
        platform: c.platform || brief.platform,
        script: c.slides.length ? c.slides.map((s, i) => `Slide ${i + 1}: ${s}`).join('\n') : c.script,
        caption: c.caption,
        call_to_action: c.call_to_action,
        visual_direction: c.visual_direction,
        required_assets: c.required_assets,
      })
      await createVersion(
        gate.ctx.admin, id,
        `Gerado por IA (${outcome.provider}/${outcome.model})`, gate.ctx.user.id,
      )
    }

    return NextResponse.json({ ...outcome, brief: updated })
  } catch (err) {
    return errorResponse(err)
  }
}
