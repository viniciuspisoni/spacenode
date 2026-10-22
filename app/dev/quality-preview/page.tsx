import { notFound } from 'next/navigation'
import QualityReviewFixture from '@/tests/fixtures/quality-review'
export const metadata = { robots: { index: false, follow: false } }
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <QualityReviewFixture />
}
