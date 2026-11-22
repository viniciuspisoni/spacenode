export function isLandingReview() {
  return process.env.VERCEL_ENV === 'preview' && process.env.SPACENODE_LANDING_REVIEW === '1'
}
