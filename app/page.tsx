import { isLandingReview } from '@/lib/landing-review'
import EditorialHome from './EditorialHome'

export default function Home() {
  return <EditorialHome review={isLandingReview()} />
}
