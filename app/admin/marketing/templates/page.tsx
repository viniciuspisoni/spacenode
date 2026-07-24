import { getMarketingStaffContext } from '@/lib/marketing/auth'
import { listTemplates } from '@/lib/marketing/service'

// Templates conceituais registrados no banco (seed da migration). Estrutura,
// proporção, campos dinâmicos e regras de uso — a integração com Canva é
// futura (integration-roadmap.md §2) e preencherá external_template_id.

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const ctx = await getMarketingStaffContext()
  if (!ctx) return null

  const templates = await listTemplates(ctx.admin)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Templates</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Estruturas conceituais de arte. A produção hoje usa os templates HTML do content-factory;
          a integração com Canva é etapa futura.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center text-sm text-text-tertiary">
          Nenhum template registrado — aplique a migration de seed (20260713000001_marketing_seed.sql)
          no ambiente apropriado.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map(tpl => {
            const rules = tpl.visual_rules as { campos_dinamicos?: string[]; regras_de_uso?: string[] }
            return (
              <div key={tpl.id} className="rounded-xl border border-border bg-bg-elevated p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-medium">{tpl.name}</h2>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
                    {tpl.aspect_ratio ?? '—'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">{tpl.description}</p>
                <div className="mt-3 space-y-2 text-xs text-text-tertiary">
                  <div>
                    <span className="text-text-secondary">Formato:</span> {tpl.format} · {tpl.platform} · {tpl.template_provider}
                  </div>
                  {rules.campos_dinamicos && (
                    <div>
                      <span className="text-text-secondary">Campos dinâmicos:</span>{' '}
                      {rules.campos_dinamicos.join(', ')}
                    </div>
                  )}
                  {rules.regras_de_uso && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {rules.regras_de_uso.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
