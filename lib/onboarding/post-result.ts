import { getPlanById } from '@/lib/plans'

export const POST_RESULT_VERSION = '2026-10-25'
export const POST_RESULT_BILLING_HREF = '/app/billing?from=render_result&plan=essence&billing=monthly#plan-essence'

/** A capacity estimate, never a promise of image quality or a fixed unit price. */
export function postResultCapacity(nodeCost: number): number | null {
  const nodes = getPlanById('essence')!.nodes
  return Number.isFinite(nodeCost) && nodeCost > 0 && nodeCost <= nodes
    ? Math.floor(nodes / nodeCost) : null
}

export function isPostResultBillingEntry(params: { from?: string }): boolean {
  return params.from === 'render_result'
}

/** This entry selects a visible monthly card, and never resumes checkout. */
export function postResultBillingPlan(
  params: { from?: string; plan?: string; billing?: string },
  eligible: boolean,
): 'essence' | null {
  return eligible && isPostResultBillingEntry(params) && params.plan === 'essence' && params.billing === 'monthly'
    ? 'essence' : null
}
