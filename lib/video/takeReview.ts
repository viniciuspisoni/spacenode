// Benchmark gate, deliberately independent of generation success or aesthetics.
// Values must come from an actual review of the source and full video.
export const TAKE_REVIEW_CRITERIA = [
  'geometry', 'materials', 'cameraPath', 'singleTake', 'lightingAndEnvironment', 'referenceSupport',
] as const
export type TakeReviewCriterion = typeof TAKE_REVIEW_CRITERIA[number]
export type TakeReviewVerdict = 'pass' | 'fail' | 'unverified'
export interface TakeReviewEvidence {
  verdict: TakeReviewVerdict
  evidence?: string
}
export interface ArchitecturalTakeReview {
  watchedFullClip: boolean
  comparedReference: boolean
  reviewedFractions: number[]
  criteria: Partial<Record<TakeReviewCriterion, TakeReviewEvidence>>
}
export function assessArchitecturalTakeReview(review: ArchitecturalTakeReview): {
  verdict: 'approved' | 'rejected' | 'inconclusive'
  reasons: string[]
} {
  const failures: string[] = []
  const missing: string[] = []
  for (const criterion of TAKE_REVIEW_CRITERIA) {
    const item = review.criteria[criterion]
    if (item?.verdict === 'fail' && item.evidence?.trim()) failures.push(criterion)
    else if (item?.verdict !== 'pass' || !item.evidence?.trim()) missing.push(criterion)
  }
  // Any documented breach rejects the clip; a good average cannot hide it.
  if (failures.length) return { verdict: 'rejected', reasons: failures }
  if (!review.watchedFullClip) missing.push('full-clip-not-watched')
  if (!review.comparedReference) missing.push('reference-not-compared')
  if (![0, 0.25, 0.5, 0.75, 1].every(target => review.reviewedFractions.includes(target))) {
    missing.push('frame-coverage-incomplete')
  }
  return missing.length
    ? { verdict: 'inconclusive', reasons: missing }
    : { verdict: 'approved', reasons: [] }
}
